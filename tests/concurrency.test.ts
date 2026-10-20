import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Library } from '../src/services/library.ts';
import { AppError } from '../src/domain/errors.ts';
import { readStateRecord } from '../src/platform/state-record.ts';
import { MemoryDatabase, MemoryRepository } from './helpers/memory-repository.ts';
import type { LibraryState } from '../src/domain/model.ts';
import type { PickedFile } from '../src/platform/contracts.ts';
const sound = { id: 's', name: 'Tone.wav', assetKey: 's.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
const button = { id: 'one', label: 'One', soundId: 's', x: 0, y: 0, width: 1, height: 1 };
const initial: LibraryState = { version: 1, sounds: [sound], boards: [{ id: 'board', name: 'Board', buttons: [button] }] };
const file: PickedFile = { name: 'Tone.wav', size: 4, mimeType: 'audio/wav', source: new Blob(['tone']) };
let sequence = 0;
const audio = { inspect: async () => ({ durationSeconds: 2 }) };
const instance = (repository: MemoryRepository) => new Library(repository, audio, () => `id-${++sequence}`);
function pair() {
  const db = new MemoryDatabase(initial); db.assets.set('s.wav', file.source);
  const ra = new MemoryRepository(db), rb = new MemoryRepository(db);
  return { db, ra, rb, a: instance(ra), b: instance(rb) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const mutations = {
  import: (library: Library) => library.importSound({ pick: async () => file }),
  trim: (library: Library) => library.setTrim('s', { start: 0.5, end: 1.5 }),
  createBoard: (library: Library) => library.createBoard('New'),
  renameBoard: (library: Library) => library.renameBoard('board', 'Changed'),
  deleteBoard: (library: Library) => library.deleteBoard('board'),
  createButton: (library: Library) => library.createButton('board', 'New', 's'),
  updateButton: (library: Library) => library.updateButton('board', 'one', { ...button, label: 'Stale', y: 1 }),
  deleteButton: (library: Library) => library.deleteButton('board', 'one'),
};
for (const [name, mutate] of Object.entries(mutations)) test(`${name}: stale commit preserves first writer, locks service, and reload permits a new deliberate edit`, async () => {
  const { a, b, db } = pair(); await a.load(); await b.load(); const before = structuredClone(b.snapshot.state);
  await a.renameBoard('board', 'First writer'); const first = db.raw;
  await assert.rejects(mutate(b), error => error instanceof AppError && error.code === 'conflict');
  assert.equal(db.raw, first); assert.deepEqual(b.snapshot.state, before); assert.equal(b.snapshot.readOnly, true); assert.equal(db.assets.size, 1);
  await assert.rejects(b.createBoard('Blocked')); assert.equal(db.raw, first);
  await b.load(); await b.createBoard('After reload'); await a.load();
  assert.deepEqual(a.snapshot.state.boards.map(board => board.name), ['First writer', 'After reload']);
});
test('no mutation before a successful initial load, or after failed reload', async () => {
  const { a, ra, db } = pair(); await assert.rejects(a.createBoard('No baseline')); await a.load();
  ra.failLoad = true; await assert.rejects(a.load()); assert.equal(a.snapshot.readOnly, true);
  const saved = db.raw; await assert.rejects(a.deleteBoard('board')); assert.equal(db.raw, saved);
  ra.failLoad = false; await a.load(); assert.equal(a.snapshot.readOnly, false); await a.renameBoard('board', 'Recovered');
});
test('ordinary failed save does not advance the baseline and allows retry', async () => {
  const { a, ra, db } = pair(); await a.load(); const before = db.raw; ra.failSave = true;
  await assert.rejects(a.renameBoard('board', 'Failed')); assert.equal(db.raw, before); assert.equal(a.snapshot.readOnly, false);
  ra.failSave = false; await a.renameBoard('board', 'Retry'); assert.equal(a.snapshot.state.boards[0].name, 'Retry');
});
test('reload serializes a pending picker and rejects queued or newly requested old mutations', async () => {
  const { a, db } = pair(); await a.load(); const picked = deferred<PickedFile | null>();
  const importing = a.importSound({ pick: () => picked.promise }); await tick();
  const queued = a.createBoard('Old draft').catch(error => error); const reload = a.load();
  assert.equal(a.snapshot.readOnly, true); await assert.rejects(a.createBoard('During reload'));
  picked.resolve(file); await importing; assert.ok(await queued instanceof AppError); await reload;
  assert.equal(a.snapshot.state.sounds.length, 2); assert.equal(a.snapshot.state.boards.length, 1); assert.equal(db.assets.size, 2); assert.equal(a.snapshot.readOnly, false);
});
test('a running commit completes before reload while queued mutation is discarded', async () => {
  const { a, ra } = pair(); await a.load(); const saved = deferred<void>(); ra.beforeSave = () => saved.promise;
  const running = a.renameBoard('board', 'Committed first'); await tick();
  const queued = a.createBoard('Discarded').catch(error => error); const reload = a.load(); saved.resolve();
  await running; assert.ok(await queued instanceof AppError); await reload;
  assert.deepEqual(a.snapshot.state.boards.map(board => board.name), ['Committed first']);
});
test('raw stored text is retained as baseline and unexpected values remain protected', async () => {
  const { a, db } = pair();
  db.raw = JSON.stringify({ ...initial, sounds: [sound, { bad: true }] }, null, 2);
  const raw = db.raw; await a.load(); assert.equal(db.raw, raw); await a.renameBoard('board', 'Raw baseline accepted');
  assert.equal(a.snapshot.state.boards[0].name, 'Raw baseline accepted');
  for (const rawValue of [null, 42, { ...initial }]) {
    const loaded = readStateRecord(rawValue); assert.equal(loaded.readOnly, true); assert.ok(loaded.warnings.length);
  }
  assert.equal(readStateRecord(undefined).baseline, null);
});
