import type { LibraryState } from '../../src/domain/model.ts';
import type { PickedFile, Repository, StateBaseline } from '../../src/platform/contracts.ts';
import { stateConflict } from '../../src/domain/errors.ts';
import { readStateRecord } from '../../src/platform/state-record.ts';
export class MemoryDatabase {
  raw: unknown;
  assets = new Map<string, Blob | string>();
  constructor(initial?: LibraryState) { this.raw = initial ? JSON.stringify(initial) : undefined; }
}
export class MemoryRepository implements Repository {
  db: MemoryDatabase; failSave = false; failLoad = false; saves = 0;
  beforeSave?: () => Promise<void>;
  removed: string[] = [];
  constructor(database = new MemoryDatabase()) { this.db = database; }
  async load() { if (this.failLoad) throw Error('I/O load'); return readStateRecord(structuredClone(this.db.raw)); }
  async save(state: LibraryState, expected: StateBaseline): Promise<StateBaseline> {
    await this.beforeSave?.();
    if (this.failSave) throw Error('quota');
    if (expected === null ? this.db.raw !== undefined : this.db.raw !== expected) throw stateConflict();
    const next = JSON.stringify(state); this.db.raw = next; this.saves++; return next;
  }
  async put(key: string, picked: PickedFile) { if (this.db.assets.has(key)) throw Error('exists'); this.db.assets.set(key, picked.source); }
  async resolve(key: string) { const source = this.db.assets.get(key); if (!source) throw Error('missing'); return { source }; }
  async remove(key: string) { this.removed.push(key); this.db.assets.delete(key); }
}
