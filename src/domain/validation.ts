import { emptyState } from './model.ts';
import type { Board, BoardButton, LoadResult, Sound } from './model.ts';
import { overlaps, validLayout } from './board.ts';
export const validAssetKey = (key: unknown): key is string => typeof key === 'string' && /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(key);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const name = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
function validSound(value: unknown): value is Sound {
  if (!record(value)) return false;
  const { durationSeconds: duration, trimStartSeconds: start, trimEndSeconds: end } = value;
  return name(value.id) && name(value.name) && validAssetKey(value.assetKey)
    && typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    && typeof start === 'number' && Number.isFinite(start) && start >= 0
    && typeof end === 'number' && Number.isFinite(end) && start < end && end <= duration;
}
function validButton(value: unknown): value is BoardButton {
  if (!record(value) || !name(value.id) || !name(value.label) || !name(value.soundId)) return false;
  const { x, y, width, height } = value;
  return typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number'
    && validLayout({ x, y, width, height });
}
export function recoverState(raw: unknown): LoadResult {
  const result: LoadResult = { state: emptyState(), warnings: [], readOnly: false, unavailable: [] };
  if (raw === undefined || raw === null) return result;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { result.readOnly = true; result.warnings.push('Die gespeicherten Daten sind beschädigt. Sie bleiben erhalten. Bitte erneut laden.'); return result; }
  }
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.sounds) || !Array.isArray(raw.boards)) {
    result.readOnly = true; result.warnings.push('Diese gespeicherte Datenversion kann nicht sicher geöffnet werden. Die Originaldaten bleiben erhalten.'); return result;
  }
  const ids = new Set<string>();
  for (const candidate of raw.sounds) {
    if (validSound(candidate) && !ids.has(candidate.id)) { result.state.sounds.push(candidate); ids.add(candidate.id); }
    else result.warnings.push('Ein beschädigter Soundeintrag konnte nicht geladen werden.');
  }
  const boardIds = new Set<string>();
  for (const board of raw.boards) {
    if (!record(board) || !name(board.id) || !name(board.name) || !Array.isArray(board.buttons) || boardIds.has(board.id)) {
      result.warnings.push('Ein beschädigtes Board konnte nicht geladen werden.'); continue;
    }
    boardIds.add(board.id);
    const recovered: Board = { id: board.id, name: board.name, buttons: [] };
    for (const button of board.buttons) {
      if (!validButton(button) || recovered.buttons.some(existing => existing.id === button.id || overlaps(existing, button))) {
        result.warnings.push(`Ein ungültiger oder überlappender Button auf „${board.name}“ konnte nicht geladen werden.`); continue;
      }
      recovered.buttons.push(button);
      if (!ids.has(button.soundId)) result.warnings.push(`Der Sound des Buttons „${button.label}“ ist nicht verfügbar. Bitte neu zuweisen.`);
    }
    result.state.boards.push(recovered);
  }
  return result;
}
