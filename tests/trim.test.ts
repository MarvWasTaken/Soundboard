import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrimDraft, rangeFromDraft, validateRange } from '../src/domain/trim.ts';
import { Library } from '../src/services/library.ts';
import type { LibraryState, Sound } from '../src/domain/model.ts';
import { MemoryDatabase, MemoryRepository } from './helpers/memory-repository.ts';
const sound: Sound = { id: 'a', name: 'A', assetKey: 'a.wav', durationSeconds: 2.0375510204081633, trimStartSeconds: 0, trimEndSeconds: 2.0375510204081633 };
test('decimal comma and point drafts yield precise valid ranges', () => {
  const draft = { ...createTrimDraft(sound), startText: '0,25', endText: '1.75' };
  assert.deepEqual(rangeFromDraft(draft, sound.durationSeconds), { start: 0.25, end: 1.75 });
});
test('unchanged rounded display retains exact saved full-file endpoint', () => {
  const draft = createTrimDraft(sound);
  assert.deepEqual(rangeFromDraft(draft, sound.durationSeconds), { start: 0, end: sound.durationSeconds });
});
for (const [startText, endText] of [['', '1'], [' ', '1'], ['-1', '1'], ['1', '1'], ['2', '1'], ['0', '3'], ['NaN', '1'], ['0', 'Infinity'], ['0x1', '2'], ['0,1.2', '2']]) {
  test(`invalid draft [${startText},${endText}] is rejected`, () => {
    assert.throws(() => rangeFromDraft({ ...createTrimDraft(sound), startText, endText }, sound.durationSeconds));
  });
}
test('range validation rejects nonfinite numbers even outside text UI', () => {
  for (const range of [{ start: NaN, end: 1 }, { start: 0, end: Infinity }, { start: 0, end: 0 }]) assert.throws(() => validateRange(range, 2));
});
function setup() {
  const state: LibraryState = { version: 1, sounds: [structuredClone(sound)], boards: [] };
  const originalBytes = new Blob(['original']);
  const repository = new MemoryRepository(new MemoryDatabase(state)); repository.db.assets.set(sound.assetKey, originalBytes);
  repository.put = async () => { throw Error('must not change bytes'); }; repository.remove = async () => { throw Error('must not remove bytes'); };
  const library = new Library(repository, { inspect: async () => ({ durationSeconds: sound.durationSeconds }) }, () => 'id');
  return { library, repository, fail: () => { repository.failSave = true; }, saves: () => repository.saves, originalBytes };
}
test('trim commits and survives reload while original bytes stay untouched', async () => {
  const { library, repository, originalBytes } = setup(); await library.load();
  await library.setTrim(sound.id, { start: 0.2, end: 1.3 }); await library.load();
  assert.equal(library.snapshot.state.sounds[0].trimStartSeconds, 0.2); assert.equal(library.snapshot.state.sounds[0].trimEndSeconds, 1.3);
  assert.equal((await repository.resolve(sound.assetKey)).source, originalBytes);
});
test('invalid trim or failed commit preserves the last confirmed range', async () => {
  const context = setup(); await context.library.load(); const before = structuredClone(context.library.snapshot.state);
  await assert.rejects(context.library.setTrim(sound.id, { start: 2, end: 1 }));
  assert.equal(context.saves(), 0); context.fail(); await assert.rejects(context.library.setTrim(sound.id, { start: 0, end: 1 }));
  assert.deepEqual(context.library.snapshot.state, before);
});
test('editing and discarding a draft does not mutate confirmed metadata', () => {
  const before = structuredClone(sound); const draft = createTrimDraft(sound); draft.startText = '1';
  assert.deepEqual(sound, before); assert.equal(createTrimDraft(sound).startValue, 0);
});
