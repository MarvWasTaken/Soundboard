import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Playback } from '../src/services/playback.ts';
import type { Sound } from '../src/domain/model.ts';
import type { AudioPlayback, PlaybackEvent, PlaybackHandle } from '../src/platform/contracts.ts';
const sound: Sound = { id: 'a', name: 'A.wav', assetKey: 'a.wav', durationSeconds: 3, trimStartSeconds: 1, trimEndSeconds: 2 };
const second = { ...sound, id: 'b', assetKey: 'b.wav' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const calls: { signal: AbortSignal; event: (event: PlaybackEvent) => void; stopped: boolean; range: {start: number; end: number}; position: number; readError?: boolean }[] = [];
  const audio: AudioPlayback = {
    unlockFromGesture: async () => {},
    begin: async (_asset, range, event, signal) => {
      const call = { range, event, signal, stopped: false, position: range.start, readError: false }; calls.push(call);
      return { getPositionSeconds: () => { if (call.readError) throw Error('clock'); return call.position; }, stop: () => { call.stopped = true; } };
    },
  };
  const tasks = new Map<number, () => void>(); let next = 0;
  const clock = { set(callback: () => void) { tasks.set(++next, callback); return next; }, clear(token: unknown) { tasks.delete(token as number); } };
  const playback = new Playback({ resolve: async () => ({ source: 'local' }) }, audio, clock);
  const poll = () => { const [id, callback] = [...tasks][0]; tasks.delete(id); callback(); };
  return { audio, playback, calls, tasks, clock, poll };
}
test('a second activation owns playback while an earlier delayed handle is stopped', async () => {
  const { audio, playback } = harness();
  const firstHandle = deferred<PlaybackHandle>(); let begins = 0, stoppedFirst = 0;
  const signals: AbortSignal[] = [];
  audio.begin = async (_asset, _range, _event, signal) => { signals.push(signal); return ++begins === 1 ? firstHandle.promise : { stop() {}, getPositionSeconds: () => 1 }; };
  const firstStart = playback.play(sound); await tick();
  await playback.play(second); assert.equal(playback.state.soundId, 'b');
  assert.equal(signals[0].aborted, true);
  firstHandle.resolve({ stop() { stoppedFirst++; }, getPositionSeconds: () => 1 }); await firstStart;
  assert.equal(stoppedFirst, 1); assert.equal(playback.state.soundId, 'b'); assert.equal(playback.state.status, 'playing');
});
test('restarting the same sound stops the prior handle and uses saved or preview ranges', async () => {
  const { playback, calls } = harness(); await playback.play(sound); await playback.play(sound, { start: 0.25, end: 0.75 });
  assert.equal(calls[0].stopped, true); assert.deepEqual(calls.map(call => call.range), [{ start: 1, end: 2 }, { start: 0.25, end: 0.75 }]);
  playback.stop(); playback.stop(); assert.equal(calls[1].stopped, true); assert.equal(playback.state.status, 'idle');
});
test('stop during delayed asset resolution prevents begin', async () => {
  const { audio, calls } = harness(); const asset = deferred<{ source: string }>();
  const playback = new Playback({ resolve: () => asset.promise }, audio);
  const pending = playback.play(sound); await tick(); playback.stop(); asset.resolve({ source: 'local' }); await pending;
  assert.equal(calls.length, 0); assert.equal(playback.state.status, 'idle');
});
test('end, interruption and error events clean the handle and old events cannot affect a new start', async () => {
  const { playback, calls } = harness();
  for (const type of ['ended', 'interrupted', 'error'] as const) {
    await playback.play(sound);
    const call = calls.at(-1)!; call.event(type === 'error' ? { type, message: 'Decoderfehler' } : { type });
    assert.equal(call.stopped, true); assert.equal(playback.state.status, type === 'error' ? 'error' : 'idle');
  }
  await playback.play(second); calls[0].event({ type: 'ended' });
  assert.equal(playback.state.soundId, second.id); assert.equal(playback.state.status, 'playing');
});
test('gesture unlock happens synchronously; rejection is visible and next activation recovers', async () => {
  const { audio, playback, calls } = harness(); let unlocked = false;
  audio.unlockFromGesture = () => { unlocked = true; return Promise.reject(Error('permission')); };
  const pending = playback.play(sound); assert.equal(unlocked, true); await pending;
  assert.equal(playback.state.status, 'error'); assert.ok(playback.state.message); assert.equal(calls.length, 0);
  audio.unlockFromGesture = async () => {}; await playback.play(sound); assert.equal(playback.state.status, 'playing');
});
test('missing assets and start errors are visible and do not prevent later playback', async () => {
  const { playback, audio } = harness();
  audio.begin = async () => { throw Error('decode'); }; await playback.play(sound);
  assert.equal(playback.state.status, 'error');
  const missing = new Playback({ resolve: async () => { throw Error('missing'); } }, audio);
  await missing.play(sound); assert.equal(missing.state.status, 'error');
  audio.begin = async () => ({ stop() {}, getPositionSeconds: () => 1 }); await playback.play(second); assert.equal(playback.state.status, 'playing');
});

