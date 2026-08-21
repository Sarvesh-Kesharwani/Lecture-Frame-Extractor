import { scaledAnalysisSize, type Preferences, type ExtractedFrame } from '../shared/types';
import type { VideoAdapter } from './adapters';
import { analyzeCanvas, visualChange, type AnalysisFrame } from './similarity';
import { selectFrames } from './selection';

export type Progress = (message: string, percent: number) => void;

async function seekWithRetry(adapter: VideoAdapter, timestamp: number, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { await adapter.seek(timestamp); return; }
    catch (error) { lastError = error; await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250)); }
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
  const analysisSize = scaledAnalysisSize(video.videoWidth, video.videoHeight, preferences.analysisScale);
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = analysisSize.width;
  analysisCanvas.height = analysisSize.height;
  const previewCanvas = document.createElement('canvas');
  const previewScale = Math.min(1, 480 / video.videoWidth);
  previewCanvas.width = Math.max(1, Math.round(video.videoWidth * previewScale));
  previewCanvas.height = Math.max(1, Math.round(video.videoHeight * previewScale));
  const signatureCanvas = document.createElement('canvas');
  signatureCanvas.width = 64;
  signatureCanvas.height = 36;
  const samples: AnalysisFrame[] = [];
  let previousFullAnalysis: AnalysisFrame | undefined;

  try {
    for (let i = 0; i <= sampleCount; i += 1) {
      const timestamp = Math.min(duration - 0.1, i * interval);
      try { await seekWithRetry(adapter, timestamp); }
      catch { progress(`Skipped unavailable timestamp… ${i + 1}/${sampleCount + 1}`, Math.round((i / sampleCount) * 95)); continue; }
      try {
        draw(video, analysisCanvas);
        draw(video, previewCanvas);
        const fullAnalysis = analyzeCanvas(analysisCanvas, timestamp);
        const signatureContext = signatureCanvas.getContext('2d', { willReadFrequently: true });
        if (!signatureContext) throw new Error('Canvas signature rendering is unavailable.');
        signatureContext.drawImage(analysisCanvas, 0, 0, signatureCanvas.width, signatureCanvas.height);
        const sample = analyzeCanvas(signatureCanvas, timestamp, previewCanvas.toDataURL('image/jpeg', 0.62));
        if (previousFullAnalysis) sample.changeScore = visualChange(previousFullAnalysis, fullAnalysis);
        sample.density = fullAnalysis.density;
        samples.push(sample);
        previousFullAnalysis = fullAnalysis;
      } catch {
        throw new Error('This player blocks frame access (CORS, DRM, protected media, or iframe isolation). The extension cannot bypass browser security.');
      }
      progress(`Analyzing once at ${analysisSize.width}×${analysisSize.height}… ${i + 1}/${sampleCount + 1}`, Math.round((i / sampleCount) * 95));
      if (i % 6 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (samples.length < 2) throw new Error('The player repeatedly failed to seek. Check that the video is fully loaded and seekable, then try again.');
    const selected = new Set(selectFrames(samples, preferences.mode, preferences.detail).map((frame) => frame.timestamp));
    progress(`Selected ${selected.size} of ${samples.length} analyzed frames`, 100);
    return samples.map((frame) => ({ timestamp: frame.timestamp, dataUrl: frame.previewDataUrl, selected: selected.has(frame.timestamp), changeScore: frame.changeScore }));
  } finally {
    try { await adapter.seek(originalTime); } catch { /* The page may have navigated away. */ }
    if (!wasPaused) void video.play().catch(() => undefined);
    analysisCanvas.width = 1;
    previewCanvas.width = 1;
    signatureCanvas.width = 1;
  }
}
