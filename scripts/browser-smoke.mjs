import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' }) });
const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
const url = process.env.SOUNDBOARD_URL ?? 'http://localhost:8081';
async function upload(path) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '+ Sound importieren', exact: true }).click();
  await (await chooser).setFiles(path);
}
async function readStorage() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('local-soundboard', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const read = (store, key) => new Promise((resolve, reject) => { const tx = db.transaction(store); const r = tx.objectStore(store).get(key); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); });
    const state = JSON.parse(await read('state', 'library'));
    const assets = [];
    for (const sound of state.sounds) {
      const blob = await read('assets', sound.assetKey);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer()); await context.close();
      assets.push({ name: sound.name, hash, size: blob.size, duration: buffer.duration });
    }
    db.close(); return { state, assets };
  });
}
try {
  await page.goto(url);
  await page.getByRole('button', { name: '+ Sound importieren', exact: true }).waitFor();
  await page.evaluate(async () => { await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase('local-soundboard'); r.onsuccess = resolve; r.onerror = reject; r.onblocked = () => reject(Error('Close other tabs before running smoke test.')); }); });
  await page.reload();
  for (const extension of ['wav', 'mp3']) {
    await upload(`tests/fixtures/tone.${extension}`);
    await page.getByText(`tone.${extension}`, { exact: true }).waitFor();
    await page.getByRole('button', { name: '+ Sound importieren', exact: true }).waitFor();
  }
  await page.reload(); await page.getByText('tone.mp3', { exact: true }).waitFor();
  const stored = await readStorage(); assert.equal(stored.state.sounds.length, 2);
  for (const asset of stored.assets) {
    const original = await fs.readFile(`tests/fixtures/${asset.name}`);
    assert.equal(asset.hash, createHash('sha256').update(original).digest('hex'));
    assert.ok(asset.duration > 1.9 && asset.duration < 2.2); assert.equal(asset.size, original.length);
  }
  await page.screenshot({ path: 'workflow-artifacts/2026-10-20-soundboard-mvp/library-chrome-ready.png', fullPage: true });
  await upload('tests/fixtures/broken.wav');
  await page.getByText('Die Audiodatei konnte nicht gelesen werden.', { exact: false }).waitFor();
  assert.equal((await readStorage()).state.sounds.length, 2);
  // Abort after request success: success must be tied to transaction completion.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'state') request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
  });
  await upload('tests/fixtures/tone.wav');
  await page.getByText('Der lokale Speichervorgang wurde abgebrochen.', { exact: false }).waitFor();
  assert.equal((await readStorage()).state.sounds.length, 2);
  await page.reload(); await page.getByText('tone.mp3', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('local-soundboard', 1); r.onsuccess = () => resolve(r.result); });
    const state = await new Promise(resolve => { const tx = db.transaction('state'); const r = tx.objectStore('state').get('library'); tx.oncomplete = () => resolve(JSON.parse(r.result)); });
    await new Promise((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(state.sounds[0].assetKey); tx.oncomplete = resolve; tx.onabort = reject; });
    db.close();
  });
  await page.reload(); await page.getByText('Die lokale Audiodatei „tone.wav“ fehlt oder ist nicht lesbar.', { exact: true }).waitFor();
  await page.getByText('tone.mp3', { exact: true }).waitFor();
  await page.screenshot({ path: 'workflow-artifacts/2026-10-20-soundboard-mvp/library-chrome.png', fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ browser: browser.version(), result: 'PASS: real picker, WAV/MP3 IndexedDB byte hashes and decode after reload, damaged audio rejected, real transaction abort preserves state, missing bytes visibly reported', assets: stored.assets }, null, 2));
} finally { await browser.close(); }
