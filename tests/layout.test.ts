import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstFreePosition, updateButton, createButton } from '../src/domain/board.ts';
import type { LibraryState } from '../src/domain/model.ts';
const sound = { id: 's', name: 'Tone', assetKey: 's.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
const state: LibraryState = { version: 1, sounds: [sound], boards: [{ id: 'board', name: 'Board', buttons: [
  { id: 'a', label: 'A', soundId: 's', x: 0, y: 0, width: 1, height: 1 },
  { id: 'b', label: 'B', soundId: 's', x: 1, y: 0, width: 1, height: 1 },
] }] };
test('colliding resize preserves the last valid arrangement and new buttons find free positions', () => {
  const before = structuredClone(state);
  assert.throws(() => updateButton(state, 'board', 'a', { ...state.boards[0].buttons[0], width: 2 }), /Platz|überlapp/);
  assert.deepEqual(state, before); assert.deepEqual(firstFreePosition(state.boards[0].buttons), { x: 0, y: 1 });
  const next = createButton(state, 'board', 'c', 'C', 's');
  assert.deepEqual(next.boards[0].buttons[2], { id: 'c', label: 'C', soundId: 's', x: 0, y: 1, width: 1, height: 1 });
});
test('valid moves and sizes preserve neighbors, reject invalid boundaries and allow growing rows', () => {
  const draft = { ...state.boards[0].buttons[0], y: 1, width: 2, height: 2 };
  const changed = updateButton(state, 'board', 'a', draft);
  assert.equal(changed.boards[0].buttons[0].height, 2); assert.equal(changed.boards[0].buttons[1], state.boards[0].buttons[1]);
  for (const patch of [{ x: -1 }, { x: 2 }, { y: -1 }, { width: 0 }, { width: 3 }, { height: 3 }, { y: NaN }, { y: 0.5 }, { x: 1, width: 2 }]) {
    assert.throws(() => updateButton(state, 'board', 'a', { ...draft, ...patch }));
  }
});
test('free placement accounts for tall/wide blocks and has no small count limit', () => {
  let current: LibraryState = { ...state, boards: [{ ...state.boards[0], buttons: [] }] };
  for (let index = 0; index < 40; index++) current = createButton(current, 'board', `button-${index}`, `Sound ${index}`, 's');
  assert.equal(current.boards[0].buttons.length, 40); assert.deepEqual(firstFreePosition(current.boards[0].buttons), { x: 0, y: 20 });
  const tall = [{ ...state.boards[0].buttons[0], width: 2, height: 2 }];
  assert.deepEqual(firstFreePosition(tall, 2, 2), { x: 0, y: 2 });
});
