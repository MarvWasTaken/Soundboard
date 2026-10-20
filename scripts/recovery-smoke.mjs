import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { window.__starts = 0; const create = AudioContext.prototype.createBufferSource; AudioContext.prototype.createBufferSource = function () { window.__starts++; return create.call(this); }; });
const click = name => page.getByRole('button', { name, exact: true }).click();
async function record(action, value) {
  return page.evaluate(async ({ action, value }) => {
    const db = await new Promise(resolve => { const open = indexedDB.open('local-soundboard', 1); open.onsuccess = () => resolve(open.result); });
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(action === 'removeAsset' ? 'assets' : 'state', action === 'read' ? 'readonly' : 'readwrite'), store = tx.objectStore(action === 'removeAsset' ? 'assets' : 'state');
      const request = action === 'read' ? store.get('library') : action === 'removeAsset' ? store.delete(value) : store.put(value, 'library');
      tx.oncomplete = () => resolve(request.result); tx.onabort = reject;
    }); db.close(); return result;
  }, { action, value });
}
async function upload(extension) { const chooser = page.waitForEvent('filechooser'); await click('+ Sound importieren'); await (await chooser).setFiles(`tests/fixtures/tone.${extension}`); await page.getByText(`tone.${extension}`, { exact: true }).waitFor(); }
try {
  await page.goto(process.env.SOUNDBOARD_URL ?? 'http://localhost:8081'); await upload('wav'); await upload('mp3');
  const original = await record('read');
  const cancelled = page.waitForEvent('filechooser'); await click('+ Sound importieren'); await (await cancelled).setFiles([]);
  await page.getByRole('button', { name: '+ Sound importieren', exact: true }).waitFor(); assert.equal(await record('read'), original); assert.equal(await page.getByRole('alert').count(), 0);
  await page.context().setOffline(true);
  await click('+ Neues Board'); await page.getByRole('textbox', { name: 'Boardname' }).fill('Offline board'); await click('Board erstellen');
  for (const [label, sound] of [['Wav', 'tone.wav, Sound 1'], ['Mp3', 'tone.mp3, Sound 2']]) {
    await click('+ Button hinzufügen'); await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill(label); await page.getByRole('radio', { name: sound, exact: true }).click(); await click('Button erstellen');
  }
  await click('Wav bearbeiten'); await click('Nach unten verschieben'); await click('Breit'); await click('Button speichern');
  await click('tone.wav Ausschnitt bearbeiten, Sound 1'); await page.getByRole('textbox', { name: 'Start in Sekunden' }).fill('0.25'); await page.getByRole('textbox', { name: 'Ende in Sekunden' }).fill('1.25'); await click('Ausschnitt speichern');
  await click('Abspielen'); await click('Wav abspielen'); await page.waitForFunction(() => window.__starts === 1); await click('Wiedergabe stoppen');
  await page.context().setOffline(false); const offlineSaved = await record('read'); await page.reload(); await page.getByRole('button', { name: 'Wav abspielen', exact: true }).waitFor(); assert.equal(await record('read'), offlineSaved);
  // Actual transaction abort after request success; editor draft must remain retryable.
  await page.evaluate(() => {
    let abort = true; const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { const request = put.apply(this, args); if (this.name === 'state' && abort) { abort = false; request.addEventListener('success', () => this.transaction.abort()); } return request; };
  });
  await click('Bearbeiten'); await click('Board umbenennen'); await page.getByRole('textbox', { name: 'Boardname' }).fill('Retry after abort'); await click('Namen speichern');
  await page.getByRole('alert').getByText('Der lokale Speichervorgang wurde abgebrochen.', { exact: false }).last().waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Boardname' }).inputValue(), 'Retry after abort'); assert.equal(await record('read'), offlineSaved);
  assert.equal(await page.getByRole('button', { name: 'Namen speichern', exact: true }).isEnabled(), true); await click('Namen speichern');
  await page.getByRole('textbox', { name: 'Boardname' }).waitFor({ state: 'hidden' }); const baseline = await record('read'), valid = JSON.parse(baseline);
  const partial = JSON.stringify({ ...valid, sounds: [...valid.sounds, { bad: true }], boards: [{ ...valid.boards[0], buttons: [...valid.boards[0].buttons, { ...valid.boards[0].buttons[0], id: 'bad', width: 9 }] }] });
  await record('write', partial); await page.reload(); await page.getByText('Ein beschädigter Soundeintrag konnte nicht geladen werden.', { exact: true }).waitFor();
  await page.getByTestId('board-grid').waitFor();
  assert.equal(await page.getByTestId('board-grid').getByRole('button').count(), 2); assert.equal(await record('read'), partial, 'recovery must not rewrite original raw data');
  await record('write', '{broken'); await page.reload(); await page.getByText('Die gespeicherten Daten sind beschädigt.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: '+ Sound importieren', exact: true }).isDisabled(), true); assert.equal(await record('read'), '{broken');
  await record('write', valid); await click('Erneut laden'); await page.getByText('Der lokale Datenbestand hat ein unerwartetes Speicherformat.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: '+ Neues Board', exact: true }).isDisabled(), true); assert.deepEqual(await record('read'), valid);
  await click('tone.wav Ausschnitt bearbeiten, Sound 1'); assert.equal(await page.getByRole('button', { name: 'Ausschnitt speichern', exact: true }).isDisabled(), true);
  await record('write', baseline); await click('Erneut laden'); await page.getByRole('button', { name: 'Wav abspielen', exact: true }).waitFor();
  await record('removeAsset', valid.sounds[0].assetKey); await page.reload(); await page.getByText('Die lokale Audiodatei „tone.wav“ fehlt oder ist nicht lesbar.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Wav abspielen', exact: true }).isDisabled(), true);
  await click('Mp3 abspielen'); await page.waitForFunction(() => window.__starts === 1); await click('Wiedergabe stoppen');
  await page.screenshot({ path: 'workflow-artifacts/2026-10-20-soundboard-mvp/recovery-chrome.png', fullPage: true }); assert.deepEqual(errors, []);
  const report = { browser: browser.version(), result: 'PASS: loaded app works offline; canceled selection unchanged; real commit abort preserves editor/retry; partial recovery never rewrites raw text; broken JSON and unexpected object protected; missing asset disables only affected pad; valid MP3 still plays' };
  await fs.writeFile('workflow-artifacts/2026-10-20-soundboard-mvp/recovery-browser-evidence.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
