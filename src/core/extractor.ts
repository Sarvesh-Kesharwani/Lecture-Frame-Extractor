import type { Preferences, ExtractedFrame } from '../shared/types';
import type { VideoAdapter } from './adapters';
import { analysisSize, analyzeCanvas, type AnalysisFrame } from './similarity';
import { selectFrames } from './selection';

export type Progress = (message: string, percent: number) => void;

async function seekWithRetry(adapter: VideoAdapter, timestamp: number, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { await adapter.seek(timestamp); return; }
    catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

function draw(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas rendering is unavailable.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
}

export async function extractFrames(adapter: VideoAdapter, preferences: Preferences, progress: Progress): Promise<ExtractedFrame[]> {
  const video = adapter.findVideo();
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) throw new Error('No ready, seekable lecture video was found.');
  const originalTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();
  const duration = video.duration;
  const sampleCount = Math.min(360, Math.max(50, Math.ceil(duration / (preferences.mode === 'minimum' ? 24 : 16))));
  const interval = duration / sampleCount;
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisSize.width;
  analysisCanvas.height = analysisSize.height;
  const samples: AnalysisFrame[] = [];

  try {
    for (let i = 0; i <= sampleCount; i += 1) {
      const timestamp = Math.min(duration - 0.1, i * interval);
      try {
        await seekWithRetry(adapter, timestamp);
      } catch {
        progress(`Player skipped an unavailable timestamp… ${i + 1}/${sampleCount + 1}`, Math.round((i / sampleCount) * 72));
        continue;
      }
      try {
        draw(video, analysisCanvas);
        samples.push(analyzeCanvas(analysisCanvas, timestamp));
      } catch {
        throw new Error('This player blocks frame access (CORS, DRM, protected media, or iframe isolation). The extension cannot bypass browser security.');
      }
      progress(`Analyzing visual changes… ${i + 1}/${sampleCount + 1}`, Math.round((i / sampleCount) * 72));
      if (i % 8 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (samples.length < 2) throw new Error('The player repeatedly failed to seek. Check that the video is fully loaded and seekable, then try again.');
    const selected = selectFrames(samples, preferences.mode, preferences.detail);
    if (!selected.length) throw new Error('No meaningful frames were detected.');
    const highCanvas = document.createElement('canvas');
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    highCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    highCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < selected.length; i += 1) {
      try { await seekWithRetry(adapter, selected[i].timestamp); }
      catch { continue; }
      draw(video, highCanvas);
      frames.push({ timestamp: selected[i].timestamp, dataUrl: highCanvas.toDataURL('image/jpeg', 0.9) });
      progress(`Capturing useful frames… ${i + 1}/${selected.length}`, 75 + Math.round(((i + 1) / selected.length) * 24));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!frames.length) throw new Error('The player could not revisit the selected timestamps. Let the video buffer and try again.');
    progress(`Found ${frames.length} meaningful frames`, 100);
    return frames;
  } finally {
    try { await adapter.seek(originalTime); } catch { /* The page may have navigated away. */ }
    if (!wasPaused) void video.play().catch(() => undefined);
    analysisCanvas.width = 1;
    analysisCanvas.height = 1;
  }
}
