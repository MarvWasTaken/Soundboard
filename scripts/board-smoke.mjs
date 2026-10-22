import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const run = process.env.SOUNDBOARD_EVIDENCE_DIR ?? 'workflow-artifacts/2026-10-20-soundboard-mvp';
await fs.mkdir(run, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1024, height: 1000 }, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.__boardAudio = { starts: [], stops: [] };
  const create = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const source = create.call(this), start = source.start.bind(source), stop = source.stop.bind(source);
    source.start = (...args) => { window.__boardAudio.starts.push(args); return start(...args); };
    source.stop = (...args) => { window.__boardAudio.stops.push(args); return stop(...args); };
    return source;
  };
});
const click = name => page.getByRole('button', { name, exact: true }).click();
async function state() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('local-soundboard', 1);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('state'), read = tx.objectStore('state').get('library'); tx.oncomplete = () => { db.close(); resolve(JSON.parse(read.result)); }; tx.onabort = reject; };
  }));
}
async function upload(extension) {
  const chooser = page.waitForEvent('filechooser'); await click('+ Sound importieren'); await (await chooser).setFiles(`tests/fixtures/tone.${extension}`);
  await page.getByText(`tone.${extension}`, { exact: true }).waitFor();
}
async function createBoard(name) { await click('+ Neues Board'); await page.getByRole('textbox', { name: 'Boardname' }).fill(name); await click('Board erstellen'); await page.getByRole('textbox', { name: 'Boardname' }).waitFor({ state: 'hidden' }); }
async function createButton(label, sound) {
  await click('+ Button hinzufügen'); await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill(label);
  if (sound) await page.getByRole('radio', { name: sound, exact: true }).click();
  const checked = page.getByRole('radio', { checked: true }); assert.equal(await checked.count(), 1); assert.equal(await checked.getAttribute('aria-checked'), 'true');
  await click('Button erstellen'); await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).waitFor({ state: 'hidden' });
}
const audio = () => page.evaluate(() => window.__boardAudio);
const pads = () => page.getByTestId('board-grid').getByRole('button');
async function removeBoard() { await click('Board löschen'); await click('Board löschen bestätigen'); await page.getByRole('button', { name: 'Board löschen bestätigen', exact: true }).waitFor({ state: 'hidden' }); }
try {
  await page.goto(process.env.SOUNDBOARD_URL ?? 'http://localhost:8081');
  await upload('wav'); await upload('mp3'); await createBoard('Bühne');
  assert.equal(await page.getByRole('button', { name: 'Bearbeiten', exact: true }).getAttribute('aria-pressed'), 'true');
  for (let index = 1; index <= 12; index++) await createButton(`Pad ${String(index).padStart(2, '0')}`);
  assert.equal(await pads().count(), 12); const first = await state(); assert.equal(first.boards[0].buttons.length, 12);
  assert.deepEqual(first.boards[0].buttons.map(button => [button.x, button.y]), Array.from({ length: 12 }, (_, i) => [i % 2, Math.floor(i / 2)]));
  await click('Pad 01 bearbeiten'); await click('Breit');
  await page.getByRole('alert').getByText('Hier ist nicht genug Platz.', { exact: false }).waitFor();
  await page.getByText('Spalte 1 · Zeile 1 · 1 × 1 Felder', { exact: true }).waitFor();
  await click('Nach links verschieben'); await page.getByRole('alert').getByText('Der Button muss im Raster bleiben.', { exact: false }).waitFor();
  await click('Button speichern'); assert.deepEqual((await state()).boards[0].buttons, first.boards[0].buttons);
  await click('Pad 12 bearbeiten'); await click('Nach unten verschieben'); await click('Nach links verschieben'); await click('Groß'); await click('Button speichern');
  let saved = await state(); const moved = saved.boards[0].buttons.at(-1); assert.deepEqual([moved.x, moved.y, moved.width, moved.height], [0, 6, 2, 2]);
  await createButton('Temporär'); saved = await state(); assert.deepEqual([saved.boards[0].buttons.at(-1).x, saved.boards[0].buttons.at(-1).y], [1, 5]);
  await click('Temporär bearbeiten'); await click('Button entfernen'); assert.equal((await state()).boards[0].buttons.length, 12);
  await click('Pad 01 bearbeiten'); await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill('Applaus'); await page.getByRole('radio', { name: 'tone.mp3, Sound 2', exact: true }).click();
  assert.equal(await page.getByRole('radio', { name: 'tone.mp3, Sound 2', exact: true }).getAttribute('aria-checked'), 'true');
  assert.equal(await page.getByRole('radio', { name: 'tone.wav, Sound 1', exact: true }).getAttribute('aria-checked'), 'false');
  await click('Button speichern');
  saved = await state(); assert.equal(saved.boards[0].buttons[0].soundId, saved.sounds[1].id); assert.equal(saved.boards[0].buttons[1].soundId, saved.sounds[0].id);
  assert.equal((await audio()).starts.length, 0, 'edit/resize/import must not start playback');
  await click('tone.wav Ausschnitt bearbeiten, Sound 1'); await page.getByRole('textbox', { name: 'Start in Sekunden' }).fill('0,25'); await page.getByRole('textbox', { name: 'Ende in Sekunden' }).fill('1.25'); await click('Ausschnitt speichern');
  await createBoard('Nebenraum'); await createButton('Zugabe'); await click('Board umbenennen'); await page.getByRole('textbox', { name: 'Boardname' }).fill('Zweite Bühne'); await click('Namen speichern');
  await click('Board Bühne, 1'); await click('Abspielen'); await click('Pad 02 abspielen');
  await page.waitForFunction(() => window.__boardAudio.starts.length === 1); assert.deepEqual((await audio()).starts[0], [0, 0.25, 1]);
  const stopBefore = (await audio()).stops.length; await click('Board Zweite Bühne, 2'); assert.ok((await audio()).stops.length > stopBefore); assert.equal(await pads().count(), 1);
  await click('Board Bühne, 1'); await click('Pad 02 abspielen'); await page.waitForFunction(() => window.__boardAudio.starts.length === 2);
  await click('Pad 03 abspielen'); await page.waitForFunction(() => window.__boardAudio.starts.length === 3); assert.deepEqual((await audio()).starts[2], [0, 0.25, 1]); await click('Wiedergabe stoppen');
  // Keyboard activation and visible focus on real rendered Pressables.
  const keyboardPad = page.getByRole('button', { name: 'Pad 02 abspielen', exact: true }); await keyboardPad.focus();
  const focusColor = await keyboardPad.evaluate(element => getComputedStyle(element).borderTopColor); assert.equal(focusColor, 'rgb(34, 40, 38)');
  await keyboardPad.press('Enter'); await page.waitForFunction(() => window.__boardAudio.starts.length === 4); await click('Wiedergabe stoppen');
  const mode = page.getByRole('button', { name: 'Bearbeiten', exact: true }); await mode.focus(); await mode.press('Enter');
  const editPad = page.getByRole('button', { name: 'Pad 02 bearbeiten', exact: true }); await editPad.focus(); await editPad.press('Enter');
  await page.getByRole('textbox', { name: 'Beschriftung', exact: true }).waitFor();
  const left = page.getByRole('button', { name: 'Nach links verschieben', exact: true }); await left.focus(); await left.press('Space');
  await page.getByRole('alert').getByText('Hier ist nicht genug Platz.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal((await audio()).starts.length, 4); await click('Abspielen');
  await page.screenshot({ path: `${run}/board-desktop-1024.png`, fullPage: true });
  await pads().last().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${run}/board-desktop-1024-bottom.png`, fullPage: true });
  const persisted = await state();
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.getByRole('button', { name: 'Pad 12 abspielen', exact: true }).waitFor();
  assert.equal(await pads().count(), 12); assert.deepEqual(await state(), persisted);
  const mobileBoxes = [];
  for (const pad of await pads().all()) { const box = await pad.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 391); assert.ok(box.width >= 44 && box.height >= 44); mobileBoxes.push(box); }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at 390px');
  await page.getByRole('button', { name: 'Pad 02 abspielen', exact: true }).tap(); await page.waitForFunction(() => window.__boardAudio.starts.length === 1); await click('Wiedergabe stoppen');
  const newBoard = page.getByRole('button', { name: '+ Neues Board', exact: true }); await newBoard.focus(); await page.keyboard.press('Tab');
  const tabTarget = await page.evaluate(() => ({ role: document.activeElement.getAttribute('role'), label: document.activeElement.getAttribute('aria-label') })); assert.equal(tabTarget.role, 'button');
  await page.screenshot({ path: `${run}/board-mobile-390.png`, fullPage: true });
  await pads().last().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${run}/board-mobile-390-bottom.png`, fullPage: true });
  await click('Board Zweite Bühne, 2'); await click('Bearbeiten'); await click('Zugabe bearbeiten'); await click('Button entfernen'); assert.equal((await state()).boards[1].buttons.length, 0);
  await click('Board löschen'); await click('Abbrechen'); assert.equal((await state()).boards.length, 2); await removeBoard();
  assert.equal((await state()).boards.length, 1); assert.equal((await state()).sounds.length, 2); await removeBoard();
  await page.getByRole('button', { name: 'Erstes Board erstellen', exact: true }).waitFor(); const final = await state(); assert.equal(final.boards.length, 0); assert.equal(final.sounds.length, 2);
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), result: 'PASS: 12 real buttons, 1024/390px, create/edit/delete/assignment/layout/trim/reload, collision preservation, keyboard focus/Enter/Space/Tab, touch, board switch stop, last elements and sounds retained', persisted, mobileBoxes, keyboardFocusColor: focusColor, tabTarget, finalBoardCount: final.boards.length, finalSoundCount: final.sounds.length };
  await fs.writeFile(`${run}/board-browser-evidence.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, mobileBoxes: `${mobileBoxes.length} measured boxes`, persisted: '12 buttons + second board persisted and compared after reload' }, null, 2));
} finally { await browser.close(); }
