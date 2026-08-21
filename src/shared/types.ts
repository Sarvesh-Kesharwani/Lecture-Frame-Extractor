export type ExtractionMode = 'auto' | 'minimum';
export type FrameDetail = 'compact' | 'balanced' | 'detailed';

export interface Preferences {
  mode: ExtractionMode;
  detail: FrameDetail;
  analysisScale: number;
}

export interface ExtractedFrame {
  timestamp: number;
  dataUrl: string;
  selected: boolean;
  changeScore: number;
}

export const DEFAULT_PREFERENCES: Preferences = { mode: 'auto', detail: 'balanced', analysisScale: 35 };

export function normalizePreferences(value: Partial<Preferences> & { sensitivity?: number }): Preferences {
  const detail = value.detail ?? (value.sensitivity == null ? 'balanced' : value.sensitivity >= 75 ? 'detailed' : value.sensitivity <= 35 ? 'compact' : 'balanced');
  const analysisScale = Math.max(0, Math.min(100, Number(value.analysisScale ?? 35)));
  return { mode: value.mode === 'minimum' ? 'minimum' : 'auto', detail, analysisScale };
}

export function scaledAnalysisSize(videoWidth: number, videoHeight: number, scale: number) {
  const ratio = Math.max(0, Math.min(100, scale)) / 100;
  return {
    width: Math.max(32, Math.round(32 * Math.pow(videoWidth / 32, ratio))),
    height: Math.max(18, Math.round(18 * Math.pow(videoHeight / 18, ratio))),
  };
}

export type RuntimeMessage =
  | { type: 'LFE_START'; preferences?: Preferences }
  | { type: 'LFE_STATUS' };
