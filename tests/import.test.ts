import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Library } from '../src/services/library.ts';
import { emptyState } from '../src/domain/model.ts';
import type { PickedFile } from '../src/platform/contracts.ts';
import { MemoryRepository } from './helpers/memory-repository.ts';

const file: PickedFile = { name: 'Signal.wav', size: 4, mimeType: 'audio/wav', source: new Blob(['tone']) };
async function setup() {
  let duration = 2; let decoderFails = false; let sequence = 0;
  const repository = new MemoryRepository(); const bytes = repository.db.assets;
  const audio = { inspect: async () => { if (decoderFails) throw Error('decode'); return { durationSeconds: duration }; } };
  const library = new Library(repository, audio, () => `id-${++sequence}`); await library.load();
  return { library, repository, audio, bytes,
    failCommit: () => { repository.failSave = true; }, setDuration: (value: number) => { duration = value; },
    failDecoder: () => { decoderFails = true; } };
}
const picker = (picked: PickedFile | null = file) => ({ pick: async () => picked });
test('import commits durable bytes and metadata before publishing a reloadable sound', async () => {
  const { library, repository, audio, bytes } = await setup();
  await library.importSound(picker());
  assert.equal(library.snapshot.state.sounds.length, 1);
  const sound = library.snapshot.state.sounds[0];
  assert.ok(bytes.has(sound.assetKey)); assert.equal(sound.trimEndSeconds, 2);
  const reopened = new Library(repository, audio, () => 'other'); await reopened.load();
  assert.deepEqual(reopened.snapshot.state.sounds, [sound]);
});
test('failed metadata commit preserves the previous library and cleans the new bytes', async () => {
  const context = await setup(); await context.library.importSound(picker()); const before = structuredClone(context.library.snapshot.state);
  context.failCommit(); await assert.rejects(context.library.importSound(picker()));
  assert.deepEqual(context.library.snapshot.state, before); assert.equal(context.bytes.size, 1);
});
test('cancel leaves state and bytes untouched', async () => {
  const { library, bytes } = await setup(); assert.equal(await library.importSound(picker(null)), null);
  assert.deepEqual(library.snapshot.state, emptyState()); assert.equal(bytes.size, 0);
});
test('duplicate filenames retain independent identities and assets', async () => {
  const { library, bytes } = await setup(); await library.importSound(picker()); await library.importSound(picker());
  assert.equal(library.snapshot.state.sounds.length, 2);
  assert.notEqual(library.snapshot.state.sounds[0].id, library.snapshot.state.sounds[1].id); assert.equal(bytes.size, 2);
});
for (const duration of [0, -1, Infinity, NaN]) test(`reject invalid duration ${duration}`, async () => {
  const context = await setup(); context.setDuration(duration); await assert.rejects(context.library.importSound(picker()));
  assert.equal(context.bytes.size, 0); assert.equal(context.library.snapshot.state.sounds.length, 0);
});
test('empty files and decoder failures do not create library entries', async () => {
  const context = await setup(); await assert.rejects(context.library.importSound(picker({ ...file, size: 0 })));
  context.failDecoder(); await assert.rejects(context.library.importSound(picker()));
  assert.equal(context.bytes.size, 0); assert.equal(context.library.snapshot.state.sounds.length, 0);
});
test('concurrent imports commit from the latest confirmed state', async () => {
  const { library } = await setup(); await Promise.all([library.importSound(picker()), library.importSound(picker())]);
  assert.equal(library.snapshot.state.sounds.length, 2);
});
test('missing bytes remain visible as unavailable without deleting valid metadata', async () => {
  const { library, bytes } = await setup(); await library.importSound(picker()); bytes.clear();
  await library.load(); assert.equal(library.snapshot.state.sounds.length, 1);
  assert.deepEqual(library.snapshot.unavailable, [library.snapshot.state.sounds[0].id]);
  assert.ok(library.snapshot.warnings.some(warning => warning.includes('Audiodatei')));
});
test('a rejected put cannot delete pre-existing bytes under the generated key', async () => {
  const repository = new MemoryRepository(); const original = new Blob(['existing original bytes']); repository.db.assets.set('known.wav', original);
  const library = new Library(repository, { inspect: async () => ({ durationSeconds: 2 }) }, () => 'known'); await library.load();
  await assert.rejects(library.importSound(picker()));
  assert.equal(repository.db.assets.get('known.wav'), original, 'F-002: failed creation must preserve bytes the import does not own');
  assert.deepEqual(repository.removed, []); assert.equal(library.snapshot.state.sounds.length, 0);
});
