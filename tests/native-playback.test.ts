import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginNativePlayback, inspectNativePlayer } from '../src/platform/native-playback.ts';
import type { NativePlayer, NativeStatus, PlaybackClock } from '../src/platform/native-playback.ts';
import type { PlaybackEvent } from '../src/platform/contracts.ts';
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  let listener: ((status: NativeStatus) => void) | undefined;
  const tasks = new Map<number, { callback: () => void; milliseconds: number }>(); let timerId = 0;
  const clock: PlaybackClock = { set(callback, milliseconds) { tasks.set(++timerId, { callback, milliseconds }); return timerId; }, clear(token) { tasks.delete(token as number); } };
  const events: PlaybackEvent[] = []; const seeks: (number | undefined)[][] = []; let plays = 0, removed = 0, paused = 0;
  const initial: NativeStatus = { isLoaded: true, duration: 3, currentTime: 0, playing: false, isBuffering: false, didJustFinish: false, error: null };
  function emit(patch: Partial<NativeStatus>) { player.currentStatus = { ...player.currentStatus, ...patch }; listener?.(player.currentStatus); }
  const player: NativePlayer = {
    currentStatus: initial,
    addListener(_event, next) { listener = next; return { remove() { listener = undefined; } }; },
    async seekTo(...args) { seeks.push(args); emit({ currentTime: args[0] }); },
    play() { plays++; emit({ playing: true }); }, pause() { paused++; }, remove() { removed++; },
  };
  return { player, clock, events, tasks, seeks, emit, counters: () => ({ plays, removed, paused, listening: !!listener }) };
}
test('native playback seeks first and schedules the endpoint only after actual playing status', async () => {
  const h = harness(); let finishSeek!: () => void;
  h.player.seekTo = (...args) => { h.seeks.push(args); return new Promise(resolve => { finishSeek = resolve; }); };
  const pending = beginNativePlayback(h.player, { start: 1, end: 2 }, event => h.events.push(event), new AbortController().signal, h.clock);
  await flush(); assert.deepEqual(h.seeks, [[1, 0, 0]]); assert.equal(h.counters().plays, 0);
  assert.ok([...h.tasks.values()].every(task => task.milliseconds >= 15000));
  h.emit({ currentTime: 1 }); finishSeek(); const handle = await pending;
  assert.equal(h.counters().plays, 1); assert.deepEqual([...h.tasks.values()].map(task => task.milliseconds), [1000]);
  handle.stop(); handle.stop(); assert.equal(h.tasks.size, 0); assert.deepEqual(h.counters(), { plays: 1, removed: 1, paused: 1, listening: false });
});
test('abort during native seek removes the player and never calls play later', async () => {
  const h = harness(); let finishSeek!: () => void;
  h.player.seekTo = () => new Promise(resolve => { finishSeek = resolve; });
  const abort = new AbortController(); const pending = beginNativePlayback(h.player, { start: 1, end: 2 }, () => {}, abort.signal, h.clock);
  await flush(); abort.abort(); await assert.rejects(pending); finishSeek(); await flush();
  assert.equal(h.counters().plays, 0); assert.equal(h.counters().removed, 1); assert.equal(h.tasks.size, 0);
});
test('buffering clears the timer; resume recomputes remaining duration and endpoint cleans all resources', async () => {
  const h = harness(); await beginNativePlayback(h.player, { start: 0, end: 2 }, event => h.events.push(event), new AbortController().signal, h.clock);
  h.emit({ isBuffering: true, playing: false, currentTime: 0.5 }); assert.equal(h.tasks.size, 0); assert.equal(h.events.length, 0);
  h.emit({ isBuffering: false, playing: true, currentTime: 1.5 });
  assert.deepEqual([...h.tasks.values()].map(task => task.milliseconds), [500]);
  [...h.tasks.values()][0].callback();
  assert.deepEqual(h.events, [{ type: 'ended' }]); assert.equal(h.tasks.size, 0); assert.equal(h.counters().removed, 1);
});
test('native pause/interruption, errors and observed endpoint stop without automatic resume', async () => {
  for (const patch of [{ playing: false }, { error: 'decoder' }, { currentTime: 2 }, { mediaServicesDidReset: true }]) {
    const h = harness(); await beginNativePlayback(h.player, { start: 0, end: 2 }, event => h.events.push(event), new AbortController().signal, h.clock);
    h.emit(patch); assert.equal(h.events.length, 1); assert.equal(h.counters().removed, 1); assert.equal(h.tasks.size, 0);
    h.emit({ playing: true }); assert.equal(h.counters().plays, 1);
  }
});
test('native load timeout rejects visibly and clears subscriptions and timers', async () => {
  const h = harness(); h.player.currentStatus = { ...h.player.currentStatus, isLoaded: false };
  const pending = beginNativePlayback(h.player, { start: 0, end: 2 }, () => {}, new AbortController().signal, h.clock);
  await flush(); assert.equal(h.tasks.size, 1); [...h.tasks.values()][0].callback();
  await assert.rejects(pending); assert.equal(h.counters().removed, 1); assert.equal(h.tasks.size, 0);
});
test('native listener setup failure releases the player and startup timer', async () => {
  const h = harness(); h.player.addListener = () => { throw Error('engine reset'); };
  await assert.rejects(beginNativePlayback(h.player, { start: 0, end: 2 }, () => {}, new AbortController().signal, h.clock));
  assert.equal(h.tasks.size, 0); assert.equal(h.counters().removed, 1);
});
test('native inspection cleans its player and listeners without starting playback', async () => {
  const h = harness(); assert.deepEqual(await inspectNativePlayer(h.player, h.clock), { durationSeconds: 3 });
  assert.equal(h.counters().plays, 0); assert.equal(h.counters().removed, 1); assert.equal(h.counters().listening, false); assert.equal(h.tasks.size, 0);
});
test('native inspection setup error leaves no delayed timer callback or retained player', async () => {
  const h = harness(); h.player.addListener = () => { throw Error('engine reset'); };
  await assert.rejects(inspectNativePlayer(h.player, h.clock));
  assert.equal(h.tasks.size, 0); assert.equal(h.counters().removed, 1);
});
test('native adapters wait for a positive duration even when the loaded flag arrives first', async () => {
  for (const operation of ['inspect', 'playback']) {
    const h = harness(); h.player.currentStatus.duration = 0;
    const pending = (operation === 'inspect' ? inspectNativePlayer(h.player, h.clock) : beginNativePlayback(h.player, { start: 0, end: 2 }, () => {}, new AbortController().signal, h.clock))
      .then(value => ({ value }), error => ({ error }));
    await flush(); assert.equal(h.counters().removed, 0); assert.equal(h.seeks.length, 0);
    h.emit({ duration: 3 }); const result = await pending; assert.ok('value' in result);
    if ('value' in result && result.value && 'stop' in result.value) result.value.stop();
  }
});

test('native position follows confirmed statuses, holds during buffering and ignores invalid or late values', async () => {
  const h = harness();
  const handle = await beginNativePlayback(h.player, { start: 1, end: 2.5 }, () => {}, new AbortController().signal, h.clock);
  const read = () => (handle as { getPositionSeconds?: () => number }).getPositionSeconds?.();
  assert.equal(read(), 1);
  h.emit({ currentTime: 1.4 }); assert.equal(read(), 1.4);
  h.emit({ currentTime: 1.8, isBuffering: true, playing: false }); assert.equal(read(), 1.4);
  h.emit({ currentTime: NaN, isBuffering: false, playing: true }); assert.equal(read(), 1.4);
  h.emit({ currentTime: Infinity }); assert.equal(read(), 1.4); assert.equal(h.counters().removed, 0, 'invalid status time must not falsely end playback');
  h.emit({ currentTime: -4 }); assert.equal(read(), 1);
  h.emit({ currentTime: 1.7 }); handle.stop(); h.emit({ currentTime: 2.1 }); assert.equal(read(), 1.7);
});
