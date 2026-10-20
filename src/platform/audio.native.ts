import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioRange, PlayableAsset, PlaybackEvent } from './contracts.ts';
import { AppError } from '../domain/errors.ts';
import { beginNativePlayback, inspectNativePlayer } from './native-playback.ts';
export class LocalAudio {
  unlockFromGesture() { return Promise.resolve(); }
  async begin(asset: PlayableAsset, range: AudioRange, onEvent: (event: PlaybackEvent) => void, signal: AbortSignal) {
    if (typeof asset.source !== 'string') throw new AppError('missing', 'Die lokale Audiodatei ist nicht verfügbar.');
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, allowsRecording: false, interruptionMode: 'doNotMix' });
    if (signal.aborted) throw new AppError('playback', 'Wiedergabe wurde abgebrochen.');
    const player = createAudioPlayer(asset.source, { updateInterval: 50 });
    return beginNativePlayback(player, range, onEvent, signal);
  }
  async inspect(asset: PlayableAsset): Promise<{ durationSeconds: number }> {
    if (typeof asset.source !== 'string') throw new AppError('unsupported', 'Diese Audiodatei kann nicht geöffnet werden.');
    return inspectNativePlayer(createAudioPlayer(asset.source, { updateInterval: 50 }));
  }
}
