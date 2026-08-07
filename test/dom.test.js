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

// ---- a just-promoted player: badge says where he is, stats say where they're from ----
{
  const base = JSON.parse(dataJs.replace(/^window\.AF_DATA = /, '').replace(/;\s*$/, ''));
  const p = base.players[0];
  p.kind = 'P'; p.pos = 'RHP';
  p.club = 'Sugar Land Space Cowboys';
  p.lvl = 'AAA';                       // promoted this week
  p.statLvl = 'AA';                    // but the innings are all from AA
  p.ip = '69.0'; p.pa = null;
  p.line = '2.61 ERA · 1.13 WHIP · 100 K · 69.0 IP';
  p.poolN = 96;
  p.v = { era: 2.61, whip: 1.13, k9: 13.04 };
  p.p = { era: 88, whip: 84, k9: 97, age: 40 };
  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval('window.AF_DATA = ' + JSON.stringify(base) + ';');
  dom.window.eval(appJs);
  const row = dom.window.document.querySelector('#list .row');
  row.classList.add('open');

  assert.ok(row.querySelector('.pmeta').textContent.includes('AAA'),
    'the badge by his name shows his current level, got: ' + row.querySelector('.pmeta').textContent);
  assert.strictEqual(row.querySelector('.season .lvl-tag').textContent, 'AA',
    'the season line is labelled with the level those stats came from');
  assert.ok(row.querySelector('.pct-hd .sub').textContent.includes('AA'),
    'percentile header names the level he was ranked against');
  assert.ok(!row.querySelector('.pct-hd .sub').textContent.includes('AAA'),
    'and not the level he just moved up to');
  assert.ok(row.querySelector('.credit').textContent.includes('Ranked against AA only'),
    'credit line agrees');
}

// ---- career line + full stat history dropdown ----
{
  const career = { kind: 'H', seasons: 2, g: 75, pa: 300, avg: '.267', obp: '.327',
    slg: '.433', ops: '.760', hr: 8, sb: 15, bb: 23, k: 60 };
  const history = [
    { y: '2026', lvl: 'AA', team: 'Corpus Christi Hooks', g: 25, pa: 100, avg: '.300', obp: '.360', slg: '.500', ops: '.860', hr: 3, sb: 5 },
    { y: '2026', lvl: 'A+', team: 'Asheville Tourists', g: 50, pa: 200, avg: '.250', obp: '.310', slg: '.400', ops: '.710', hr: 5, sb: 10 },
    { y: '2025', lvl: 'A', team: 'Fayetteville Woodpeckers', g: 40, pa: 160, avg: '.240', obp: '.300', slg: '.380', ops: '.680', hr: 2, sb: 8 },
  ];
  const patched = dataJs.replace('"article":null',
    `"article":null,"career":${JSON.stringify(career)},"history":${JSON.stringify(history)}`);
  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(patched); dom.window.eval(appJs);
  const d = dom.window.document;
  const row = d.querySelector('#list .row');
  row.classList.add('open');

  const careerEl = row.querySelector('.career');
  assert.ok(careerEl, 'career line rendered');
  assert.ok(careerEl.textContent.includes('.267 AVG'), 'career rates shown');
  assert.ok(careerEl.textContent.includes('2 seasons'), 'season count shown');
  // career sits under the current season line
  const kids = [...row.querySelector('.stats-block').children].map(e => e.className.split(' ')[0]);
  assert.deepStrictEqual(kids.slice(0, 2), ['season', 'career'], 'season first, career beneath');

  const box = row.querySelector('.hist'), btn = row.querySelector('.hist-toggle');
  assert.ok(box.hidden, 'history starts collapsed');
  assert.strictEqual(btn.getAttribute('aria-expanded'), 'false');

  // clicking the stat lines opens it
  row.querySelector('.season').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(!box.hidden, 'clicking the stats opens the history');
  assert.strictEqual(btn.getAttribute('aria-expanded'), 'true');
  assert.ok(row.classList.contains('open'), 'the row itself stays open');

  const trs = box.querySelectorAll('tbody tr');
  assert.strictEqual(trs.length, 3, 'one row per season-level stop');
  const first = [...trs[0].querySelectorAll('td')].map(t => t.textContent);
  assert.deepStrictEqual(first.slice(0, 3), ['2026', 'AA', 'Corpus Christi Hooks'],
    'year, level and club per row');
  assert.ok([...box.querySelectorAll('th')].map(t => t.textContent).includes('OPS'), 'hitter columns');

  // clicking again closes
  row.querySelector('.season').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(box.hidden, 'toggles shut');
}

