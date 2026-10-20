import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Library } from '../src/services/library.ts';
import type { LibraryState } from '../src/domain/model.ts';
import { MemoryDatabase, MemoryRepository } from './helpers/memory-repository.ts';
const sound = { id: 's', name: 'Tone', assetKey: 's.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
function harness() {
  const state: LibraryState = { version: 1, sounds: [sound], boards: [] }; let sequence = 0;
  const repository = new MemoryRepository(new MemoryDatabase(state)); repository.db.assets.set(sound.assetKey, 'local');
  return { library: new Library(repository, { inspect: async () => ({ durationSeconds: 2 }) }, () => `id-${++sequence}`), fail: () => { repository.failSave = true; } };
}
test('boards, labels, assignments and layout survive service reload; failed saves preserve confirmed state', async () => {
  const { library, fail } = harness(); await library.load();
  const boardId = await library.createBoard('Stage'); const buttonId = await library.createButton(boardId, 'Tone', 's');
  assert.equal(library.snapshot.state.boards.length, 1);
  await library.updateButton(boardId, buttonId, { label: 'Jingle', soundId: 's', x: 0, y: 3, width: 2, height: 2 });
  await library.renameBoard(boardId, 'Main stage'); await library.load();
  assert.equal(library.snapshot.state.boards[0].name, 'Main stage'); assert.equal(library.snapshot.state.boards[0].buttons[0].y, 3);
  const before = structuredClone(library.snapshot.state); fail();
  await assert.rejects(library.deleteBoard(boardId)); assert.deepEqual(library.snapshot.state, before);
});
test('persisted removal of last button and board retains the sound', async () => {
  const { library } = harness(); await library.load(); const boardId = await library.createBoard('A'); const buttonId = await library.createButton(boardId, 'Tone', 's');
  await library.deleteButton(boardId, buttonId); assert.equal(library.snapshot.state.boards[0].buttons.length, 0);
  await library.deleteBoard(boardId); await library.load(); assert.equal(library.snapshot.state.boards.length, 0); assert.equal(library.snapshot.state.sounds.length, 1);
});
