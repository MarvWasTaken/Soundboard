import type { AudioRange, Sound } from './model.ts';
import { AppError } from './errors.ts';
export type TrimDraft = { startText: string; endText: string; startValue: number; endValue: number };
export function validateRange(range: AudioRange, duration: number): void {
  if (!Number.isFinite(duration) || !Number.isFinite(range.start) || !Number.isFinite(range.end)
    || range.start < 0 || range.start >= range.end || range.end > duration) {
    throw new AppError('invalid', 'Bitte gültige Zeiten angeben: 0 ≤ Start < Ende ≤ Audiodauer.');
  }
}
const displayTime = (value: number) => String(Number(value.toFixed(3)));
export function createTrimDraft(sound: Sound): TrimDraft {
  return { startText: displayTime(sound.trimStartSeconds), endText: displayTime(sound.trimEndSeconds), startValue: sound.trimStartSeconds, endValue: sound.trimEndSeconds };
}
function parseTime(text: string) {
  const normalized = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) throw new AppError('invalid', 'Bitte Start und Ende als Sekunden eingeben, zum Beispiel 0,5.');
  return Number(normalized);
}
export function rangeFromDraft(draft: TrimDraft, duration: number): AudioRange {
  // Unedited rounded fields must retain their original, full precision values.
  const range = {
    start: draft.startText === displayTime(draft.startValue) ? draft.startValue : parseTime(draft.startText),
    end: draft.endText === displayTime(draft.endValue) ? draft.endValue : parseTime(draft.endText),
  };
  validateRange(range, duration); return range;
}
