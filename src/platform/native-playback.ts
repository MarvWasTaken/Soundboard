import type { AudioRange, PlaybackEvent, PlaybackHandle } from './contracts.ts';
import { AppError } from '../domain/errors.ts';
import { validateRange } from '../domain/trim.ts';
export type NativeStatus = { isLoaded: boolean; duration: number; currentTime: number; playing: boolean; isBuffering: boolean; didJustFinish: boolean; error: string | null; mediaServicesDidReset?: boolean };
export type NativePlayer = {
  currentStatus: NativeStatus;
  addListener(event: 'playbackStatusUpdate', listener: (status: NativeStatus) => void): { remove(): void };
  seekTo(position: number, before?: number, after?: number): Promise<void>;
  play(): void; pause(): void; remove(): void;
};
export type PlaybackClock = { set(callback: () => void, milliseconds: number): unknown; clear(token: unknown): void };
export const systemClock: PlaybackClock = { set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: token => clearTimeout(token as ReturnType<typeof setTimeout>) };
export function inspectNativePlayer(player: NativePlayer, clock = systemClock): Promise<{ durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { remove(): void } | undefined;
    const timer = clock.set(() => finish(undefined, new AppError('unsupported', 'Die Audiodatei konnte nicht rechtzeitig geladen werden.')), 15_000);
    function finish(duration?: number, error?: unknown) {
      if (settled) return;
      settled = true; clock.clear(timer); subscription?.remove();
      try { player.remove(); } catch { /* A reset may already have released the probe. */ }
      if (error) reject(error); else resolve({ durationSeconds: duration! });
    }
    const statusChanged = (status: NativeStatus) => {
      if (status.error) finish(undefined, new AppError('unsupported', 'Diese Audiodatei konnte nicht gelesen werden.'));
      else if (status.isLoaded && Number.isFinite(status.duration) && status.duration > 0) finish(status.duration);
    };
    try { subscription = player.addListener('playbackStatusUpdate', statusChanged); statusChanged(player.currentStatus); }
    catch (error) { finish(undefined, error); }
  });
}
export function beginNativePlayback(player: NativePlayer, range: AudioRange, onEvent: (event: PlaybackEvent) => void, signal: AbortSignal, clock = systemClock): Promise<PlaybackHandle> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let started = false;
    let position = range.start;
    let phase: 'loading' | 'seeking' | 'starting' | 'playing' = 'loading';
    let endTimer: unknown;
    let startupTimer: unknown;
    let subscription: { remove(): void } | undefined;
    function clearEndTimer() { if (endTimer !== undefined) clock.clear(endTimer); endTimer = undefined; }
    function finish(event?: PlaybackEvent) {
      if (finished) return;
      finished = true; clearEndTimer();
      if (startupTimer !== undefined) clock.clear(startupTimer);
      subscription?.remove(); signal.removeEventListener('abort', abort);
      try { player.pause(); } catch { /* A reset may have already released the engine. */ }
      try { player.remove(); } catch { /* Cleanup still completes after media service reset. */ }
      if (!started) reject(new AppError('playback', event?.type === 'error' ? event.message : 'Wiedergabe wurde abgebrochen.'));
      else if (event) onEvent(event);
    }
    function abort() { finish(); }
    async function seekAndPlay() {
      phase = 'seeking';
      try {
        await player.seekTo(range.start, 0, 0);
        if (finished || signal.aborted) return;
        phase = 'starting'; player.play();
      } catch { finish({ type: 'error', message: 'Der Sound konnte nicht am gewählten Startpunkt abgespielt werden.' }); }
    }
    function statusChanged(status: NativeStatus) {
      if (finished) return;
      if (status.error) { finish({ type: 'error', message: 'Die Audiodatei konnte nicht abgespielt werden.' }); return; }
      if (status.mediaServicesDidReset) { finish({ type: 'interrupted' }); return; }
      if (phase === 'loading') {
        if (!status.isLoaded || !Number.isFinite(status.duration) || status.duration <= 0) return;
        try { validateRange(range, status.duration); }
        catch { finish({ type: 'error', message: 'Der gespeicherte Ausschnitt passt nicht zur lokalen Audiodatei.' }); return; }
        void seekAndPlay(); return;
      }
      if (phase === 'seeking') return;
      if (status.didJustFinish || (Number.isFinite(status.currentTime) && status.currentTime >= range.end)) { finish({ type: 'ended' }); return; }
      clearEndTimer();
      if (status.isBuffering) return;
      if (!status.playing) {
        if (started) finish({ type: 'interrupted' });
        return;
      }
      if (Number.isFinite(status.currentTime)) position = Math.max(range.start, Math.min(range.end, status.currentTime));
      if (!started) {
        started = true; phase = 'playing';
        if (startupTimer !== undefined) clock.clear(startupTimer);
        resolve({ stop: () => finish(), getPositionSeconds: () => position });
      }
      // Expo has no native end boundary. Recompute from the actual playback position.
      endTimer = clock.set(() => finish({ type: 'ended' }), Math.max(0, (range.end - position) * 1000));
    }
    signal.addEventListener('abort', abort, { once: true });
    startupTimer = clock.set(() => finish({ type: 'error', message: 'Der Sound konnte nicht rechtzeitig gestartet werden. Bitte erneut versuchen.' }), 15_000);
    try {
      subscription = player.addListener('playbackStatusUpdate', statusChanged);
      if (signal.aborted) abort(); else statusChanged(player.currentStatus);
    } catch { finish({ type: 'error', message: 'Die Audioverbindung konnte nicht hergestellt werden. Bitte erneut versuchen.' }); }
  });
}
