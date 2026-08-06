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
  const expectedHM = dom.window.AF_DATA.players.length - 30;
  assert.strictEqual(d.querySelectorAll('#hm .row').length, expectedHM,
    `${expectedHM} honorable mentions`);
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
  assert.strictEqual(d.querySelectorAll('#hm .row').length,
    dom.window.AF_DATA.players.length - 30, 'old #30 dropped back to the pool');
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
  assert.ok(url.startsWith(BASE + '?l='), 'share url shape: ' + url);
  // open the share link in a fresh "browser"
  const dom2 = boot(url);
  const d2 = dom2.window.document;
  const order2 = [...d2.querySelectorAll('#list .row')].map(r => +r.dataset.id);
  assert.deepStrictEqual(order2, order, 'share link restores the exact 30');
  assert.strictEqual(dom2.window.localStorage.getItem('af30-list-v1'), null,
    'viewing a shared list does not clobber visitor storage');
}

// ---- the name field ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  const type = v => {
    d.querySelector('#uname').value = v;
    d.querySelector('#uname').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  assert.strictEqual(d.querySelector('#list-title').textContent, 'Astros Future Top 30', 'default title');
  type('Josh');
  assert.strictEqual(d.querySelector('#list-title').textContent, 'Josh’s Astros Top 30', 'name in title');
  assert.strictEqual(dom.window.localStorage.getItem('af30-name-v1'), 'Josh', 'name persisted');
  type('Chris');
  assert.strictEqual(d.querySelector('#list-title').textContent, 'Chris’ Astros Top 30', 'name ending in s');
  type('<b>Bad</b>');
  assert.ok(!/[<>]/.test(d.querySelector('#list-title').textContent), 'markup stripped from name');
  type('Josh');

  // name rides along in the share link
  d.querySelector('#share').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const url = d.querySelector('#share-url').value;
  assert.ok(url.includes('n=Josh'), 'name in share url: ' + url);

  // a recipient sees the sharer's name without losing their own
  const dom2 = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.localStorage.setItem('af30-name-v1', 'Alex');
  dom2.window.eval(dataJs); dom2.window.eval(appJs);
  assert.strictEqual(dom2.window.document.querySelector('#list-title').textContent,
    'Josh’s Astros Top 30', 'recipient sees the sharer name');
  assert.strictEqual(dom2.window.localStorage.getItem('af30-name-v1'), 'Alex',
    'recipient keeps their own saved name');

  // reset clears it
  d.querySelector('#reset').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(d.querySelector('#list-title').textContent, 'Astros Future Top 30', 'reset clears name');
  assert.strictEqual(dom.window.localStorage.getItem('af30-name-v1'), null, 'reset clears stored name');
}

// ---- the owner's ranked list and pool are both present ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  const ranked = [...d.querySelectorAll('#list .row .pname')].map(n => n.textContent.trim());
  const pool = [...d.querySelectorAll('#hm .row .pname')].map(n => n.textContent.trim());
  // 2026 draftees he ranked
  ['Logan Hughes', 'Jack Radel', 'Wes Mendes', 'Keon Johnson', 'Kam Durnin', 'Beau Peterson']
    .forEach(n => assert.ok(ranked.some(x => x.startsWith(n)), n + ' is ranked'));
  // and names that live in the honorable-mention pool
  ['Sami Manzueta', 'Gavin Eddy', 'Michael Addari', 'Anthony Millan']
    .forEach(n => assert.ok(pool.some(x => x.startsWith(n)), n + ' is promotable'));
  assert.ok(ranked[0].startsWith('Kevin Alvarez'), 'AF #1 is Kevin Alvarez');
  assert.ok(ranked[2].startsWith('Logan Hughes'), 'AF #3 is Logan Hughes');
}

// ---- a player with no article link must not be clickable ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  d.querySelectorAll('#list .row').forEach(r => r.classList.add('open'));
  assert.strictEqual(d.querySelectorAll('.report-lnk').length, 0,
    'no report buttons anywhere until article links are filled in');

  // ...and one that has a link gets exactly one button, pointing at it
  const url = 'https://astrosfuture.com/kevin-alvarez-report';
  const patched = dataJs.replace('"article":null', `"article":${JSON.stringify(url)}`);
  const dom2 = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.eval(patched); dom2.window.eval(appJs);
  const d2 = dom2.window.document;
  d2.querySelectorAll('#list .row').forEach(r => r.classList.add('open'));
  const links = d2.querySelectorAll('.report-lnk');
  assert.strictEqual(links.length, 1, 'exactly one report button');
  assert.strictEqual(links[0].getAttribute('href'), url, 'button points at the article');
  assert.strictEqual(links[0].getAttribute('target'), '_blank', 'opens in a new tab');
}

// ---- anything toggled with [hidden] must actually be invisible ----
// An author `display:` rule outranks the browser's own [hidden]{display:none},
// which is how two banners once showed permanently regardless of state. This is
// a static check on purpose: jsdom's getComputedStyle reports "none" for any
// [hidden] element no matter what the stylesheet says, so testing it through
// jsdom would pass whether or not the bug is present.
{
  const css = fs.readFileSync(path.join(root, 'docs', 'assets', 'style.css'), 'utf8');
  const guard = /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/i.test(css);
  assert.ok(guard, 'style.css needs a global [hidden] { display: none !important } rule');

  // Every element the page hides at runtime, and the classes it carries.
  const hiddenClasses = new Set();
  for (const m of html.matchAll(/<[^>]*\bhidden\b[^>]*>/gi)) {
    const cls = /class="([^"]+)"/i.exec(m[0]);
    if (cls) cls[1].split(/\s+/).forEach(c => hiddenClasses.add(c));
  }
  assert.ok(hiddenClasses.size, 'expected some elements to be hidden in the markup');
  // Those classes may set display — the guard above is what keeps them safe —
  // but flag any that try to win with their own !important.
  hiddenClasses.forEach(c => {
    const rule = new RegExp('\\.' + c + '[^{]*\\{[^}]*display:[^;}]*!important', 'i');
    assert.ok(!rule.test(css), `.${c} sets display with !important and would defeat [hidden]`);
  });
}

// ---- share modal shows the card area and the link together ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  assert.ok(d.querySelector('#sm').hidden, 'modal starts closed');
  d.querySelector('#share').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(!d.querySelector('#sm').hidden, 'SHARE opens the modal');
  assert.ok(d.querySelector('#sm-img'), 'card image element present');
  assert.ok(d.querySelector('#share-url').value.startsWith(BASE), 'link shown in modal');
  d.querySelector('#sm-close').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(d.querySelector('#sm').hidden, 'close button works');
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
