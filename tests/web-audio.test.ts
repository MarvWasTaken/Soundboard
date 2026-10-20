import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalAudio } from '../src/platform/audio.web.ts';
import type { PlaybackEvent } from '../src/platform/contracts.ts';
class FakeSource {
  buffer: unknown; onended: (() => void) | null = null; starts: number[][] = []; stops = 0; disconnects = 0;
  connect() {} start(...args: number[]) { this.starts.push(args); } stop() { this.stops++; } disconnect() { this.disconnects++; }
}
class FakeContext extends EventTarget {
  static latest: FakeContext;
  state = 'suspended'; destination = {}; sources: FakeSource[] = []; resumes = 0;
  constructor() { super(); FakeContext.latest = this; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  async decodeAudioData() { return { duration: 3 }; }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
}
globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
const asset = { source: new Blob(['tone']) };
test('web engine unlocks immediately and starts with an audio-clock offset and duration', async () => {
  const audio = new LocalAudio(); const unlocked = audio.unlockFromGesture();
  assert.equal(FakeContext.latest.resumes, 1); await unlocked;
  await audio.begin(asset, { start: 1, end: 1.75 }, () => {}, new AbortController().signal);
  assert.deepEqual(FakeContext.latest.sources[0].starts, [[0, 1, 0.75]]);
});
test('web ended and stop release nodes once and remove old state listeners', async () => {
  const audio = new LocalAudio(), events: PlaybackEvent[] = []; await audio.unlockFromGesture();
  const handle = await audio.begin(asset, { start: 0, end: 2 }, event => events.push(event), new AbortController().signal);
  const source = FakeContext.latest.sources[0]; assert.ok(source); source.onended?.();
  assert.deepEqual(events, [{ type: 'ended' }]); assert.equal(source.disconnects, 1);
  handle.stop(); FakeContext.latest.dispatchEvent(new Event('statechange'));
  assert.equal(events.length, 1); assert.equal(source.disconnects, 1);
});
test('suspended web context interrupts and cleans the active source', async () => {
  const audio = new LocalAudio(), events: PlaybackEvent[] = []; await audio.unlockFromGesture();
  await audio.begin(asset, { start: 0, end: 2 }, event => events.push(event), new AbortController().signal);
  FakeContext.latest.state = 'suspended'; FakeContext.latest.dispatchEvent(new Event('statechange'));
  assert.deepEqual(events, [{ type: 'interrupted' }]); assert.equal(FakeContext.latest.sources[0].disconnects, 1);
});
test('aborted web decode creates no playing source', async () => {
  const audio = new LocalAudio(); await audio.unlockFromGesture();
  const abort = new AbortController(); abort.abort();
  await assert.rejects(audio.begin(asset, { start: 0, end: 2 }, () => {}, abort.signal));
  assert.equal(FakeContext.latest.sources.length, 0);
});
