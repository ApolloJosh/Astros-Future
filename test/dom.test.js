// DOM-level behaviour test for docs/assets/app.js, run in jsdom.
// Not part of `npm test` (CI has no npm install step); run manually:
//   npm i --no-save jsdom && node test/dom.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('dom.test: jsdom not installed — skipped'); process.exit(0); }

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8')
  .replace(/<script src="data\/prospects\.js"><\/script>/, '')
  .replace(/<script src="assets\/app\.js"><\/script>/, '');
const dataJs = fs.readFileSync(path.join(root, 'docs', 'data', 'prospects.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'docs', 'assets', 'app.js'), 'utf8');

function boot(url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(dataJs);
  dom.window.eval(appJs);
  return dom;
}
const BASE = 'https://example.com/top30/';

// ---- default render ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  const rows = d.querySelectorAll('#list .row');
  assert.strictEqual(rows.length, 30, '30 ranked rows');
  assert.strictEqual(d.querySelectorAll('#hm .row').length, 2, '2 honorable mentions');
  assert.ok(rows[0].textContent.includes('Kevin Alvarez'), 'rank 1 = Kevin Alvarez');
  assert.ok(rows[0].querySelector('.cell.af .val').textContent === '#1', 'AF rank shown');
  // expand on click
  rows[0].querySelector('.row-main').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(rows[0].classList.contains('open'), 'row expands');
  assert.ok(rows[0].querySelector('.detail').textContent.includes('AVG'), 'season line in detail');
  // Tredwell: no game action state
  const tred = [...rows].find(r => r.textContent.includes('Tredwell'));
  assert.ok(tred.querySelector('.empty-note').textContent.includes('No 2026 game action'), 'IL/no-action state');
  // De Leon: below display floor
  const dl = [...rows].find(r => r.textContent.includes('De Leon'));
  assert.ok(dl.querySelector('.empty-note').textContent.includes('Not enough playing time'), 'below-floor state');
  // reset hidden on default
  assert.ok(d.querySelector('#reset').hidden, 'reset hidden when default');
}

// ---- promote from HM ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  const btn = d.querySelector('#hm .row [data-promote]');
  const promotedId = +btn.dataset.promote;
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const rows = d.querySelectorAll('#list .row');
  assert.strictEqual(rows.length, 30, 'still 30 after promotion');
  assert.strictEqual(+rows[29].dataset.id, promotedId, 'promoted player is #30');
  assert.strictEqual(d.querySelectorAll('#hm .row').length, 2, 'old #30 dropped to HM');
  const saved = JSON.parse(dom.window.localStorage.getItem('af30-list-v1'));
  assert.ok(saved && saved.list[29] === promotedId, 'custom list persisted to localStorage');
  assert.ok(!d.querySelector('#reset').hidden, 'reset visible when customised');
}

// ---- share URL round-trip ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  // customise: promote first HM
  d.querySelector('#hm .row [data-promote]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const order = [...d.querySelectorAll('#list .row')].map(r => +r.dataset.id);
  d.querySelector('#share').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const url = d.querySelector('#share-url').value;
  assert.ok(url.startsWith(BASE + '?list='), 'share url shape: ' + url);
  // open the share link in a fresh "browser"
  const dom2 = boot(url);
  const d2 = dom2.window.document;
  const order2 = [...d2.querySelectorAll('#list .row')].map(r => +r.dataset.id);
  assert.deepStrictEqual(order2, order, 'share link restores the exact 30');
  assert.ok(!d2.querySelector('#shared-banner').hidden, 'shared banner shown');
  assert.strictEqual(dom2.window.localStorage.getItem('af30-list-v1'), null,
    'viewing a shared list does not clobber visitor storage');
}

// ---- garbage in share param is survivable ----
{
  const dom = boot(BASE + '?list=999.abc.829037');
  const rows = dom.window.document.querySelectorAll('#list .row');
  assert.strictEqual(rows.length, 30, 'normalize refills to 30');
  assert.strictEqual(+rows[0].dataset.id, 829037, 'valid id kept first');
}

// ---- localStorage restore ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  d.querySelector('#hm .row [data-promote]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const order = [...d.querySelectorAll('#list .row')].map(r => +r.dataset.id);
  const stored = dom.window.localStorage.getItem('af30-list-v1');
  const dom2 = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.localStorage.setItem('af30-list-v1', stored);
  dom2.window.eval(dataJs); dom2.window.eval(appJs);
  const order2 = [...dom2.window.document.querySelectorAll('#list .row')].map(r => +r.dataset.id);
  assert.deepStrictEqual(order2, order, 'localStorage restores the custom list');
}

console.log('dom.test: OK');
