// Percentile maths + two-floor policy, on synthetic pools.
const assert = require('assert');
const { score, percentile, HIT, PIT } = require('../src/fetch-milb');

// percentile(): ties split, inversion works
assert.strictEqual(percentile([1, 2, 3, 4, 5], 3, 0), 50);
assert.strictEqual(percentile([1, 2, 3, 4, 5], 5, 0), 90);
assert.strictEqual(percentile([1, 2, 3, 4, 5], 5, 1), 10);
assert.strictEqual(percentile([], 3, 0), null);
assert.strictEqual(percentile([1, 2], null, 0), null);

// Synthetic hitting level: 60 qualified regulars + 1 thin prospect + 1 sub-floor kid.
const mk = (id, pa, ops) => ({
  id, name: 'P' + id, team: 'T', age: 21, pa,
  line: 'x', v: { ops, obp: ops * 0.45, slg: ops * 0.55, avg: ops * 0.33, iso: ops * 0.2, hrRate: 2, bbpct: 8, kpct: 20, sb: 5, babip: 0.3 },
});
const rows = [];
for (let i = 0; i < 60; i++) rows.push(mk(i, 400, 0.600 + i * 0.005)); // qualified, OPS .600-.895
rows.push(mk(100, 30, 0.900));  // thin: over display floor (15), under pool floor (50)
rows.push(mk(101, 10, 1.500));  // under display floor -> excluded entirely

const { scored, poolN } = score(rows, HIT, 'H');
assert.strictEqual(poolN, 60, 'pool = qualified only');
const thin = scored.find(r => r.id === 100);
assert.ok(thin, 'thin player is scored');
assert.strictEqual(thin.thin, true, 'thin flag set');
assert.ok(thin.p.ops >= 99, 'thin player ranked vs qualified pool (top OPS -> ~100)');
assert.ok(!scored.find(r => r.id === 101), 'sub-display-floor player excluded');
const q = scored.find(r => r.id === 59);
assert.strictEqual(q.thin, false, 'qualified player not flagged thin');
assert.ok(q.agg != null && q.score != null, 'composites computed');

// Pitching floors use outs, not the "82.1" decimal trap.
const mkp = (id, ip, outs, era) => ({
  id, name: 'P' + id, team: 'T', age: 22, ip, outs,
  line: 'x', v: { era, whip: 1.2, k9: 9, bb9: 3, h9: 8, hr9: 1, kbb: 3, kpct: 25, bbpct: 8, strikePct: 63 },
});
const prows = [];
for (let i = 0; i < 40; i++) prows.push(mkp(i, '80.0', 240, 3 + i * 0.05));
prows.push(mkp(200, '6.1', 19, 1.00));   // 6.1 IP = 19 outs -> displayable (>=15), thin
prows.push(mkp(201, '4.2', 14, 1.00));   // 14 outs -> below display floor
const pr = score(prows, PIT, 'P');
assert.strictEqual(pr.poolN, 40);
assert.ok(pr.scored.find(r => r.id === 200).thin === true);
assert.ok(!pr.scored.find(r => r.id === 201));
// ERA inverts: best ERA in pool -> high percentile
assert.ok(pr.scored.find(r => r.id === 0).p.era > 95);

console.log('percentile.test: OK');
