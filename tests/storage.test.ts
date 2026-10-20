import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverState } from '../src/domain/validation.ts';
const sound = { id: 'a', name: 'A.wav', assetKey: 'a.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
test('recovery retains valid entries and reports damaged entries without rewriting', () => {
  const result = recoverState({ version: 1, sounds: [sound, { ...sound, id: 'b', durationSeconds: -2 }], boards: [] });
  assert.deepEqual(result.state.sounds, [sound]); assert.ok(result.warnings.length); assert.equal(result.readOnly, false);
});
test('unparseable JSON and unknown schema are protected against overwrite', () => {
  for (const raw of ['{bad', { version: 22 }]) {
    const result = recoverState(raw); assert.equal(result.readOnly, true); assert.ok(result.warnings.length);
  }
});
test('fresh storage is writable and empty', () => {
  assert.equal(recoverState(undefined).readOnly, false); assert.equal(recoverState(undefined).state.sounds.length, 0);
});
test('unsafe asset keys and nonfinite or invalid trims are reported', () => {
  for (const patch of [{ assetKey: '../elsewhere' }, { trimStartSeconds: NaN }, { trimEndSeconds: 3 }, { trimStartSeconds: 2 }]) {
    const result = recoverState({ version: 1, sounds: [{ ...sound, ...patch }], boards: [] });
    assert.equal(result.state.sounds.length, 0); assert.ok(result.warnings.length);
  }
});
test('recovery preserves valid buttons including unavailable sound references and rejects colliding or invalid entries', () => {
  const button = { id: 'one', label: 'One', soundId: 'missing', x: 0, y: 0, width: 1, height: 1 };
  const raw = { version: 1, sounds: [sound], boards: [{ id: 'board', name: 'Stage', buttons: [button, { ...button, id: 'bad', width: 3 }, { ...button, id: 'collision' }, { ...button, id: 'two', x: 1 }] }] };
  const before = structuredClone(raw); const result = recoverState(raw);
  assert.equal(result.state.boards[0].buttons.length, 2); assert.equal(result.state.boards[0].buttons[0].soundId, 'missing');
  assert.ok(result.warnings.length >= 2); assert.deepEqual(raw, before);
});
