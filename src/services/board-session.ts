import type { BoardButton, LibraryState } from '../domain/model.ts';
import type { Playback } from './playback.ts';
import { AppError } from '../domain/errors.ts';
export type BoardMode = 'play' | 'edit';
export class BoardSession {
  state: { boardId?: string; mode: BoardMode } = { mode: 'play' };
  private getState: () => LibraryState;
  private playback: Pick<Playback, 'play' | 'stop'>;
  constructor(getState: () => LibraryState, playback: Pick<Playback, 'play' | 'stop'>) { this.getState = getState; this.playback = playback; }
  reconcile() {
    const boards = this.getState().boards;
    if (!boards.some(board => board.id === this.state.boardId)) this.selectBoard(boards[0]?.id);
  }
  selectBoard(id?: string) {
    if (id && !this.getState().boards.some(board => board.id === id)) throw new AppError('missing', 'Dieses Board ist nicht mehr verfügbar.');
    if (id !== this.state.boardId) { this.playback.stop(); this.state = { ...this.state, boardId: id }; }
  }
  setMode(mode: BoardMode) {
    if (mode !== this.state.mode) { this.playback.stop(); this.state = { ...this.state, mode }; }
  }
  activate(buttonId: string): BoardButton | undefined {
    const state = this.getState();
    const button = state.boards.find(board => board.id === this.state.boardId)?.buttons.find(entry => entry.id === buttonId);
    if (!button) throw new AppError('missing', 'Dieser Button ist nicht mehr verfügbar.');
    if (this.state.mode === 'edit') return button;
    const sound = state.sounds.find(entry => entry.id === button.soundId);
    if (!sound) throw new AppError('missing', 'Der Sound dieses Buttons ist nicht verfügbar. Bitte im Bearbeitungsmodus neu zuweisen.');
    void this.playback.play(sound); return undefined;
  }
}
