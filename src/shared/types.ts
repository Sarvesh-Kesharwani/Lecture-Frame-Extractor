export type ExtractionMode = 'auto' | 'minimum';
export type FrameDetail = 'compact' | 'balanced' | 'detailed';

export interface Preferences {
  mode: ExtractionMode;
  detail: FrameDetail;
}

export interface ExtractedFrame {
  timestamp: number;
  dataUrl: string;
}

export const DEFAULT_PREFERENCES: Preferences = { mode: 'auto', detail: 'balanced' };

export function normalizePreferences(value: Partial<Preferences> & { sensitivity?: number }): Preferences {
  const detail = value.detail ?? (value.sensitivity == null ? 'balanced' : value.sensitivity >= 75 ? 'detailed' : value.sensitivity <= 35 ? 'compact' : 'balanced');
  return { mode: value.mode === 'minimum' ? 'minimum' : 'auto', detail };
}

export type RuntimeMessage =
  | { type: 'LFE_START'; preferences?: Preferences }
  | { type: 'LFE_STATUS' };