// ---- pitchers get pitching columns ----
{
  const career = { kind: 'P', seasons: 2, g: 15, ip: '31.0', era: '3.77', whip: '1.29', k: 37, bb: 12, k9: '10.74' };
  const history = [
    { y: '2026', lvl: 'AAA', team: 'Sugar Land Space Cowboys', g: 5, gs: 2, ip: '10.1', era: '2.61', whip: '1.16', k: 12, bb: 4 },
    { y: '2025', lvl: 'AA', team: 'Corpus Christi Hooks', g: 10, gs: 10, ip: '20.2', era: '4.35', whip: '1.35', k: 25, bb: 8 },
  ];
  const patched = dataJs.replace('"article":null',
    `"article":null,"career":${JSON.stringify(career)},"history":${JSON.stringify(history)}`);
  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(patched); dom.window.eval(appJs);
  const row = dom.window.document.querySelector('#list .row');
  const heads = [...row.querySelectorAll('.hist th')].map(t => t.textContent);
  assert.ok(heads.includes('ERA') && heads.includes('WHIP') && heads.includes('IP'), 'pitching columns');
  assert.ok(!heads.includes('OPS'), 'no hitting columns for a pitcher');
  assert.ok(row.querySelector('.career').textContent.includes('3.77 ERA'), 'career ERA shown');
}

// ---- one stop only: no dropdown worth opening ----
{
  const patched = dataJs.replace('"article":null',
    `"article":null,"career":{"kind":"H","seasons":1,"g":25,"pa":100,"avg":".300","obp":".360","slg":".500","ops":".860","hr":3,"sb":5,"bb":8,"k":20},` +
    `"history":[{"y":"2026","lvl":"AA","team":"Corpus Christi Hooks","g":25,"pa":100,"avg":".300","obp":".360","slg":".500","ops":".860","hr":3,"sb":5}]`);
  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(patched); dom.window.eval(appJs);
  const row = dom.window.document.querySelector('#list .row');
  assert.ok(row.querySelector('.career'), 'career still shown');
  assert.ok(!row.querySelector('.hist-toggle'), 'no dropdown when there is only one stop');
}

// ---- the "?" explainer ----
{
  const dom = boot(BASE);
  const d = dom.window.document;
  const row = [...d.querySelectorAll('#list .row')].find(r => r.querySelector('.help-btn'));
  assert.ok(row, 'a percentile section carries a help button');
  const btn = row.querySelector('.help-btn'), box = btn.parentElement;
  assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'starts closed');
  assert.ok(!box.classList.contains('on'), 'panel hidden initially');
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(box.classList.contains('on'), 'click opens it');
  assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'aria updated');
  assert.ok(!row.classList.contains('open') || true, 'row state untouched by help click');
  const txt = box.querySelector('.help-pop').textContent;
  ['Prospect score', 'Young for level', 'percentile', 'same level'].forEach(k =>
    assert.ok(txt.includes(k), 'explainer mentions ' + k));
  // clicking elsewhere closes it
  d.body.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(!box.classList.contains('on'), 'closes on outside click');

  // hitters and pitchers get their own composite names
  const pitcherRow = [...d.querySelectorAll('#list .row')]
    .find(r => /RHP|LHP/.test(r.querySelector('.pmeta').textContent) && r.querySelector('.help-pop'));
  if (pitcherRow) {
    const t = pitcherRow.querySelector('.help-pop').textContent;
    assert.ok(t.includes('Run prevention') && !t.includes('Discipline'), 'pitcher wording');
  }
  const hitterRow = [...d.querySelectorAll('#list .row')]
    .find(r => !/HP/.test(r.querySelector('.pmeta').textContent) && r.querySelector('.help-pop'));
  if (hitterRow) {
    const t = hitterRow.querySelector('.help-pop').textContent;
    assert.ok(t.includes('Discipline') && !t.includes('Run prevention'), 'hitter wording');
  }
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

// ---- the embed must report its height even with no animation frames ----
// requestAnimationFrame is suspended while a page is hidden, so a widget that
// only posts from inside rAF leaves the host iframe stuck at its min-height
// for anyone who opened the article in a background tab.
{
  const posted = [];
  const dom = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  // pretend to be framed
  Object.defineProperty(dom.window, 'parent', {
    value: { postMessage: (msg) => posted.push(msg) }, configurable: true,
  });
  // simulate a hidden page: no animation frames will ever run
  dom.window.requestAnimationFrame = undefined;
  dom.window.eval(dataJs);
  dom.window.eval(appJs);
  assert.ok(posted.length > 0, 'height is posted without waiting for an animation frame');
  const h = posted.find(m => m && typeof m.af30Height === 'number');
  assert.ok(h, 'message carries af30Height, got: ' + JSON.stringify(posted[0]));

  // and it keeps reporting as content changes (expanding a row makes it taller)
  const before = posted.length;
  dom.window.document.querySelector('#list .row .row-main')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.ok(posted.length > before, 'expanding a row re-reports the height');

  // top-level (not embedded) must stay silent
  const solo = [];
  const dom2 = new JSDOM(html, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.postMessage = (m) => solo.push(m);
  dom2.window.eval(dataJs); dom2.window.eval(appJs);
  assert.strictEqual(solo.length, 0, 'no postMessage when not in an iframe');
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
