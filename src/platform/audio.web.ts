import { AppError } from '../domain/errors.ts';
import { validateRange } from '../domain/trim.ts';
import type { AudioRange, PlayableAsset, PlaybackEvent } from './contracts.ts';
export class LocalAudio {
  private context?: AudioContext;
  private getContext() {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    return this.context;
  }
  unlockFromGesture() { return this.getContext().resume(); }
  private async decode(asset: PlayableAsset) {
    if (!(asset.source instanceof Blob)) throw new AppError('missing', 'Die lokale Audiodatei ist nicht verfügbar.');
    try { return await this.getContext().decodeAudioData(await asset.source.arrayBuffer()); }
    catch { throw new AppError('playback', 'Die Audiodatei konnte nicht decodiert werden. Bitte eine andere Datei versuchen.'); }
  }
  async begin(asset: PlayableAsset, range: AudioRange, onEvent: (event: PlaybackEvent) => void, signal: AbortSignal) {
    const context = this.getContext();
    const buffer = await this.decode(asset);
    if (signal.aborted) throw new AppError('playback', 'Wiedergabe wurde abgebrochen.');
    if (context.state !== 'running') throw new AppError('playback', 'Audio ist gesperrt. Bitte die Vorschau erneut bewusst starten.');
    validateRange(range, buffer.duration);
    const source = context.createBufferSource(); source.buffer = buffer;
    let finished = false;
    const origin = context.currentTime;
    let position = range.start;
    const getPositionSeconds = () => {
      if (!finished) {
        const measured = range.start + context.currentTime - origin;
        if (Number.isFinite(measured)) position = Math.max(range.start, Math.min(range.end, measured));
      }
      return position;
    };
    const finish = (event?: PlaybackEvent) => {
      if (finished) return;
      getPositionSeconds(); finished = true; source.onended = null;
      signal.removeEventListener('abort', abort); context.removeEventListener('statechange', stateChanged);
      try { source.stop(); } catch { /* A naturally ended node is already stopped. */ }
      source.disconnect(); if (event) onEvent(event);
    };
    const abort = () => finish();
    const stateChanged = () => { if (context.state !== 'running') finish({ type: 'interrupted' }); };
    signal.addEventListener('abort', abort, { once: true }); context.addEventListener('statechange', stateChanged);
    source.onended = () => finish({ type: 'ended' });
    try {
      source.connect(context.destination);
      // Offset and duration are enforced by the audio engine, independent of JS timers.
      source.start(0, range.start, range.end - range.start);
    } catch { finish(); throw new AppError('playback', 'Der Sound konnte nicht gestartet werden. Bitte erneut versuchen.'); }
    return { stop: () => finish(), getPositionSeconds };
  }
  async inspect(asset: PlayableAsset) {
    const buffer = await this.decode(asset);
    return { durationSeconds: buffer.duration };
  }
}
