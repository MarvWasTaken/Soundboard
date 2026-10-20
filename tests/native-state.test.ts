import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitNativeState } from '../src/platform/native-state.ts';
import { AppError } from '../src/domain/errors.ts';
test('the actual native SQL helper conditionally inserts and updates across two SQLite connections', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'soundboard-sqlite-'));
  const path = join(directory, 'state.db'), a = new DatabaseSync(path), b = new DatabaseSync(path);
  a.exec('CREATE TABLE state (id INTEGER PRIMARY KEY, json TEXT NOT NULL)');
  const transaction = (db: DatabaseSync) => ({ runAsync: async (query: string, ...parameters: string[]) => ({ changes: Number(db.prepare(query).run(...parameters).changes) }) });
  async function commit(db: DatabaseSync, json: string, expected: string | null) {
    db.exec('BEGIN IMMEDIATE');
    try { await commitNativeState(transaction(db), json, expected); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const conflict = (error: unknown) => error instanceof AppError && error.code === 'conflict';
  try {
    await commit(a, 'first', null); await assert.rejects(commit(b, 'stale first writer', null), conflict);
    await commit(b, 'second', 'first'); await assert.rejects(commit(a, 'stale update', 'first'), conflict);
    assert.equal((a.prepare('SELECT json FROM state WHERE id = 1').get() as { json: string }).json, 'second');
    await commit(a, 'third', 'second'); assert.equal((b.prepare('SELECT json FROM state WHERE id = 1').get() as { json: string }).json, 'third');
  } finally { a.close(); b.close(); rmSync(directory, { recursive: true }); }
});
