export type ExtractionMode = 'auto' | 'minimum';

export interface Preferences {
  mode: ExtractionMode;
  sensitivity: number;
}

export interface ExtractedFrame {
  timestamp: number;
  dataUrl: string;
}

export const DEFAULT_PREFERENCES: Preferences = { mode: 'auto', sensitivity: 50 };

export type RuntimeMessage =
  | { type: 'LFE_START'; preferences?: Preferences }
  | { type: 'LFE_STATUS' };
