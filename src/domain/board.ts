import type { Board, BoardButton, LibraryState } from './model.ts';
import { AppError } from './errors.ts';
export type ButtonLayout = Pick<BoardButton, 'x' | 'y' | 'width' | 'height'>;
export type ButtonDraft = ButtonLayout & Pick<BoardButton, 'label' | 'soundId'>;
export function cleanName(value: string, kind: string) {
  if (!value.trim()) throw new AppError('invalid', `Bitte ${kind} eingeben.`);
  return value.trim();
}
export function validLayout(layout: ButtonLayout) {
  return Number.isSafeInteger(layout.x) && Number.isSafeInteger(layout.y) && layout.x >= 0 && layout.y >= 0
    && (layout.width === 1 || layout.width === 2) && (layout.height === 1 || layout.height === 2)
    && layout.x + layout.width <= 2 && Number.isSafeInteger(layout.y + layout.height);
}
export function overlaps(a: ButtonLayout, b: ButtonLayout) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
export function validatePlacement(buttons: BoardButton[], layout: ButtonLayout, ignoreId?: string) {
  if (!validLayout(layout)) throw new AppError('invalid', 'Der Button muss im Raster bleiben. Erlaubt sind eine oder zwei Spalten und Zeilen.');
  if (buttons.some(button => button.id !== ignoreId && overlaps(button, layout))) throw new AppError('invalid', 'Hier ist nicht genug Platz. Der Button würde einen anderen überlappen. Bitte erst auf eine freie Position verschieben.');
}
export function firstFreePosition(buttons: BoardButton[], width = 1, height = 1) {
  if (!validLayout({ x: 0, y: 0, width, height })) throw new AppError('invalid', 'Ungültige Buttongröße.');
  for (let y = 0; ; y++) {
    for (let x = 0; x <= 2 - width; x++) {
      if (!buttons.some(button => overlaps(button, { x, y, width, height }))) return { x, y };
    }
  }
}
function requireBoard(state: LibraryState, id: string) {
  const board = state.boards.find(entry => entry.id === id);
  if (!board) throw new AppError('missing', 'Dieses Board ist nicht mehr verfügbar.');
  return board;
}
function replaceBoard(state: LibraryState, board: Board) {
  return { ...state, boards: state.boards.map(entry => entry.id === board.id ? board : entry) };
}
function requireSound(state: LibraryState, soundId: string) {
  if (!state.sounds.some(sound => sound.id === soundId)) throw new AppError('invalid', 'Bitte einen verfügbaren Sound aus der Bibliothek auswählen.');
}
export function createBoard(state: LibraryState, id: string, name: string): LibraryState {
  if (state.boards.some(board => board.id === id)) throw new AppError('invalid', 'Dieses Board existiert bereits.');
  return { ...state, boards: [...state.boards, { id, name: cleanName(name, 'einen Boardnamen'), buttons: [] }] };
}
export function renameBoard(state: LibraryState, id: string, name: string) {
  return replaceBoard(state, { ...requireBoard(state, id), name: cleanName(name, 'einen Boardnamen') });
}
export function deleteBoard(state: LibraryState, id: string) {
  requireBoard(state, id); return { ...state, boards: state.boards.filter(board => board.id !== id) };
}
export function createButton(state: LibraryState, boardId: string, id: string, label: string, soundId: string) {
  const board = requireBoard(state, boardId); requireSound(state, soundId);
  if (board.buttons.some(button => button.id === id)) throw new AppError('invalid', 'Dieser Button existiert bereits.');
  const button = { id, label: cleanName(label, 'eine Beschriftung'), soundId, ...firstFreePosition(board.buttons), width: 1, height: 1 };
  return replaceBoard(state, { ...board, buttons: [...board.buttons, button] });
}
export function updateButton(state: LibraryState, boardId: string, id: string, draft: ButtonDraft) {
  const board = requireBoard(state, boardId); requireSound(state, draft.soundId);
  if (!board.buttons.some(button => button.id === id)) throw new AppError('missing', 'Dieser Button ist nicht mehr verfügbar.');
  validatePlacement(board.buttons, draft, id);
  const button = { id, label: cleanName(draft.label, 'eine Beschriftung'), soundId: draft.soundId, x: draft.x, y: draft.y, width: draft.width, height: draft.height };
  return replaceBoard(state, { ...board, buttons: board.buttons.map(entry => entry.id === id ? button : entry) });
}
export function deleteButton(state: LibraryState, boardId: string, id: string) {
  const board = requireBoard(state, boardId);
  return replaceBoard(state, { ...board, buttons: board.buttons.filter(button => button.id !== id) });
}
