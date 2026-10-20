import { emptyState } from '../domain/model.ts';
import type { LibraryState, LoadResult } from '../domain/model.ts';
import type { AudioInspector, AudioRange, Picker, Repository, StateBaseline } from '../platform/contracts.ts';
import { AppError } from '../domain/errors.ts';
import { validateRange } from '../domain/trim.ts';
import type { ButtonDraft } from '../domain/board.ts';
import * as boardChanges from '../domain/board.ts';
export class Library {
  snapshot: LoadResult = { state: emptyState(), warnings: [], readOnly: true, unavailable: [] };
  private repository: Repository;
  private audio: AudioInspector;
  private id: () => string;
  private queue: Promise<unknown> = Promise.resolve();
  private baseline: StateBaseline | undefined;
  private pendingLoads = 0;
  constructor(repository: Repository, audio: AudioInspector, id: () => string) {
    this.repository = repository; this.audio = audio; this.id = id;
  }
  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    this.queue = run.catch(() => undefined); return run;
  }
  private assertWritable() {
    if (this.snapshot.readOnly || this.baseline === undefined) throw new AppError('storage', 'Die gespeicherten Daten sind geschützt. Bitte erneut laden, bevor du Änderungen speicherst.');
  }
  private enqueue<T>(mutation: () => Promise<T>): Promise<T> {
    try { this.assertWritable(); } catch (error) { return Promise.reject(error); }
    return this.schedule(() => { this.assertWritable(); return mutation(); });
  }
  load(): Promise<LoadResult> {
    this.snapshot = { ...this.snapshot, readOnly: true }; this.pendingLoads++;
    return this.schedule(async () => {
      try {
        const { baseline, ...loaded } = await this.repository.load();
        for (const sound of loaded.state.sounds) {
          try { await this.repository.resolve(sound.assetKey); }
          catch { loaded.unavailable.push(sound.id); loaded.warnings.push(`Die lokale Audiodatei „${sound.name}“ fehlt oder ist nicht lesbar.`); }
        }
        this.baseline = baseline;
        this.snapshot = { ...loaded, readOnly: loaded.readOnly || this.pendingLoads > 1 };
        return this.snapshot;
      } catch {
        this.snapshot = { ...this.snapshot, readOnly: true };
        throw new AppError('storage', 'Die lokalen Daten konnten nicht geladen werden. Bitte erneut versuchen.');
      } finally { this.pendingLoads--; }
    });
  }
  private async commit(next: LibraryState, failureMessage: string) {
    try { this.baseline = await this.repository.save(next, this.baseline!); }
    catch (error) {
      if (error instanceof AppError) {
        if (error.code === 'conflict') this.snapshot = { ...this.snapshot, readOnly: true };
        throw error;
      }
      throw new AppError('storage', failureMessage);
    }
    this.snapshot = { ...this.snapshot, state: next };
  }
  async importSound(picker: Picker) {
    return this.enqueue(async () => {
      const picked = await picker.pick();
      if (!picked) return null;
      if (!Number.isFinite(picked.size) || picked.size <= 0) throw new AppError('invalid', 'Diese Datei ist leer. Bitte eine Audiodatei auswählen.');
      const id = this.id();
      const extension = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.exec(picked.name)?.[1].toLowerCase() ?? 'audio';
      const assetKey = `${id}.${extension}`;
      let ownsAsset = false;
      try {
        await this.repository.put(assetKey, picked);
        ownsAsset = true;
        let durationSeconds: number;
        try { ({ durationSeconds } = await this.audio.inspect(await this.repository.resolve(assetKey))); }
        catch { throw new AppError('unsupported', 'Die Audiodatei konnte nicht gelesen werden. Bitte eine gültige MP3- oder WAV-Datei wählen.'); }
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new AppError('invalid', 'Die Datei hat keine gültige Audiodauer.');
        const sound = { id, name: picked.name.trim() || 'Unbenannter Sound', assetKey, durationSeconds, trimStartSeconds: 0, trimEndSeconds: durationSeconds };
        const next = { ...this.snapshot.state, sounds: [...this.snapshot.state.sounds, sound] };
        await this.commit(next, 'Der Sound konnte nicht lokal gespeichert werden. Bitte freien Speicher prüfen und erneut versuchen.');
        return sound;
      } catch (error) {
        if (ownsAsset) await this.repository.remove(assetKey).catch(() => undefined);
        if (error instanceof AppError) throw error;
        throw new AppError('storage', 'Der Sound konnte nicht lokal gespeichert werden. Bitte freien Speicher prüfen und erneut versuchen.');
      }
    });
  }
  async setTrim(soundId: string, range: AudioRange) {
    return this.enqueue(async () => {
      const sound = this.snapshot.state.sounds.find(entry => entry.id === soundId);
      if (!sound) throw new AppError('missing', 'Dieser Sound ist nicht mehr verfügbar.');
      validateRange(range, sound.durationSeconds);
      const updated = { ...sound, trimStartSeconds: range.start, trimEndSeconds: range.end };
      const next = { ...this.snapshot.state, sounds: this.snapshot.state.sounds.map(entry => entry.id === soundId ? updated : entry) };
      await this.commit(next, 'Der Ausschnitt konnte nicht gespeichert werden. Deine letzte gespeicherte Auswahl bleibt erhalten.');
    });
  }
  private mutate(change: (state: LibraryState) => LibraryState) {
    return this.enqueue(async () => {
      const next = change(this.snapshot.state);
      await this.commit(next, 'Die Änderung konnte nicht gespeichert werden. Der letzte gespeicherte Stand bleibt erhalten.');
    });
  }
  async createBoard(name: string): Promise<string> {
    const id = this.id(); await this.mutate(state => boardChanges.createBoard(state, id, name)); return id;
  }
  renameBoard(id: string, name: string) { return this.mutate(state => boardChanges.renameBoard(state, id, name)); }
  deleteBoard(id: string) { return this.mutate(state => boardChanges.deleteBoard(state, id)); }
  async createButton(boardId: string, label: string, soundId: string): Promise<string> {
    const id = this.id(); await this.mutate(state => boardChanges.createButton(state, boardId, id, label, soundId)); return id;
  }
  updateButton(boardId: string, id: string, draft: ButtonDraft) { return this.mutate(state => boardChanges.updateButton(state, boardId, id, draft)); }
  deleteButton(boardId: string, id: string) { return this.mutate(state => boardChanges.deleteButton(state, boardId, id)); }
}