test('service publishes absolute engine positions only while playing and bounds invalid readings', async () => {
  const h = harness(); const seen: unknown[] = []; h.playback.subscribe(state => seen.push(state));
  await h.playback.play(sound);
  assert.equal(h.playback.state.positionSeconds, 1);
  assert.equal(h.tasks.size, 1);
  h.calls[0].position = 1.6; h.poll(); assert.equal(h.playback.state.positionSeconds, 1.6);
  const count = seen.length; h.poll(); assert.equal(seen.length, count);
  h.calls[0].position = NaN; h.poll(); assert.equal(h.playback.state.positionSeconds, 1.6);
  h.calls[0].position = Infinity; h.poll(); assert.equal(h.playback.state.positionSeconds, 1.6);
  h.calls[0].position = -1; h.poll(); assert.equal(h.playback.state.positionSeconds, 1);
  h.calls[0].position = 4; h.poll(); assert.equal(h.playback.state.positionSeconds, 2);
  h.playback.stop(); assert.equal(h.playback.state.positionSeconds, undefined); assert.equal(h.tasks.size, 0);
});
test('loading has no timer; terminal and stale callbacks cannot recreate positions or polling', async () => {
  const h = harness(); const delayed = deferred<PlaybackHandle>(); h.audio.begin = () => delayed.promise;
  const pending = h.playback.play(sound); await tick();
  assert.equal(h.playback.state.positionSeconds, undefined); assert.equal(h.tasks.size, 0);
  h.playback.stop(); delayed.resolve({ stop() {}, getPositionSeconds: () => 1.5 }); await pending;
  assert.equal(h.tasks.size, 0);
  for (const type of ['ended', 'interrupted', 'error', 'stop'] as const) {
    const h = harness(); await h.playback.play(sound); const stale = [...h.tasks.values()][0];
    if (type === 'stop') h.playback.stop();
    else h.calls[0].event(type === 'error' ? { type, message: 'bad' } : { type });
    assert.equal(h.playback.state.positionSeconds, undefined); assert.equal(h.tasks.size, 0);
    await h.playback.play(second); const current = h.playback.state;
    stale(); assert.equal(h.playback.state, current); assert.equal(h.tasks.size, 1); h.playback.stop();
  }
});
test('synchronous subscriber stop and throwing position reads leave no resources', async () => {
  const h = harness(); h.playback.subscribe(state => { if (state.status === 'playing') h.playback.stop(); });
  await h.playback.play(sound); assert.equal(h.tasks.size, 0); assert.equal(h.calls[0].stopped, true);
  const next = harness(); await next.playback.play(sound); next.calls[0].readError = true; next.poll();
  assert.equal(next.playback.state.status, 'error'); assert.ok(next.playback.state.message);
  assert.equal(next.playback.state.positionSeconds, undefined); assert.equal(next.tasks.size, 0); assert.equal(next.calls[0].stopped, true);
});
test('terminal event before handle adoption and repeated starts never retain polling', async () => {
  const h = harness(); let stopped = 0;
  h.audio.begin = async (_asset, _range, event) => { event({ type: 'ended' }); return { stop() { stopped++; }, getPositionSeconds: () => 1 }; };
  await h.playback.play(sound); assert.equal(h.playback.state.status, 'idle'); assert.equal(stopped, 1); assert.equal(h.tasks.size, 0);
  const next = harness();
  for (let index = 0; index < 12; index++) { await next.playback.play(sound); assert.equal(next.tasks.size, 1); next.playback.stop(); assert.equal(next.tasks.size, 0); }
});
