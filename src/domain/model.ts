export type Sound = {
  id: string; name: string; assetKey: string; durationSeconds: number;
  trimStartSeconds: number; trimEndSeconds: number;
};
export type BoardButton = { id: string; label: string; soundId: string; x: number; y: number; width: number; height: number };
export type Board = { id: string; name: string; buttons: BoardButton[] };
export type LibraryState = { version: 1; sounds: Sound[]; boards: Board[] };
export type AudioRange = { start: number; end: number };
export type LoadResult = { state: LibraryState; warnings: string[]; readOnly: boolean; unavailable: string[] };
export const emptyState = (): LibraryState => ({ version: 1, sounds: [], boards: [] });
