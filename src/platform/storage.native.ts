import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync } from 'expo-sqlite';
import type { LibraryState } from '../domain/model.ts';
import { validAssetKey } from '../domain/validation.ts';
import { AppError } from '../domain/errors.ts';
import type { PickedFile, Repository, StateBaseline } from './contracts.ts';
import { readStateRecord } from './state-record.ts';
import { commitNativeState } from './native-state.ts';
export class LocalRepository implements Repository {
  private directory = new Directory(Paths.document, 'sounds');
  private database = openDatabaseAsync('soundboard.db').then(async database => {
    await database.execAsync('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT NOT NULL)'); return database;
  });
  private file(key: string) {
    if (!validAssetKey(key)) throw new AppError('invalid', 'Ungültige lokale Audiodatei.');
    return new File(this.directory, key);
  }
  async put(key: string, picked: PickedFile) {
    if (typeof picked.source !== 'string') throw new AppError('invalid', 'Die ausgewählte Datei ist nicht lesbar.');
    this.directory.create({ idempotent: true, intermediates: true });
    const target = this.file(key);
    if (target.exists) throw new AppError('storage', 'Diese lokale Datei existiert bereits. Bitte erneut importieren.');
    new File(picked.source).copy(target);
    if (!target.exists || target.size <= 0) throw new AppError('storage', 'Die Audiodatei konnte nicht kopiert werden.');
  }
  async resolve(key: string) {
    const file = this.file(key);
    if (!file.exists || file.size <= 0) throw new AppError('missing', 'Die lokale Audiodatei fehlt oder ist leer.');
    return { source: file.uri };
  }
  async remove(key: string) { const file = this.file(key); if (file.exists) file.delete(); }
  async load() {
    const row = await (await this.database).getFirstAsync<{ json: string }>('SELECT json FROM state WHERE id = 1');
    return readStateRecord(row?.json);
  }
  async save(state: LibraryState, expectedBaseline: StateBaseline): Promise<StateBaseline> {
    const json = JSON.stringify(state);
    const database = await this.database;
    await database.withExclusiveTransactionAsync(async transaction => {
      await commitNativeState(transaction, json, expectedBaseline);
    });
    return json;
  }
}
