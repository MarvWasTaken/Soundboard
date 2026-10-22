import type { AudioRange, LibraryState, LoadResult } from '../domain/model.ts';
export type { AudioRange } from '../domain/model.ts';
export type PickedFile = { name: string; size: number; mimeType: string; source: Blob | string };
export type PlayableAsset = { source: Blob | string };
export type StateBaseline = string | null;
export type RepositoryLoad = LoadResult & { baseline: StateBaseline };
export interface Repository {
  put(key: string, picked: PickedFile): Promise<void>;
  resolve(key: string): Promise<PlayableAsset>;
  remove(key: string): Promise<void>;
  load(): Promise<RepositoryLoad>;
  save(state: LibraryState, expectedBaseline: StateBaseline): Promise<StateBaseline>;
}
export interface AudioInspector { inspect(asset: PlayableAsset): Promise<{ durationSeconds: number }> }
export interface Picker { pick(): Promise<PickedFile | null> }
export type PlaybackEvent = { type: 'ended' | 'interrupted' } | { type: 'error'; message: string };
export type PlaybackHandle = { stop(): void; getPositionSeconds(): number };
export interface AudioPlayback {
  unlockFromGesture(): Promise<void>;
  begin(asset: PlayableAsset, range: AudioRange, onEvent: (event: PlaybackEvent) => void, signal: AbortSignal): Promise<PlaybackHandle>;
}
