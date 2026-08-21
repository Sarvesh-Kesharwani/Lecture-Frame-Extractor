export interface AnalysisFrame {
  timestamp: number;
  pixels: Uint8Array;
  density: number;
}

const WIDTH = 32;
const HEIGHT = 18;

export function analyzeCanvas(canvas: HTMLCanvasElement, timestamp: number): AnalysisFrame {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable.');
  const rgba = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  let edges = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const i = y * WIDTH + x;
      const p = i * 4;
      pixels[i] = Math.round(rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114);
      if (x > 0 && Math.abs(pixels[i] - pixels[i - 1]) > 28) edges += 1;
      if (y > 0 && Math.abs(pixels[i] - pixels[i - WIDTH]) > 28) edges += 1;
    }
  }
  return { timestamp, pixels, density: edges / (WIDTH * HEIGHT * 2) };
}

/** Robust whole-frame change: ignores the noisiest blocks (cursor/webcam) and player-control strip. */
export function visualChange(a: AnalysisFrame, b: AnalysisFrame): number {
  const blockScores: number[] = [];
  const blockW = 4;
  const blockH = 3;
  for (let by = 0; by < 5; by += 1) {
    for (let bx = 0; bx < 8; bx += 1) {
      let total = 0;
      for (let y = by * blockH; y < by * blockH + blockH; y += 1) {
        for (let x = bx * blockW; x < bx * blockW + blockW; x += 1) {
          const i = y * WIDTH + x;
          total += Math.abs(a.pixels[i] - b.pixels[i]) / 255;
        }
      }
      blockScores.push(total / (blockW * blockH));
    }
  }
  blockScores.sort((x, y) => x - y);
  const robust = blockScores.slice(0, 34);
  const mean = robust.reduce((sum, value) => sum + value, 0) / robust.length;
  const changedFraction = robust.filter((value) => value > 0.12).length / robust.length;
  return mean * 0.65 + changedFraction * 0.35;
}

export const analysisSize = { width: WIDTH, height: HEIGHT };
