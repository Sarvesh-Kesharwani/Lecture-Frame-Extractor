import type { ExtractionMode, FrameDetail } from '../shared/types';
import { visualChange, type AnalysisFrame } from './similarity';

export function selectFrames(samples: AnalysisFrame[], mode: ExtractionMode, detail: FrameDetail): AnalysisFrame[] {
  if (samples.length <= 2) return samples;
  const cutThreshold = { compact: 0.19, balanced: 0.14, detailed: 0.09 }[detail];
  const evolutionThreshold = { compact: 0.13, balanced: 0.085, detailed: 0.045 }[detail];
  const segments: AnalysisFrame[][] = [[]];
  for (const sample of samples) {
    if (sample.changeScore > cutThreshold && segments.at(-1)!.length) segments.push([]);
    segments.at(-1)!.push(sample);
  }

  const chosen: AnalysisFrame[] = [];
  for (const segment of segments.filter((value) => value.length)) {
    if (mode === 'auto') {
      let anchor = segment[0];
      for (let i = 2; i < segment.length - 1; i += 1) {
        const candidate = segment[i];
        if (visualChange(anchor, candidate, false) >= evolutionThreshold) {
          chosen.push(candidate);
          anchor = candidate;
          i += detail === 'detailed' ? 1 : 2;
        }
      }
    }
    chosen.push(segment.at(-1)!);
  }

  const deduped: AnalysisFrame[] = [];
  for (const candidate of chosen) {
    const previous = deduped.at(-1);
    if (!previous || visualChange(previous, candidate, false) >= evolutionThreshold * 0.32) deduped.push(candidate);
    else if (candidate.density > previous.density * 1.05) deduped[deduped.length - 1] = candidate;
  }
  return deduped;
}
