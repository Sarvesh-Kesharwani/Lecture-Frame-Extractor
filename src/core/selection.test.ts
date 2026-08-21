import { describe, expect, it } from 'vitest';
import { selectFrames } from './selection';
import { visualChange, type AnalysisFrame } from './similarity';

const frame = (timestamp: number, value: number, density = 0.1): AnalysisFrame => ({ timestamp, pixels: new Uint8Array(32 * 18).fill(value), width: 32, height: 18, density, changeScore: timestamp === 3 || timestamp === 5 ? 1 : 0, previewDataUrl: '' });

describe('frame selection', () => {
  it('recognizes major visual changes', () => expect(visualChange(frame(0, 0), frame(1, 255))).toBeGreaterThan(0.5));
  it('keeps the end of each contextual visual state', () => {
    const samples = [frame(0, 0), frame(1, 2), frame(2, 4), frame(3, 220), frame(4, 222), frame(5, 4)];
    expect(selectFrames(samples, 'minimum', 'balanced').map((item) => item.timestamp)).toEqual([2, 4, 5]);
  });
});
