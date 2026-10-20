import type { LibraryState } from '../domain/model.ts';
import { validAssetKey } from '../domain/validation.ts';
import { AppError, stateConflict } from '../domain/errors.ts';
import type { PickedFile, Repository, StateBaseline } from './contracts.ts';
import { readStateRecord } from './state-record.ts';

export const DATABASE_NAME = 'local-soundboard';
export class LocalRepository implements Repository {
  private database?: Promise<IDBDatabase>;
  private open() {
    if (!this.database) this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('state'); request.result.createObjectStore('assets');
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.database = undefined; }; resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new AppError('storage', 'Bitte andere Soundboard-Tabs schließen und erneut versuchen.'));
    }).catch(error => { this.database = undefined; throw error; });
    return this.database;
  }
  private async transaction<T>(store: string, mode: IDBTransactionMode, operation: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(store, mode);
      let request: IDBRequest<T>;
      try { request = operation(transaction.objectStore(store)); }
      catch (error) { transaction.abort(); reject(error); return; }
      // Request success is insufficient: quota/commit errors can still abort the transaction.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new AppError('storage', 'Der lokale Speichervorgang wurde abgebrochen.'));
      transaction.onerror = () => { /* onabort reports the final result */ };
    });
  }
  async put(key: string, picked: PickedFile) {
    if (!validAssetKey(key) || !(picked.source instanceof Blob) || !picked.source.size) throw new AppError('invalid', 'Die Audiodatei ist leer oder nicht lesbar.');
    await this.transaction('assets', 'readwrite', store => store.add(picked.source, key));
  }
  async resolve(key: string) {
    if (!validAssetKey(key)) throw new AppError('missing', 'Die lokale Audiodatei fehlt.');
    const source = await this.transaction<unknown>('assets', 'readonly', store => store.get(key));
    if (!(source instanceof Blob) || !source.size) throw new AppError('missing', 'Die lokale Audiodatei fehlt oder ist leer.');
    return { source };
  }
  async remove(key: string) { await this.transaction('assets', 'readwrite', store => store.delete(key)); }
  async load() { return readStateRecord(await this.transaction('state', 'readonly', store => store.get('library'))); }
  async save(state: LibraryState, expectedBaseline: StateBaseline): Promise<StateBaseline> {
    const json = JSON.stringify(state), database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      const current = store.get('library'); let conflict: AppError | undefined;
      current.onsuccess = () => {
        const matches = expectedBaseline === null ? current.result === undefined : current.result === expectedBaseline;
        if (!matches) { conflict = stateConflict(); transaction.abort(); return; }
        store.put(json, 'library');
      };
      transaction.oncomplete = () => resolve(json);
      transaction.onabort = () => reject(conflict ?? transaction.error ?? new AppError('storage', 'Der lokale Speichervorgang wurde abgebrochen.'));
      transaction.onerror = () => { /* onabort reports the committed result. */ };
    });
  }
}
