// Short share codes: round-trip, length, and the failure modes that matter
// (stale pool version, garbage input, promoted honorable mentions).
// Needs jsdom:  npm i --no-save jsdom && node test/sharecode.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('sharecode.test: jsdom not installed — skipped'); process.exit(0); }

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8')
  .replace(/<script src="data\/prospects\.js"><\/script>/, '')
  .replace(/<script src="assets\/app\.js"><\/script>/, '');
const dataJs = fs.readFileSync(path.join(root, 'docs', 'data', 'prospects.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'docs', 'assets', 'app.js'), 'utf8');
const BASE = 'https://apollojosh.github.io/Astros-Future/';

function boot(url) {
  const dom = new JSDOM(html, { url: url || BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(dataJs);
  dom.window.eval(appJs);
  return dom;
}
const orderOf = d => [...d.querySelectorAll('#list .row')].map(r => +r.dataset.id);

const dom = boot();
const { encode } = dom.window.AF30;
// decode() runs inside jsdom, so bring its array back into this realm too
const decode = c => { const r = dom.window.AF30.decode(c); return r === null ? null : [...r]; };
// Spread into this realm first: arrays built inside jsdom have a different
// Array prototype and deepStrictEqual compares prototypes.
const DATA = dom.window.AF_DATA;
const def = [...DATA.players].filter(p => !p.hm && p.rank != null)
  .sort((a, b) => a.rank - b.rank).map(p => p.id);
const hmIds = [...DATA.players].filter(p => p.hm).map(p => p.id);

// --- round trips ---
const cases = {
  'default order': def.slice(),
  'one swap': (() => { const o = def.slice(); [o[0], o[1]] = [o[1], o[0]]; return o; })(),
  'move #30 to #1': (() => { const o = def.slice(); o.unshift(o.pop()); return o; })(),
  'promote an HM': (() => { const o = def.slice(0, 29); o.push(hmIds[0]); return o; })(),
  'reversed': def.slice().reverse(),
  'shuffled': (() => {
    const o = def.slice();
    let seed = 7;
    for (let i = o.length - 1; i > 0; i--) {           // deterministic shuffle
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  })(),
};
for (const [name, ord] of Object.entries(cases)) {
  const code = encode(ord);
  assert.ok(code, name + ': encodes');
  assert.deepStrictEqual(decode(code), ord, name + ': round-trips');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(code), name + ': url-safe');
}

// --- it has to actually be short ---
const len = n => encode(cases[n]).length;
// Budgets scale with the pool: index width is ceil(log2(pool)), so adding
// players lengthens codes slightly. These caps leave room for the list to grow
// while still failing loudly if the encoding regresses to something bulky.
assert.ok(len('one swap') <= 10, 'one swap should be tiny, got ' + len('one swap'));
assert.ok(len('promote an HM') <= 10, 'promotion tiny, got ' + len('promote an HM'));
assert.ok(len('reversed') <= 34, 'worst case stays short, got ' + len('reversed'));
assert.ok(len('shuffled') <= 34, 'worst case stays short, got ' + len('shuffled'));
// and shorter than the ids it replaces
assert.ok(len('shuffled') < def.join('.').length / 4, 'much shorter than raw ids');

// --- bad input is refused, never silently wrong ---
['', 'z', '!!!!', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'ZZZZ'].forEach(bad => {
  const r = decode(bad);
  assert.ok(r === null || (Array.isArray(r) && r.length === def.length), 'garbage refused or sane: ' + bad);
});
// A code claiming a pool version this build has never heard of must not resolve.
const future = (() => {
  // version 1023, scheme 0, zero diffs
  let bits = (1023).toString(2).padStart(10, '0') + '0' + '0'.repeat(5);
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let s = '';
  for (let i = 0; i < bits.length; i += 6) s += B64[parseInt(bits.slice(i, i + 6).padEnd(6, '0'), 2)];
  return s;
})();
assert.strictEqual(decode(future), null, 'unknown pool version rejected');

// --- through the actual page: share a link, open it, get the same 30 ---
{
  const d = dom.window.document;
  d.querySelector('#hm .row [data-promote]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const mine = orderOf(d);
  d.querySelector('#share').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const url = d.querySelector('#share-url').value;
  assert.ok(url.startsWith(BASE + '?l='), 'short param in share url: ' + url);
  assert.ok(url.length < BASE.length + 30, 'share url stays short: ' + url.length);
  assert.ok(!d.querySelector('#sm').hidden, 'modal opened');

  const dom2 = boot(url);
  assert.deepStrictEqual(orderOf(dom2.window.document), mine, 'link restores the exact 30');
  assert.ok(dom2.window.document.querySelector('#stale-banner').hidden, 'not flagged stale');
}

// --- an unresolvable code says so instead of faking a list ---
{
  const dom3 = boot(BASE + '?l=' + future);
  const d3 = dom3.window.document;
  assert.deepStrictEqual(orderOf(d3), def, 'falls back to the owner list');
  assert.ok(!d3.querySelector('#stale-banner').hidden, 'stale notice shown');
}

// --- links shared before short codes still work ---
{
  const legacy = def.slice(); [legacy[0], legacy[5]] = [legacy[5], legacy[0]];
  const dom4 = boot(BASE + '?list=' + legacy.join('.'));
  assert.deepStrictEqual(orderOf(dom4.window.document), legacy, 'legacy ?list= still decodes');
}

console.log('sharecode.test: OK  (one swap =', len('one swap'), 'chars, worst case =', len('shuffled'), 'chars)');
