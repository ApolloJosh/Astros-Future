// Scoreboard logic: which club is "us", how a game reads, and the date maths
// that decides what "today" means for a night game in Texas.
const assert = require('assert');
const M = require('../docs/assets/milb.js');

// A game shaped like the schedule endpoint returns it.
const mkGame = (o = {}) => ({
  gamePk: o.pk || 1,
  gameDate: o.date || '2026-08-06T23:35:00Z',
  doubleHeader: 'N',
  gameNumber: o.gameNumber || 1,
  status: { abstractGameState: o.state || 'Final', detailedState: o.detailed || 'Final' },
  teams: {
    away: { team: { id: o.awayId, abbreviation: o.awayAbbr || 'TUL', shortName: o.awayName || 'Tulsa', parentOrgName: o.awayOrg || 'Los Angeles Dodgers' },
      score: o.awayScore, leagueRecord: { wins: 66, losses: 39 } },
    home: { team: { id: o.homeId, abbreviation: o.homeAbbr || 'CC', shortName: o.homeName || 'Corpus Christi', parentOrgName: o.homeOrg || 'Houston Astros' },
      score: o.homeScore, leagueRecord: { wins: 50, losses: 55 } },
  },
  linescore: o.linescore || { currentInning: 9, inningHalf: 'Bottom', isTopInning: false, outs: 3, scheduledInnings: 9 },
});

// ---- which side is ours ----
{
  // affiliate at home
  const home = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, homeScore: 4, awayScore: 9 }));
  assert.strictEqual(home.abbr, 'CC', 'home affiliate identified');
  assert.strictEqual(home.level, 'AA');
  assert.strictEqual(home.usIsHome, true);
  assert.strictEqual(home.usScore, 4, 'our runs, not the home slot blindly');
  assert.strictEqual(home.themScore, 9);
  assert.strictEqual(home.won, false, 'we lost 4-9');
  assert.strictEqual(home.themOrg, 'Los Angeles Dodgers', 'opponent org kept for context');

  // affiliate on the road — the same fields must still describe us
  const away = M.normalizeGame(mkGame({ awayId: 3712, homeId: 414, awayScore: 10, homeScore: 9,
    awayAbbr: 'FAY', awayName: 'Fayetteville', awayOrg: 'Houston Astros',
    homeAbbr: 'SAL', homeName: 'Salem', homeOrg: 'Boston Red Sox' }));
  assert.strictEqual(away.abbr, 'FAY');
  assert.strictEqual(away.usIsHome, false);
  assert.strictEqual(away.usScore, 10, 'road affiliate score read from the away slot');
  assert.strictEqual(away.won, true, 'won 10-9 on the road');

  // a game with no Astros affiliate is not ours
  assert.strictEqual(M.normalizeGame(mkGame({ homeId: 999, awayId: 888 })), null, 'unrelated game dropped');
}

// ---- ordering: the ladder, always the same way round ----
{
  const games = [
    M.normalizeGame(mkGame({ pk: 1, homeId: 601, awayId: 5 })),      // DSL Blue
    M.normalizeGame(mkGame({ pk: 2, homeId: 5434, awayId: 5 })),     // AAA
    M.normalizeGame(mkGame({ pk: 3, homeId: 3712, awayId: 5 })),     // A
    M.normalizeGame(mkGame({ pk: 4, homeId: 482, awayId: 5 })),      // AA
  ];
  const order = M.sortGames(games).map(g => g.level);
  assert.deepStrictEqual(order, ['AAA', 'AA', 'A', 'DSL'], 'sorted down the ladder, not by start time');
}

// ---- how a game reads ----
{
  const live = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, state: 'Live', detailed: 'In Progress',
    linescore: { currentInning: 7, inningHalf: 'Top', isTopInning: true, outs: 1, scheduledInnings: 9 } }));
  assert.strictEqual(M.stateText(live), '▲7', 'top of the 7th');

  const bottom = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, state: 'Live',
    linescore: { currentInning: 3, inningHalf: 'Bottom', isTopInning: false, scheduledInnings: 9 } }));
  assert.strictEqual(M.stateText(bottom), '▼3', 'bottom of the 3rd');

  const final = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, state: 'Final' }));
  assert.strictEqual(M.stateText(final), 'Final');

  const extras = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, state: 'Final',
    linescore: { currentInning: 11, scheduledInnings: 9 } }));
  assert.strictEqual(M.stateText(extras), 'Final/11', 'extra innings flagged');

  const ppd = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, state: 'Preview', detailed: 'Postponed' }));
  assert.strictEqual(M.stateText(ppd), 'Postponed', 'postponed says so rather than showing a start time');

  const tie = M.normalizeGame(mkGame({ homeId: 482, awayId: 260, state: 'Final', homeScore: 3, awayScore: 3 }));
  assert.strictEqual(tie.tied, true, 'ties happen in the minors');
  assert.strictEqual(tie.won, false, 'a tie is not a win');
}

// ---- the date question ----
{
  // A 7:05pm Central first pitch is already tomorrow in UTC. Getting this
  // wrong empties the ticker every evening.
  const ct = M.todayCT();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ct), 'today in Central is a plain date: ' + ct);

  assert.strictEqual(M.shiftDate('2026-08-06', -1), '2026-08-05');
  assert.strictEqual(M.shiftDate('2026-08-06', 1), '2026-08-07');
  assert.strictEqual(M.shiftDate('2026-01-01', -1), '2025-12-31', 'crosses a year boundary');
  assert.strictEqual(M.shiftDate('2026-03-01', -1), '2026-02-28', 'and a month boundary');
  assert.strictEqual(M.shiftDate('2024-03-01', -1), '2024-02-29', 'leap day survives');

  // The label must not drift a day when formatting.
  assert.ok(M.prettyDate('2026-08-06').includes('Aug 6'), M.prettyDate('2026-08-06'));
  assert.ok(M.prettyDate(ct).startsWith('Today'), 'today is named');
  assert.ok(M.prettyDate(M.shiftDate(ct, -1)).startsWith('Yesterday'), 'so is yesterday');
}

// ---- polling pace ----
{
  const live = [{ state: 'Live' }, { state: 'Final' }];
  const upcoming = [{ state: 'Preview' }];
  const done = [{ state: 'Final' }, { state: 'Final' }];
  assert.ok(M.refreshMs(live) <= 30000, 'live games refresh quickly');
  assert.ok(M.refreshMs(upcoming) > M.refreshMs(live), 'slower before first pitch');
  assert.ok(M.refreshMs(done) > M.refreshMs(upcoming), 'slowest once everything is final');
}

// ---- escaping ----
assert.strictEqual(M.esc('<b>&"'), '&lt;b&gt;&amp;&quot;', 'team and player names are escaped');

// ---- every affiliate accounted for ----
{
  const ids = Object.keys(M.CLUBS);
  assert.strictEqual(ids.length, 7, 'all seven clubs');
  const levels = ids.map(i => M.CLUBS[i].level);
  ['AAA', 'AA', 'A+', 'A', 'FCL', 'DSL'].forEach(l =>
    assert.ok(levels.includes(l), 'covers ' + l));
  const orders = ids.map(i => M.CLUBS[i].order);
  assert.strictEqual(new Set(orders).size, 7, 'display order is unambiguous');
}

console.log('milb.test: OK');
