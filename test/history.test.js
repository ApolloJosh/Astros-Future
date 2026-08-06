// Career totals and the season-by-level breakdown.
// Rate stats must come from summed components — averaging seasons is wrong
// whenever playing time is uneven, which for prospects it always is.
const assert = require('assert');
const { historyFrom } = require('../src/build-data');

// ---- hitter promoted mid-season ----
{
  const entries = [
    { lvl: 'AA', splits: [{ season: '2026', team: { name: 'Corpus Christi Hooks' }, stat: {
      gamesPlayed: 25, plateAppearances: 100, atBats: 90, hits: 27, totalBases: 45,
      baseOnBalls: 8, hitByPitch: 1, sacFlies: 1, homeRuns: 3, stolenBases: 5, strikeOuts: 20,
      avg: '.300', obp: '.360', slg: '.500', ops: '.860' } }] },
    { lvl: 'A+', splits: [{ season: '2026', team: { name: 'Asheville Tourists' }, stat: {
      gamesPlayed: 50, plateAppearances: 200, atBats: 180, hits: 45, totalBases: 72,
      baseOnBalls: 15, hitByPitch: 2, sacFlies: 3, homeRuns: 5, stolenBases: 10, strikeOuts: 40,
      avg: '.250', obp: '.310', slg: '.400', ops: '.710' } }] },
  ];
  const { rows, career } = historyFrom(entries, false);

  assert.strictEqual(rows.length, 2, 'one row per level');
  assert.strictEqual(rows[0].lvl, 'AA', 'higher level first within a season');
  assert.strictEqual(rows[1].lvl, 'A+');
  assert.strictEqual(rows[0].team, 'Corpus Christi Hooks', 'club carried through');

  // Worked by hand: AB 270, H 72, TB 117, BB 23, HBP 3, SF 4
  assert.strictEqual(career.avg, '.267', '72/270');
  assert.strictEqual(career.slg, '.433', '117/270');
  assert.strictEqual(career.obp, '.327', '98/300');
  assert.strictEqual(career.ops, '.760', 'obp + slg');
  assert.strictEqual(career.pa, 300);
  assert.strictEqual(career.g, 75);
  assert.strictEqual(career.hr, 8);
  assert.strictEqual(career.sb, 15);
  assert.strictEqual(career.seasons, 1, 'both stops are the same season');

  // The naive approach would average .300 and .250 to .275 — prove we didn't.
  assert.notStrictEqual(career.avg, '.275', 'career AVG is not the mean of season AVGs');
}

// ---- pitcher across two seasons, with the .1/.2 innings convention ----
{
  const entries = [
    { lvl: 'AAA', splits: [{ season: '2026', team: { name: 'Sugar Land Space Cowboys' }, stat: {
      gamesPlayed: 5, gamesStarted: 2, inningsPitched: '10.1', earnedRuns: 3, hits: 8,
      baseOnBalls: 4, strikeOuts: 12, era: '2.61', whip: '1.16' } }] },
    { lvl: 'AA', splits: [{ season: '2025', team: { name: 'Corpus Christi Hooks' }, stat: {
      gamesPlayed: 10, gamesStarted: 10, inningsPitched: '20.2', earnedRuns: 10, hits: 20,
      baseOnBalls: 8, strikeOuts: 25, era: '4.35', whip: '1.35' } }] },
  ];
  const { rows, career } = historyFrom(entries, true);

  assert.strictEqual(rows[0].y, '2026', 'newest season first');
  assert.strictEqual(rows[1].y, '2025');
  // 10.1 IP = 31 outs, 20.2 IP = 62 outs -> 93 outs = 31.0 IP exactly
  assert.strictEqual(career.ip, '31.0', '"10.1" is 10 and one third, not 10.1');
  assert.strictEqual(career.era, '3.77', '13 ER over 31 IP');
  assert.strictEqual(career.whip, '1.29', '(28 H + 12 BB) / 31 IP');
  assert.strictEqual(career.k9, '10.74', '37 K over 31 IP');
  assert.strictEqual(career.k, 37);
  assert.strictEqual(career.seasons, 2);
  assert.strictEqual(career.kind, 'P');
}

// ---- a partial inning that isn't a whole number of outs ----
{
  const entries = [{ lvl: 'A', splits: [{ season: '2026', team: { name: 'X' }, stat: {
    gamesPlayed: 1, gamesStarted: 1, inningsPitched: '5.2', earnedRuns: 1, hits: 3,
    baseOnBalls: 1, strikeOuts: 6, era: '1.59', whip: '0.71' } }] }];
  const { career } = historyFrom(entries, true);
  assert.strictEqual(career.ip, '5.2', 'round trip through outs keeps the .2');
  assert.strictEqual(career.era, '1.59', '1 ER over 5 2/3');
}

// ---- nothing to show ----
assert.strictEqual(historyFrom([{ lvl: 'AA', splits: [] }], false), null, 'no appearances -> null');
assert.strictEqual(
  historyFrom([{ lvl: 'AA', splits: [{ season: '2026', stat: { plateAppearances: 0 } }] }], false),
  null, 'zero PA rows are skipped');

console.log('history.test: OK');
