import type { Sound } from '../domain/model.ts';
import type { AudioPlayback, AudioRange, PlaybackHandle, Repository } from '../platform/contracts.ts';
import { AppError, errorMessage } from '../domain/errors.ts';
import { validateRange } from '../domain/trim.ts';
export type PlaybackState = { status: 'idle' | 'loading' | 'playing' | 'error'; soundId?: string; message?: string; positionSeconds?: number };
export type PositionScheduler = { set(callback: () => void, milliseconds: number): unknown; clear(token: unknown): void };
const positionScheduler: PositionScheduler = { set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: token => clearTimeout(token as ReturnType<typeof setTimeout>) };
export type BoardButtonOrigin = { boardId: string; buttonId: string };
export class Playback {
  state: PlaybackState = { status: 'idle' };
  private generation = 0;
  private boardOrigin?: BoardButtonOrigin;
  private pending?: AbortController;
  private handle?: PlaybackHandle;
  private positionTimer?: unknown;
  private scheduler: PositionScheduler;
  private listeners = new Set<(state: PlaybackState) => void>();
  private repository: Pick<Repository, 'resolve'>;
  private audio: AudioPlayback;
  constructor(repository: Pick<Repository, 'resolve'>, audio: AudioPlayback, scheduler = positionScheduler) { this.repository = repository; this.audio = audio; this.scheduler = scheduler; }
  private publish(state: PlaybackState) { this.state = state; this.listeners.forEach(listener => listener(state)); }
  subscribe(listener: (state: PlaybackState) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  stop() {
    this.generation++;
    this.boardOrigin = undefined;
    if (this.positionTimer !== undefined) this.scheduler.clear(this.positionTimer);
    this.positionTimer = undefined;
    this.pending?.abort(); this.pending = undefined;
    const handle = this.handle; this.handle = undefined; handle?.stop();
    this.publish({ status: 'idle' });
  }
  private trackPosition(soundId: string, range: AudioRange, handle: PlaybackHandle, generation: number) {
    const isCurrent = () => generation === this.generation && handle === this.handle;
    const poll = () => {
      if (!isCurrent()) return;
      this.positionTimer = undefined;
      try {
        const measured = handle.getPositionSeconds();
        const positionSeconds = Number.isFinite(measured) ? Math.max(range.start, Math.min(range.end, measured)) : this.state.positionSeconds ?? range.start;
        if (this.state.status !== 'playing' || positionSeconds !== this.state.positionSeconds) this.publish({ status: 'playing', soundId, positionSeconds });
        // A subscriber can synchronously stop or replace this session.
        if (isCurrent()) this.positionTimer = this.scheduler.set(poll, 50);
      } catch (error) {
        if (isCurrent()) this.fail(error);
      }
    };
    poll();
  }
  private fail(error: unknown) {
    this.stop();
    this.publish({ status: 'error', message: error instanceof AppError ? errorMessage(error) : 'Der Sound konnte nicht abgespielt werden. Bitte Datei und Audioberechtigung prüfen und erneut starten.' });
  }
  play(sound: Sound, range: AudioRange = { start: sound.trimStartSeconds, end: sound.trimEndSeconds }) {
    return this.start(sound, range);
  }
  toggleBoardButton(sound: Sound, origin: BoardButtonOrigin) {
    if ((this.state.status === 'loading' || this.state.status === 'playing') && this.boardOrigin?.boardId === origin.boardId && this.boardOrigin.buttonId === origin.buttonId) {
      this.stop(); return Promise.resolve();
    }
    return this.start(sound, { start: sound.trimStartSeconds, end: sound.trimEndSeconds }, origin);
  }
  private async start(sound: Sound, range: AudioRange, origin?: BoardButtonOrigin) {
    this.stop();
    this.boardOrigin = origin;
    const generation = this.generation;
    const pending = new AbortController(); this.pending = pending;
    this.publish({ status: 'loading', soundId: sound.id });
    try {
      // Must execute inside the user's press event, before storage or decoder awaits.
      const unlocked = this.audio.unlockFromGesture();
      await unlocked;
      validateRange(range, sound.durationSeconds);
      if (generation !== this.generation) return;
      const asset = await this.repository.resolve(sound.assetKey);
      if (generation !== this.generation) return;
      const handle = await this.audio.begin(asset, range, event => {
        if (generation !== this.generation) return;
        this.stop();
        if (event.type === 'error') this.publish({ status: 'error', message: event.message });
        else if (event.type === 'interrupted') this.publish({ status: 'idle', message: 'Wiedergabe unterbrochen. Zum Fortsetzen erneut starten.' });
      }, pending.signal);
      if (generation !== this.generation) { handle.stop(); return; }
      this.handle = handle;
      this.trackPosition(sound.id, range, handle, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error);
    }
  }
}
