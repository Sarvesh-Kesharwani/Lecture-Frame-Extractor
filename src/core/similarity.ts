export interface AnalysisFrame {
  timestamp: number;
  pixels: Uint8Array;
  width: number;
  height: number;
  density: number;
  changeScore: number;
  previewDataUrl: string;
}

export function analyzeCanvas(canvas: HTMLCanvasElement, timestamp: number, previewDataUrl = ''): AnalysisFrame {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable.');
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height);
  let edges = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = y * canvas.width + x;
      const p = i * 4;
      pixels[i] = Math.round(rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114);
      if (x > 0 && Math.abs(pixels[i] - pixels[i - 1]) > 28) edges += 1;
      if (y > 0 && Math.abs(pixels[i] - pixels[i - canvas.width]) > 28) edges += 1;
    }
  }
  return { timestamp, pixels, width: canvas.width, height: canvas.height, density: edges / (canvas.width * canvas.height * 2), changeScore: 0, previewDataUrl };
}

/** Compares regions, excludes the bottom control strip, and trims localized motion. */
export function visualChange(a: AnalysisFrame, b: AnalysisFrame, trimLocalizedMotion = true): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  const blocksX = 8;
  const blocksY = 6;
  const blockScores: number[] = [];
  for (let by = 0; by < 5; by += 1) {
    const y0 = Math.floor((by * a.height) / blocksY);
    const y1 = Math.floor(((by + 1) * a.height) / blocksY);
    for (let bx = 0; bx < blocksX; bx += 1) {
      const x0 = Math.floor((bx * a.width) / blocksX);
      const x1 = Math.floor(((bx + 1) * a.width) / blocksX);
      let total = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = y * a.width + x;
          total += Math.abs(a.pixels[i] - b.pixels[i]) / 255;
          count += 1;
        }
      }
      blockScores.push(count ? total / count : 0);
    }
  }
  blockScores.sort((x, y) => x - y);
  const robust = blockScores.slice(0, trimLocalizedMotion ? 36 : 40);
  const mean = robust.reduce((sum, value) => sum + value, 0) / robust.length;
  const changedFraction = robust.filter((value) => value > 0.08).length / robust.length;
  return mean * 0.55 + changedFraction * 0.45;
}
