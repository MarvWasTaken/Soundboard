import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const run = process.env.SOUNDBOARD_EVIDENCE_DIR ?? 'workflow-artifacts/2026-10-20-soundboard-mvp';
await fs.mkdir(run, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const evidence = window.__audioEvidence = { starts: [], ends: [], stops: [], unlocks: [], maxActive: 0 };
  const active = new Set(); let sourceId = 0;
  window.__audioContexts = [];
  const originalResume = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function () {
    evidence.unlocks.push({ gesture: navigator.userActivation.isActive });
    return originalResume.call(this);
  };
  const originalCreate = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const context = this;
    if (!window.__audioContexts.includes(context)) window.__audioContexts.push(context);
    const source = originalCreate.call(context), id = ++sourceId;
    const originalStart = source.start.bind(source), originalStop = source.stop.bind(source), originalDisconnect = source.disconnect.bind(source);
    const analyser = context.createAnalyser(); analyser.fftSize = 2048;
    const muted = context.createGain(); muted.gain.value = 0; analyser.connect(muted); muted.connect(context.destination);
    let sampler; const floats = new Float32Array(analyser.fftSize);
    source.start = function (when = 0, offset = 0, duration) {
      const record = { id, at: context.currentTime, offset, duration, maxRms: 0, frequency: 0 };
      const data = source.buffer.getChannelData(0); const first = Math.round(offset * source.buffer.sampleRate);
      const count = Math.min(8192, data.length - first); let crossings = 0;
      for (let i = first + 1; i < first + count; i++) if (data[i - 1] < 0 && data[i] >= 0) crossings++;
      record.frequency = crossings / (count / source.buffer.sampleRate);
      evidence.starts.push(record); active.add(id); evidence.maxActive = Math.max(evidence.maxActive, active.size);
      source.connect(analyser);
      sampler = setInterval(() => { analyser.getFloatTimeDomainData(floats); record.maxRms = Math.max(record.maxRms, Math.sqrt(floats.reduce((sum, sample) => sum + sample * sample, 0) / floats.length)); }, 20);
      return originalStart(when, offset, duration);
    };
    source.stop = function (...args) { evidence.stops.push({ id, at: context.currentTime }); active.delete(id); return originalStop(...args); };
    source.disconnect = function () { clearInterval(sampler); analyser.disconnect(); muted.disconnect(); return originalDisconnect(); };
    source.addEventListener('ended', () => { active.delete(id); evidence.ends.push({ id, at: context.currentTime }); });
    return source;
  };
});
async function upload(extension) {
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '+ Sound importieren', exact: true }).click();
  await (await chooser).setFiles(`tests/fixtures/tone.${extension}`); await page.getByText(`tone.${extension}`, { exact: true }).waitFor();
}
async function stored() {
  return page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('local-soundboard', 1); request.onsuccess = () => resolve(request.result); });
    const read = (store, key) => new Promise(resolve => { const tx = db.transaction(store), request = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(request.result); });
    const state = JSON.parse(await read('state', 'library'));
    const wav = state.sounds.find(sound => sound.name === 'tone.wav');
    const blob = await read('assets', wav.assetKey);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
    db.close(); return { state, hash };
  });
}
const edit = () => page.getByRole('button', { name: 'tone.wav Ausschnitt bearbeiten, Sound 1', exact: true }).click();
const play = () => page.getByRole('button', { name: 'tone.wav anhören, Sound 1', exact: true }).click();
const evidence = () => page.evaluate(() => window.__audioEvidence);
const ready = () => page.getByRole('button', { name: 'Wiedergabe stoppen', exact: true }).isDisabled();
try {
  await page.goto(process.env.SOUNDBOARD_URL ?? 'http://localhost:8081');
  await upload('wav'); await upload('mp3');
  assert.equal((await evidence()).starts.length, 0, 'import must not start audio');
  await edit();
  const start = page.getByRole('textbox', { name: 'Start in Sekunden' }), end = page.getByRole('textbox', { name: 'Ende in Sekunden' });
  await start.fill('1,1'); await end.fill('1.7');
  await page.getByRole('button', { name: '▶ Vorschau starten', exact: true }).click();
  await page.waitForFunction(() => window.__audioEvidence.ends.length === 1);
  const first = await evidence();
  assert.equal(first.starts[0].offset, 1.1); assert.ok(Math.abs(first.starts[0].duration - 0.6) < 1e-8);
  assert.ok(first.starts[0].maxRms > 0.05, 'real analyser must observe a non-silent signal');
  assert.ok(first.starts[0].frequency > 850 && first.starts[0].frequency < 910, 'selected second tone is 880 Hz');
  const elapsed = first.ends[0].at - first.starts[0].at; assert.ok(elapsed >= 0.57 && elapsed < 0.85, `audio clock endpoint ${elapsed}`);
  assert.equal((await stored()).state.sounds[0].trimStartSeconds, 0, 'preview must not save draft');
  await page.screenshot({ path: `${run}/trim-editor-chrome.png`, fullPage: true });
  await start.fill(''); assert.equal(await page.getByRole('button', { name: 'Ausschnitt speichern', exact: true }).isDisabled(), true);
  await start.fill('1,1'); await page.getByRole('button', { name: 'Ausschnitt speichern', exact: true }).click();
  await page.getByRole('button', { name: 'tone.wav Ausschnitt bearbeiten, Sound 1', exact: true }).waitFor();
  await edit(); await start.fill('0.25'); await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  const afterCancel = await stored(); assert.equal(afterCancel.state.sounds[0].trimStartSeconds, 1.1);
  assert.equal(afterCancel.hash, createHash('sha256').update(await fs.readFile('tests/fixtures/tone.wav')).digest('hex'));
  await page.reload(); await edit(); assert.equal(await start.inputValue(), '1.1'); assert.equal(await end.inputValue(), '1.7');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  // Evidence is reset by actual reload; now verify restart, stop and real context suspension.
  await play(); await page.waitForFunction(() => window.__audioEvidence.starts.length === 1);
  await play(); await page.waitForFunction(() => window.__audioEvidence.starts.length === 2);
  await page.getByRole('button', { name: 'Wiedergabe stoppen', exact: true }).click(); assert.equal(await ready(), true);
  let restarted = await evidence(); assert.equal(restarted.maxActive, 1); assert.ok(restarted.stops.some(stop => stop.id === restarted.starts[0].id));
  assert.equal(restarted.starts[1].offset, 1.1);
  await play(); await page.waitForFunction(() => window.__audioEvidence.starts.length === 3);
  await page.evaluate(() => window.__audioContexts[0].suspend());
  await page.getByText('Wiedergabe unterbrochen. Zum Fortsetzen erneut starten.', { exact: true }).waitFor(); assert.equal(await ready(), true);
  await play(); await page.waitForFunction(() => window.__audioEvidence.starts.length === 4);
  await page.waitForFunction(() => window.__audioEvidence.ends.some(end => end.id === window.__audioEvidence.starts[3].id));
  await page.getByText('Bereit für deinen Sound.', { exact: true }).waitFor();
  const final = await evidence(); assert.equal(final.maxActive, 1); assert.ok(final.unlocks.every(unlock => unlock.gesture));
  await page.screenshot({ path: `${run}/playback-chrome.png`, fullPage: true });
  const mp3Play = page.getByRole('button', { name: 'tone.mp3 anhören, Sound 2', exact: true });
  await mp3Play.click(); await page.waitForFunction(() => window.__audioEvidence.starts.length === 5);
  await page.waitForFunction(() => window.__audioEvidence.ends.some(end => end.id === window.__audioEvidence.starts[4].id));
  const withMp3 = await evidence(); assert.ok(withMp3.starts[4].maxRms > 0.05); assert.ok(withMp3.starts[4].duration > 2);
  // Deliberately corrupt durable bytes after import: a decoder failure during playback must recover.
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('local-soundboard', 1); request.onsuccess = () => resolve(request.result); });
    const state = await new Promise(resolve => { const tx = db.transaction('state'), request = tx.objectStore('state').get('library'); tx.oncomplete = () => resolve(JSON.parse(request.result)); });
    await new Promise((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put(new Blob(['damaged mp3']), state.sounds[1].assetKey); tx.oncomplete = resolve; tx.onabort = reject; }); db.close();
  });
  await mp3Play.click(); await page.getByRole('alert').getByText('Die Audiodatei konnte nicht decodiert werden.', { exact: false }).waitFor();
  await play(); await page.waitForFunction(() => window.__audioEvidence.starts.length === 6);
  await page.getByRole('button', { name: 'Wiedergabe stoppen', exact: true }).click();
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), preview: first, previewElapsedAudioSeconds: elapsed, restartStopInterrupt: final, mp3Playback: withMp3.starts[4], result: 'PASS: real WAV/MP3 WebAudio signals, 880 Hz trimmed segment, engine endpoint, unchanged bytes, save/cancel/reload, restart/stop/context interruption, decoder error and recovery' };
  await fs.writeFile(`${run}/playback-browser-evidence.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
