import type { ExtractionMode } from '../shared/types';
import { visualChange, type AnalysisFrame } from './similarity';

export function selectFrames(samples: AnalysisFrame[], mode: ExtractionMode, sensitivity: number): AnalysisFrame[] {
  if (samples.length <= 2) return samples;
  const threshold = 0.19 - (sensitivity / 100) * 0.08;
  const segments: AnalysisFrame[][] = [[]];
  for (const sample of samples) {
    const current = segments.at(-1)!;
    const previous = current.at(-1);
    if (previous && visualChange(previous, sample) > threshold) segments.push([]);
    segments.at(-1)!.push(sample);
  }

  const chosen: AnalysisFrame[] = [];
  for (const segment of segments.filter((value) => value.length)) {
    const end = segment.at(-1)!;
    if (mode === 'auto' && segment.length >= 8) {
      const start = segment[0];
      const mid = segment[Math.floor(segment.length * 0.55)];
      if (visualChange(start, mid) > threshold * 0.58 && visualChange(mid, end) > threshold * 0.42) chosen.push(mid);
    }
    chosen.push(end);
  }

  const deduped: AnalysisFrame[] = [];
  for (const candidate of chosen) {
    const duplicate = deduped.some((kept) => visualChange(kept, candidate) < threshold * 0.28);
    if (!duplicate) deduped.push(candidate);
    else if (candidate.density > deduped.at(-1)!.density * 1.08) deduped[deduped.length - 1] = candidate;
  }
  return deduped;
}
