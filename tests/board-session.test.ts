import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardSession } from '../src/services/board-session.ts';
import type { LibraryState, Sound } from '../src/domain/model.ts';
const sound: Sound = { id: 's', name: 'Tone', assetKey: 's.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
const button = { id: 'button', label: 'Tone', soundId: 's', x: 0, y: 0, width: 1, height: 1 };
test('edit activations do not play, board switches stop, and play resolves current shared trim for both assignments', () => {
  const state: LibraryState = { version: 1, sounds: [sound], boards: [{ id: 'a', name: 'A', buttons: [button, { ...button, id: 'second', x: 1 }] }, { id: 'b', name: 'B', buttons: [] }] };
  const plays: Sound[] = []; let stops = 0;
  const session = new BoardSession(() => state, { play: async selected => { plays.push(selected); }, stop() { stops++; } });
  session.reconcile(); assert.equal(session.state.boardId, 'a');
  session.setMode('edit'); assert.deepEqual(session.activate('button'), button); assert.equal(plays.length, 0);
  session.setMode('play'); session.activate('button');
  state.sounds = [{ ...sound, trimStartSeconds: 0.5, trimEndSeconds: 1.5 }];
  session.activate('second'); session.activate('button');
  assert.deepEqual(plays.map(entry => [entry.trimStartSeconds, entry.trimEndSeconds]), [[0, 2], [0.5, 1.5], [0.5, 1.5]]);
  const before = stops; session.selectBoard('b'); assert.equal(stops, before + 1); assert.equal(session.state.boardId, 'b');
});
test('deleting the selected or last board chooses a valid empty state and absent sounds cannot be played', () => {
  const state: LibraryState = { version: 1, sounds: [], boards: [{ id: 'a', name: 'A', buttons: [button] }] };
  const session = new BoardSession(() => state, { play: async () => { assert.fail('missing sound'); }, stop() {} });
  session.reconcile(); assert.throws(() => session.activate('button'));
  session.setMode('edit'); assert.deepEqual(session.activate('button'), button);
  state.boards = []; session.reconcile(); assert.equal(session.state.boardId, undefined);
});
