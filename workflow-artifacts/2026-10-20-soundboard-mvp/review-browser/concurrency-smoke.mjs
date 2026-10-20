import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1024, height: 1000 } });
const a = await context.newPage(), b = await context.newPage();
const url = process.env.SOUNDBOARD_URL ?? 'http://localhost:8081';
const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
const conflictText = 'Deine Daten wurden in einer anderen Ansicht geändert.';
const run = 'workflow-artifacts/2026-10-20-soundboard-mvp/review-browser';
async function reload(page) {
  await click(page, 'Erneut laden');
  await page.waitForFunction(() => {
    const button = document.querySelector('[aria-label="+ Sound importieren"]');
    return button && button.getAttribute('aria-disabled') !== 'true' && !document.querySelector('input[aria-label="Beschriftung"],input[aria-label="Boardname"],input[aria-label="Start in Sekunden"]');
  });
}
async function rename(page, name) {
  await click(page, 'Bearbeiten'); await click(page, 'Board umbenennen'); await page.getByRole('textbox', { name: 'Boardname' }).fill(name); await click(page, 'Namen speichern');
  await page.getByRole('textbox', { name: 'Boardname' }).waitFor({ state: 'hidden' });
}
async function assetHashes(page) {
  return page.evaluate(async () => {
    const db = await new Promise(resolve => { const open = indexedDB.open('local-soundboard', 1); open.onsuccess = () => resolve(open.result); });
    const tx = db.transaction('assets'), store = tx.objectStore('assets');
    const result = await new Promise(resolve => { const keys = store.getAllKeys(), values = store.getAll(); tx.oncomplete = () => resolve({ keys: keys.result, values: values.result }); });
    db.close(); const hashes = {};
    for (let index = 0; index < result.keys.length; index++) hashes[result.keys[index]] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await result.values[index].arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
    return hashes;
  });
}
async function stored(page) {
  return page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('local-soundboard', 1);
    open.onsuccess = () => { const db = open.result, tx = db.transaction('state'), get = tx.objectStore('state').get('library'); tx.oncomplete = () => { db.close(); resolve(JSON.parse(get.result)); }; };
  }));
}
try {
  await a.goto(url);
  for (const extension of ['wav', 'mp3']) {
    const chooser = a.waitForEvent('filechooser'); await click(a, '+ Sound importieren'); await (await chooser).setFiles(`tests/fixtures/tone.${extension}`);
    await a.getByText(`tone.${extension}`, { exact: true }).waitFor();
  }
  await click(a, '+ Neues Board'); await a.getByRole('textbox', { name: 'Boardname' }).fill('Stage'); await click(a, 'Board erstellen');
  await click(a, '+ Button hinzufügen'); await a.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill('Cue'); await click(a, 'Button erstellen');
  await b.goto(url); await click(b, 'Bearbeiten'); await click(b, 'Cue bearbeiten'); await b.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill('Stale label');
  await click(a, 'tone.wav Ausschnitt bearbeiten, Sound 1'); await a.getByRole('textbox', { name: 'Start in Sekunden' }).fill('0.25'); await a.getByRole('textbox', { name: 'Ende in Sekunden' }).fill('1.25'); await click(a, 'Ausschnitt speichern');
  await click(a, 'Cue bearbeiten'); await click(a, 'Nach unten verschieben'); await click(a, 'Breit'); await click(a, 'Button speichern');
  await click(a, 'Board umbenennen'); await a.getByRole('textbox', { name: 'Boardname' }).fill('Main stage'); await click(a, 'Namen speichern');
  const committed = await stored(a);
  await click(b, 'Button speichern');
  await b.waitForFunction(() => !document.body.textContent.includes('Wird gespeichert …'));
  assert.deepEqual(await stored(a), committed, 'F-001: the first tab’s sounds, trims, boards, labels, assignments and layout must remain intact');
  await b.getByText(conflictText, { exact: false }).first().waitFor();
  assert.equal(await b.getByRole('button', { name: 'Button speichern', exact: true }).isDisabled(), true);
  assert.equal(await b.getByRole('button', { name: 'Button entfernen', exact: true }).isDisabled(), true);
  await b.getByText('Beim erneuten Laden wird dein ungespeicherter Entwurf verworfen.', { exact: false }).waitFor();
  await b.screenshot({ path: `${run}/conflict-button-chrome.png`, fullPage: true });
  const originalHashes = await assetHashes(a);
  await reload(b); assert.deepEqual(await stored(b), committed);
  await click(b, 'Cue bearbeiten'); assert.equal(await b.getByRole('textbox', { name: 'Beschriftung', exact: true }).inputValue(), 'Cue');
  await b.getByRole('textbox', { name: 'Beschriftung', exact: true }).fill('From B'); await click(b, 'Button speichern');
  await a.reload(); await a.getByRole('button', { name: 'From B abspielen', exact: true }).waitFor();
  assert.equal((await stored(a)).boards[0].name, 'Main stage'); assert.equal((await stored(a)).boards[0].buttons[0].label, 'From B');
  const cases = [
    { name: 'trim', open: async () => { await click(b, 'tone.wav Ausschnitt bearbeiten, Sound 1'); await b.getByRole('textbox', { name: 'Start in Sekunden' }).fill('0.5'); }, save: 'Ausschnitt speichern' },
    { name: 'board', open: async () => { await click(b, 'Board umbenennen'); await b.getByRole('textbox', { name: 'Boardname' }).fill('Stale board'); }, save: 'Namen speichern' },
    { name: 'delete-board', open: () => click(b, 'Board löschen'), save: 'Board löschen bestätigen' },
    { name: 'delete-button', open: () => click(b, 'From B bearbeiten'), save: 'Button entfernen' },
  ];
  for (const item of cases) {
    await b.reload(); await click(b, 'Bearbeiten'); await item.open();
    await rename(a, `Committed ${item.name}`); const firstWriter = await stored(a);
    await click(b, item.save); await b.getByText(conflictText, { exact: false }).first().waitFor();
    assert.deepEqual(await stored(a), firstWriter); assert.equal(await b.getByRole('button', { name: item.save, exact: true }).isDisabled(), true);
    assert.equal(await b.getByRole('button', { name: 'Abbrechen', exact: true }).isEnabled(), true);
    await reload(b); assert.deepEqual(await stored(b), firstWriter);
    assert.equal(await b.getByRole('textbox').count(), 0, 'reload must discard every open draft');
  }
  // A stale import cleans only its new copy. Simulate an I/O load failure on the explicit retry.
  const chooser = b.waitForEvent('filechooser'); await click(b, '+ Sound importieren'); const selected = await chooser;
  await rename(a, 'Committed before import'); const beforeImport = await stored(a);
  await selected.setFiles('tests/fixtures/tone.wav'); await b.getByText(conflictText, { exact: false }).first().waitFor();
  assert.deepEqual(await stored(a), beforeImport); assert.deepEqual(await assetHashes(a), originalHashes);
  assert.equal(await b.getByRole('button', { name: '+ Sound importieren', exact: true }).isDisabled(), true);
  assert.equal(await b.getByRole('button', { name: '+ Neues Board', exact: true }).isDisabled(), true);
  await b.evaluate(() => {
    window.__failLoad = true; const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) { if (this.name === 'state' && window.__failLoad) throw new DOMException('Test read failure', 'UnknownError'); return get.apply(this, args); };
  });
  await click(b, 'Erneut laden'); await b.getByText('Die lokalen Daten konnten nicht geladen werden.', { exact: false }).waitFor();
  assert.equal(await b.getByRole('button', { name: '+ Sound importieren', exact: true }).isDisabled(), true);
  await b.evaluate(() => { window.__failLoad = false; }); await reload(b);
  assert.deepEqual(await stored(b), beforeImport); await rename(b, 'Recovered after reload');
  await a.reload(); await a.getByRole('button', { name: 'Board Recovered after reload, 1', exact: true }).waitFor();
  assert.deepEqual(await assetHashes(a), originalHashes);
  // Fresh database, concurrent first commits and then concurrent updates on existing state.
  const fresh = await browser.newContext(); const c = await fresh.newPage(), d = await fresh.newPage();
  await Promise.all([c.goto(url), d.goto(url)]);
  for (const [page, name] of [[c, 'First C'], [d, 'First D']]) { await click(page, '+ Neues Board'); await page.getByRole('textbox', { name: 'Boardname' }).fill(name); }
  await Promise.all([click(c, 'Board erstellen'), click(d, 'Board erstellen')]);
  await Promise.all([c.waitForFunction(() => !document.body.textContent.includes('Wird gespeichert …')), d.waitForFunction(() => !document.body.textContent.includes('Wird gespeichert …'))]);
  const firstRace = await stored(c); assert.equal(firstRace.boards.length, 1);
  assert.equal(Number((await c.locator('body').innerText()).includes(conflictText)) + Number((await d.locator('body').innerText()).includes(conflictText)), 1);
  await Promise.all([c.reload(), d.reload()]);
  for (const [page, name] of [[c, 'Update C'], [d, 'Update D']]) { await click(page, 'Bearbeiten'); await click(page, 'Board umbenennen'); await page.getByRole('textbox', { name: 'Boardname' }).fill(name); }
  await Promise.all([click(c, 'Namen speichern'), click(d, 'Namen speichern')]);
  await Promise.all([c.waitForFunction(() => !document.body.textContent.includes('Wird gespeichert …')), d.waitForFunction(() => !document.body.textContent.includes('Wird gespeichert …'))]);
  const updateRace = await stored(c); assert.ok(['Update C', 'Update D'].includes(updateRace.boards[0].name));
  assert.equal(Number((await c.locator('body').innerText()).includes(conflictText)) + Number((await d.locator('body').innerText()).includes(conflictText)), 1);
  const report = { browser: browser.version(), result: 'PASS: stale writes rejected; all four dialogs lock/reload/discard; first writer and original assets retained; import rollback; failed/successful reload; concurrent first writes and updates admit one winner', originalHashes, firstCommitted: committed, firstRace, updateRace };
  await fs.writeFile(`${run}/concurrency-browser-evidence.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, firstCommitted: 'full snapshot preserved' }, null, 2));
} finally { await browser.close(); }
