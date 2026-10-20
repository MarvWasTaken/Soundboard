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
  const calls: { signal: AbortSignal; event: (event: PlaybackEvent) => void; stopped: boolean; range: {start: number; end: number} }[] = [];
  const audio: AudioPlayback = {
    unlockFromGesture: async () => {},
    begin: async (_asset, range, event, signal) => {
      const call = { range, event, signal, stopped: false }; calls.push(call);
      return { stop: () => { call.stopped = true; } };
    },
  };
  const playback = new Playback({ resolve: async () => ({ source: 'local' }) }, audio);
  return { audio, playback, calls };
}
test('a second activation owns playback while an earlier delayed handle is stopped', async () => {
  const { audio, playback } = harness();
  const firstHandle = deferred<PlaybackHandle>(); let begins = 0, stoppedFirst = 0;
  const signals: AbortSignal[] = [];
  audio.begin = async (_asset, _range, _event, signal) => { signals.push(signal); return ++begins === 1 ? firstHandle.promise : { stop() {} }; };
  const firstStart = playback.play(sound); await tick();
  await playback.play(second); assert.equal(playback.state.soundId, 'b');
  assert.equal(signals[0].aborted, true);
  firstHandle.resolve({ stop() { stoppedFirst++; } }); await firstStart;
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
  audio.begin = async () => ({ stop() {} }); await playback.play(second); assert.equal(playback.state.status, 'playing');
});
