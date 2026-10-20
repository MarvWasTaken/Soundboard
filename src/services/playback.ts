import type { Sound } from '../domain/model.ts';
import type { AudioPlayback, AudioRange, PlaybackHandle, Repository } from '../platform/contracts.ts';
import { AppError, errorMessage } from '../domain/errors.ts';
import { validateRange } from '../domain/trim.ts';
export type PlaybackState = { status: 'idle' | 'loading' | 'playing' | 'error'; soundId?: string; message?: string };
export class Playback {
  state: PlaybackState = { status: 'idle' };
  private generation = 0;
  private pending?: AbortController;
  private handle?: PlaybackHandle;
  private listeners = new Set<(state: PlaybackState) => void>();
  private repository: Pick<Repository, 'resolve'>;
  private audio: AudioPlayback;
  constructor(repository: Pick<Repository, 'resolve'>, audio: AudioPlayback) { this.repository = repository; this.audio = audio; }
  private publish(state: PlaybackState) { this.state = state; this.listeners.forEach(listener => listener(state)); }
  subscribe(listener: (state: PlaybackState) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  stop() {
    this.generation++;
    this.pending?.abort(); this.pending = undefined;
    const handle = this.handle; this.handle = undefined; handle?.stop();
    this.publish({ status: 'idle' });
  }
  async play(sound: Sound, range: AudioRange = { start: sound.trimStartSeconds, end: sound.trimEndSeconds }) {
    this.stop();
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
      this.publish({ status: 'playing', soundId: sound.id });
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.publish({ status: 'error', message: error instanceof AppError ? errorMessage(error) : 'Der Sound konnte nicht abgespielt werden. Bitte Datei und Audioberechtigung prüfen und erneut starten.' });
    }
  }
}
