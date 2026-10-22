import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const run = process.env.SOUNDBOARD_EVIDENCE_DIR ?? 'workflow-artifacts/2026-10-20-playback-indicator-toggle';
await fs.mkdir(run, { recursive: true });
// A dedicated four-second fixture leaves enough time for two UI samples and screenshots.
const rate = 44100, frames = rate * 4, wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
for (let index = 0; index < frames; index++) wav.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 440 * index / rate)), 44 + index * 2);
await fs.writeFile(`${run}/indicator-tone.wav`, wav);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1024, height: 1000 }, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.__positionAudio = { starts: [], maxActive: 0, active: [] };
  window.__positionContexts = [];
  const create = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const context = this, source = create.call(this), start = source.start.bind(source), stop = source.stop.bind(source), disconnect = source.disconnect.bind(source);
    const evidence = window.__positionAudio;
    const contextId = window.__positionContexts.push(context) - 1;
    let id;
    const release = () => { evidence.active = evidence.active.filter(active => active !== id); };
    source.start = (when = 0, offset = 0, duration) => {
      id = evidence.starts.length;
      evidence.starts.push({ id, contextId, clock: context.currentTime, offset, duration });
      evidence.active.push(id); evidence.maxActive = Math.max(evidence.maxActive, evidence.active.length);
      return start(when, offset, duration);
    };
    source.stop = (...args) => { release(); return stop(...args); };
    source.disconnect = (...args) => { release(); return disconnect(...args); };
    source.addEventListener('ended', release);
    return source;
  };
});
const click = name => page.getByRole('button', { name, exact: true }).click();
const start = () => page.getByRole('textbox', { name: 'Start in Sekunden' });
const end = () => page.getByRole('textbox', { name: 'Ende in Sekunden' });
const marker = () => page.getByTestId('playback-position-marker');
const position = () => page.getByTestId('playback-position-text');
const audio = () => page.evaluate(() => window.__positionAudio);
const edit = () => click('tone.wav Ausschnitt bearbeiten, Sound 1');
async function preview() {
  const before = (await audio()).starts.length; await click('▶ Vorschau starten');
  await page.waitForFunction(count => window.__positionAudio.starts.length > count, before);
  await page.getByText('Vorschau läuft …', { exact: true }).waitFor();
}
async function inactive() {
  await page.waitForFunction(() => !document.querySelector('[data-testid="playback-position-marker"]'));
  assert.equal(await position().count(), 0); assert.equal((await audio()).active.length, 0);
  await page.waitForTimeout(120); assert.equal(await marker().count(), 0);
}
async function sample() {
  return page.evaluate(() => {
    const text = document.querySelector('[data-testid="playback-position-text"]'), marker = document.querySelector('[data-testid="playback-position-marker"]'), track = document.querySelector('[data-testid="trim-timeline"]');
    const value = Number(text.textContent.match(/([\d.,]+) s/)[1].replace(',', '.'));
    const box = marker.getBoundingClientRect(), bar = track.getBoundingClientRect();
    const record = window.__positionAudio.starts.at(-1);
    return { seconds: value, fraction: (box.x + box.width / 2 - bar.x) / bar.width, engineSeconds: record.offset + window.__positionContexts[record.contextId].currentTime - record.clock, box: { x: box.x, y: box.y, width: box.width, height: box.height }, track: { x: bar.x, y: bar.y, width: bar.width }, liveRegion: !!text.closest('[aria-live]') };
  });
}
async function measuredPreview(width, screenshot) {
  await page.setViewportSize({ width, height: width === 390 ? 1000 : 1100 });
  await start().fill('1'); await end().fill('2.8'); await preview();
  // Count assertion makes the pre-UI Red an absent feature, after proven actual engine start.
  assert.equal(await position().count(), 1, 'playing preview must expose an absolute current position');
  await page.waitForTimeout(120); const first = await sample();
  await page.waitForTimeout(220); const second = await sample();
  assert.ok(first.seconds >= 1 && second.seconds > first.seconds && second.seconds <= 2.8);
  for (const item of [first, second]) {
    assert.ok(Math.abs(item.seconds - item.engineSeconds) < 0.2, `engine/UI scheduler tolerance: ${JSON.stringify(item)}`);
    assert.ok(Math.abs(item.fraction - item.seconds / 4) < 0.01, 'marker uses full file duration');
    assert.equal(item.liveRegion, false, 'changing position has no live announcements');
    assert.ok(item.box.x >= item.track.x && item.box.x + item.box.width <= item.track.x + item.track.width + 1);
  }
  assert.equal((await audio()).starts.at(-1).offset, 1); assert.ok(Math.abs((await audio()).starts.at(-1).duration - 1.8) < 1e-8);
  for (const locator of [start(), end(), page.getByTestId('trim-timeline'), page.getByRole('button', { name: '▶ Vorschau starten', exact: true })]) {
    const box = await locator.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'controls within viewport');
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${run}/${screenshot}`, fullPage: true });
  return { first, second };
}
async function stored() {
  return page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('local-soundboard', 1);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('state'), read = tx.objectStore('state').get('library'); tx.oncomplete = () => { db.close(); resolve(JSON.parse(read.result)); }; };
  }));
}
async function createBoard(name) { await click('+ Neues Board'); await page.getByRole('textbox', { name: 'Boardname' }).fill(name); await click('Board erstellen'); await page.getByRole('textbox', { name: 'Boardname' }).waitFor({ state: 'hidden' }); }
async function createButton(name) { await click('+ Button hinzufügen'); await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill(name); await click('Button erstellen'); await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).waitFor({ state: 'hidden' }); }
async function padStart(name, method = 'click') {
  const count = (await audio()).starts.length; const pad = page.getByRole('button', { name: `${name} abspielen`, exact: true });
  if (method === 'Enter' || method === 'Space') { await pad.focus(); await pad.press(method); } else await pad[method]();
  await page.waitForFunction(count => window.__positionAudio.starts.length === count + 1, count);
}
async function padStop(name, method = 'click') {
  const count = (await audio()).starts.length; const pad = page.getByRole('button', { name: `${name} abspielen`, exact: true });
  if (method === 'Enter' || method === 'Space') { await pad.focus(); await pad.press(method); } else await pad[method]();
  await page.waitForFunction(() => window.__positionAudio.active.length === 0);
  assert.equal((await audio()).starts.length, count, 'second activation stops without another source start');
}
try {
  await page.goto(process.env.SOUNDBOARD_URL ?? 'http://localhost:8082');
  const chooser = page.waitForEvent('filechooser'); await click('+ Sound importieren'); await (await chooser).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByText('tone.wav', { exact: true }).waitFor(); await edit();
  const desktop = await measuredPreview(1024, 'indicator-desktop-active.png');
  await click('Stopp'); await inactive();
  await preview(); await start().fill('1.1'); await inactive();
  await preview(); await click('Auf volle Datei zurücksetzen'); await inactive(); assert.equal(await start().inputValue(), '0');
  await start().fill(''); assert.equal(await page.getByRole('button', { name: '▶ Vorschau starten', exact: true }).isDisabled(), true);
  await start().fill('1'); await end().fill('2.8'); await preview(); await click('Abbrechen'); await inactive();
  assert.equal((await stored()).sounds[0].trimStartSeconds, 0, 'cancel and previews never save drafts'); await edit();
  const mobile = await measuredPreview(390, 'indicator-mobile-390-active.png');
  await page.waitForFunction(() => window.__positionAudio.active.length === 0); await inactive();
  await preview(); await click('Ausschnitt speichern'); await inactive();
  assert.equal((await stored()).sounds[0].trimStartSeconds, 1);
  await edit(); await preview(); await page.reload(); await inactive(); await edit();
  assert.equal(await start().inputValue(), '1'); assert.equal(await end().inputValue(), '2.8'); await click('Abbrechen');
  await createBoard('Bühne'); await createButton('A'); await createButton('B'); await click('Abspielen');
  await padStart('A'); await padStop('A'); await padStart('A'); await padStart('B');
  assert.equal((await audio()).active.length, 1); assert.equal((await audio()).starts.at(-1).offset, 1); await padStop('B');
  await padStart('A', 'Enter'); await padStop('A', 'Space');
  await padStart('A', 'tap'); await padStop('A', 'tap');
  await padStart('A'); await click('Wiedergabe stoppen'); assert.equal((await audio()).active.length, 0);
  await padStart('A'); await click('Bearbeiten'); assert.equal((await audio()).active.length, 0);
  const beforeEdit = (await audio()).starts.length; await click('A bearbeiten'); await click('Abbrechen'); assert.equal((await audio()).starts.length, beforeEdit);
  await createBoard('Nebenraum'); await click('Board Bühne, 1'); await click('Abspielen'); await padStart('A'); await click('Board Nebenraum, 2'); assert.equal((await audio()).active.length, 0);
  await click('Board Bühne, 1'); await padStart('A'); await page.waitForFunction(() => window.__positionAudio.active.length === 0); await padStart('A'); await padStop('A');
  const board = await audio(); assert.equal(board.maxActive, 1); assert.deepEqual(errors, []);
  const report = { result: 'PASS', browser: browser.version(), schedulerToleranceSeconds: 0.2, desktop, mobile, board, checks: 'absolute nonzero trim; progressing text/marker; engine clock and full-file geometry; stop/end/change/reset/cancel/save/reload cleanup; invalid draft; explicit preview unchanged draft; same/different boardbutton; keyboard Enter/Space; touch; global/mode/board stop', limitations: 'Headless Chrome is silent; no physical iPhone/iPad or Safari execution. Native status/clock tests and iOS export cover contract/bundling only.' };
  await fs.writeFile(`${run}/indicator-browser-evidence.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
