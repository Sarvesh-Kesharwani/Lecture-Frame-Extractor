import { scaledAnalysisSize, type Preferences, type ExtractedFrame } from '../shared/types';
import type { VideoAdapter } from './adapters';
import { analyzeCanvas, visualChange, type AnalysisFrame } from './similarity';
import { selectFrames } from './selection';

export type Progress = (message: string, percent: number) => void;

function encodePixels(pixels: Uint8Array) {
  let binary = '';
  for (let i = 0; i < pixels.length; i += 1) binary += String.fromCharCode(pixels[i]);
  return btoa(binary);
}

function decodePixels(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

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
    return samples.map((frame) => ({ timestamp: frame.timestamp, dataUrl: frame.previewDataUrl, selected: selected.has(frame.timestamp), changeScore: frame.changeScore, signature: encodePixels(frame.pixels), density: frame.density, pixelWidth: previewCanvas.width, pixelHeight: previewCanvas.height }));
  } finally {
    try { await adapter.seek(originalTime); } catch { /* The page may have navigated away. */ }
    if (!wasPaused) void video.play().catch(() => undefined);
    analysisCanvas.width = 1;
    previewCanvas.width = 1;
    signatureCanvas.width = 1;
  }
}

/** Revisit only the user's final choices and capture them at the video's original resolution. No analysis is repeated. */
export async function captureSelectedFrames(adapter: VideoAdapter, frames: ExtractedFrame[], progress: Progress): Promise<ExtractedFrame[]> {
  const video = adapter.findVideo();
  if (!video || !video.videoWidth || !video.videoHeight) throw new Error('The original video is no longer available for final capture.');
  const originalTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const captured: ExtractedFrame[] = [];
  try {
    for (let i = 0; i < frames.length; i += 1) {
      try {
        await seekWithRetry(adapter, frames[i].timestamp);
        draw(video, canvas);
        captured.push({ ...frames[i], dataUrl: canvas.toDataURL('image/jpeg', 0.98), selected: true, pixelWidth: canvas.width, pixelHeight: canvas.height });
      } catch {
        // A single unavailable timestamp should not discard the remaining final choices.
      }
      progress(`Capturing final frames at ${canvas.width}×${canvas.height}… ${i + 1}/${frames.length}`, Math.round(((i + 1) / frames.length) * 100));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!captured.length) throw new Error('The player could not capture any selected frames. Let the video buffer and try again.');
    return captured;
  } finally {
    try { await adapter.seek(originalTime); } catch { /* The page may have navigated away. */ }
    if (!wasPaused) void video.play().catch(() => undefined);
    canvas.width = 1;
  }
}

/** Re-runs selection only from stored compact signatures; it never touches or seeks the video. */
export function filterStoredFrames(frames: ExtractedFrame[], preferences: Preferences): ExtractedFrame[] {
  const analysis = frames.map((frame) => ({
    timestamp: frame.timestamp,
    pixels: decodePixels(frame.signature),
    width: 64,
    height: 36,
    density: frame.density,
    changeScore: frame.changeScore,
    previewDataUrl: frame.dataUrl,
  }));
  const selected = new Set(selectFrames(analysis, preferences.mode, preferences.detail).map((frame) => frame.timestamp));
  return frames.map((frame) => ({ ...frame, selected: selected.has(frame.timestamp) }));
}
