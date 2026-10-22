import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardSession } from '../src/services/board-session.ts';
import type { LibraryState, Sound } from '../src/domain/model.ts';
const sound: Sound = { id: 's', name: 'Tone', assetKey: 's.wav', durationSeconds: 2, trimStartSeconds: 0, trimEndSeconds: 2 };
const button = { id: 'button', label: 'Tone', soundId: 's', x: 0, y: 0, width: 1, height: 1 };
test('edit activations do not play, board switches stop, and play resolves current shared trim for both assignments', () => {
  const state: LibraryState = { version: 1, sounds: [sound], boards: [{ id: 'a', name: 'A', buttons: [button, { ...button, id: 'second', x: 1 }] }, { id: 'b', name: 'B', buttons: [] }] };
  const plays: Sound[] = []; let stops = 0;
  const session = new BoardSession(() => state, { toggleBoardButton: async selected => { plays.push(selected); }, stop() { stops++; } });
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
  const session = new BoardSession(() => state, { toggleBoardButton: async () => { assert.fail('missing sound'); }, stop() {} });
  session.reconcile(); assert.throws(() => session.activate('button'));
  session.setMode('edit'); assert.deepEqual(session.activate('button'), button);
  state.boards = []; session.reconcile(); assert.equal(session.state.boardId, undefined);
});

import { Playback } from '../src/services/playback.ts';
import type { AudioPlayback, PlaybackEvent, PlaybackHandle } from '../src/platform/contracts.ts';
const flush = () => new Promise(resolve => setImmediate(resolve));
function toggleHarness() {
  const state: LibraryState = { version: 1, sounds: [sound], boards: [{ id: 'a', name: 'A', buttons: [button, { ...button, id: 'second' }] }, { id: 'b', name: 'B', buttons: [button] }] };
  const calls: { stopped: boolean; event: (event: PlaybackEvent) => void; signal: AbortSignal; range: unknown }[] = [];
  const audio: AudioPlayback = { unlockFromGesture: async () => {}, async begin(_asset, range, event, signal) {
    const call = { stopped: false, event, signal, range }; calls.push(call);
    return { stop() { call.stopped = true; }, getPositionSeconds: () => range.start };
  } };
  const tasks = new Map<number, () => void>(); let id = 0;
  const repository = { resolve: async () => ({ source: 'local' }) };
  const playback = new Playback(repository, audio, { set(callback) { tasks.set(++id, callback); return id; }, clear(token) { tasks.delete(token as number); } });
  const session = new BoardSession(() => state, playback); session.reconcile();
  return { state, calls, audio, repository, playback, session, tasks };
}
test('same concrete boardbutton stops on second press and restarts on third', async () => {
  const h = toggleHarness(); h.session.activate('button'); await flush();
  h.session.activate('button'); await flush();
  assert.equal(h.playback.state.status, 'idle'); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].stopped, true); assert.equal(h.tasks.size, 0);
  h.session.activate('button'); await flush(); assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1].range, { start: 0, end: 2 }); h.playback.stop();
});
test('different buttons sharing a sound replace, and identical button IDs on different boards are distinct', async () => {
  const h = toggleHarness(); h.session.activate('button'); await flush(); h.session.activate('second'); await flush();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[0].stopped, true);
  // Change selected identity without the separate board-switch cleanup to exercise the origin contract.
  h.session.activate('button'); await flush();
  h.session.state.boardId = 'b'; h.session.activate('button'); await flush();
  assert.equal(h.calls.length, 4); assert.equal(h.calls[2].stopped, true); h.playback.stop();
});
test('terminal events, global stop, explicit play, mode and board changes release board origin', async () => {
  for (const finish of ['ended', 'interrupted', 'error', 'stop', 'explicit', 'mode', 'board'] as const) {
    const h = toggleHarness(); h.session.activate('button'); await flush();
    if (finish === 'stop') h.playback.stop();
    else if (finish === 'explicit') await h.playback.play(sound);
    else if (finish === 'mode') { h.session.setMode('edit'); h.session.setMode('play'); }
    else if (finish === 'board') { h.session.selectBoard('b'); h.session.selectBoard('a'); }
    else h.calls[0].event(finish === 'error' ? { type: finish, message: 'decoder' } : { type: finish });
    const before = h.calls.length; h.session.activate('button'); await flush(); assert.equal(h.calls.length, before + 1, finish); assert.equal(h.playback.state.status, 'playing'); h.playback.stop();
  }
});
test('loading A–A, A–B, A–A–A cancel pending resolution and only the last intended sound begins', async () => {
  for (const sequence of [['button', 'button'], ['button', 'second'], ['button', 'button', 'button']]) {
    const h = toggleHarness(); const resolves: (() => void)[] = [];
    h.repository.resolve = () => new Promise(resolve => resolves.push(() => resolve({ source: 'local' })));
    for (const id of sequence) { h.session.activate(id); await flush(); }
    resolves.forEach(resolve => resolve()); await flush();
    assert.equal(h.calls.length, sequence.length === 2 && sequence[1] === 'button' ? 0 : 1);
    assert.equal(h.playback.state.status, h.calls.length ? 'playing' : 'idle'); h.playback.stop(); assert.equal(h.tasks.size, 0);
  }
});
test('a late handle after A–A–A is stopped and its events cannot displace the last A', async () => {
  const h = toggleHarness(); let resolveOld!: (handle: PlaybackHandle) => void, oldEvent!: (event: PlaybackEvent) => void, stopped = 0, begins = 0;
  const begin = h.audio.begin;
  h.audio.begin = (...args) => { begins++; if (begins > 1) return begin(...args); oldEvent = args[2]; return new Promise(resolve => { resolveOld = resolve; }); };
  h.session.activate('button'); await flush(); h.session.activate('button'); await flush(); h.session.activate('button'); await flush();
  assert.equal(begins, 2); assert.equal(h.playback.state.status, 'playing');
  resolveOld({ stop() { stopped++; }, getPositionSeconds: () => 0 }); await flush(); oldEvent({ type: 'ended' });
  assert.equal(stopped, 1); assert.equal(h.playback.state.status, 'playing'); assert.equal(h.tasks.size, 1); h.playback.stop();
});
