import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, renameBoard, deleteBoard, createButton, updateButton, deleteButton } from '../src/domain/board.ts';
import { emptyState } from '../src/domain/model.ts';
import type { LibraryState } from '../src/domain/model.ts';
const sound = { id: 's', name: 'Tone', assetKey: 's.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
const initial: LibraryState = { ...emptyState(), sounds: [sound, { ...sound, id: 'other', name: 'Other', assetKey: 'other.wav' }] };
test('equal board names remain independent, rename is scoped, and empty names are rejected', () => {
  let state = createBoard(createBoard(initial, 'a', ' Board '), 'b', 'Board');
  assert.deepEqual(state.boards.map(board => [board.id, board.name]), [['a', 'Board'], ['b', 'Board']]);
  state = renameBoard(state, 'a', ' Bühne '); assert.equal(state.boards[0].name, 'Bühne'); assert.equal(state.boards[1].name, 'Board');
  assert.throws(() => createBoard(state, 'c', ' ')); assert.throws(() => renameBoard(state, 'a', '')); assert.throws(() => createBoard(state, 'a', 'Duplicate'));
});
test('sound assignment and label changes affect just one button; deletion preserves sounds and other boards', () => {
  let state = createBoard(createBoard(initial, 'a', 'A'), 'b', 'B');
  state = createButton(createButton(state, 'a', 'one', 'One', 's'), 'b', 'two', 'Two', 's');
  const untouched = state.boards[1];
  state = updateButton(state, 'a', 'one', { ...state.boards[0].buttons[0], label: ' Changed ', soundId: 'other' });
  assert.equal(state.boards[0].buttons[0].label, 'Changed'); assert.equal(state.boards[0].buttons[0].soundId, 'other'); assert.equal(state.boards[1], untouched);
  state = deleteButton(state, 'a', 'one'); assert.equal(state.boards[0].buttons.length, 0); assert.deepEqual(state.sounds, initial.sounds);
  state = deleteBoard(state, 'a'); assert.deepEqual(state.boards, [untouched]); assert.deepEqual(state.sounds, initial.sounds);
  state = deleteBoard(state, 'b'); assert.equal(state.boards.length, 0); assert.deepEqual(state.sounds, initial.sounds);
});
test('button drafts require labels and valid sound references', () => {
  const state = createBoard(initial, 'a', 'A');
  assert.throws(() => createButton(state, 'a', 'one', ' ', 's'));
  assert.throws(() => createButton(state, 'a', 'one', 'One', 'missing'));
});
