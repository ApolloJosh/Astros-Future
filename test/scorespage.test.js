// The Scores page, driven through jsdom with stubbed API responses shaped the
// way statsapi actually returns them.  Needs jsdom:
//   npm i --no-save jsdom && node test/scorespage.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('scorespage.test: jsdom not installed — skipped'); process.exit(0); }

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs', 'scores.html'), 'utf8')
  .replace(/<script src="[^"]*"><\/script>/g, '');
const milbJs = fs.readFileSync(path.join(root, 'docs', 'assets', 'milb.js'), 'utf8');
const scoresJs = fs.readFileSync(path.join(root, 'docs', 'assets', 'scores.js'), 'utf8');
const DATE = '2026-08-06';

// --- fixtures ---------------------------------------------------------------
const schedule = { dates: [{ date: DATE, games: [
  { gamePk: 817474, gameDate: DATE + 'T23:35:00Z', gameNumber: 1, doubleHeader: 'N',
    status: { abstractGameState: 'Final', detailedState: 'Final' },
    teams: {
      away: { team: { id: 260, abbreviation: 'TUL', shortName: 'Tulsa', parentOrgName: 'Los Angeles Dodgers' }, score: 9, leagueRecord: { wins: 66, losses: 39 } },
      home: { team: { id: 482, abbreviation: 'CC', shortName: 'Corpus Christi', parentOrgName: 'Houston Astros' }, score: 4, leagueRecord: { wins: 50, losses: 55 } },
    },
    linescore: { currentInning: 9, inningHalf: 'Bottom', isTopInning: false, scheduledInnings: 9,
      innings: [
        { num: 1, away: { runs: 1 }, home: { runs: 0 } }, { num: 2, away: { runs: 0 }, home: { runs: 0 } },
        { num: 3, away: { runs: 0 }, home: { runs: 1 } }, { num: 4, away: { runs: 0 }, home: { runs: 0 } },
        { num: 5, away: { runs: 1 }, home: { runs: 2 } }, { num: 6, away: { runs: 0 }, home: { runs: 0 } },
        { num: 7, away: { runs: 4 }, home: { runs: 0 } }, { num: 8, away: { runs: 3 }, home: { runs: 1 } },
        { num: 9, away: { runs: 0 }, home: { runs: 0 } },
      ],
      teams: { away: { runs: 9, hits: 10, errors: 0 }, home: { runs: 4, hits: 7, errors: 1 } } },
  },
  { gamePk: 815420, gameDate: DATE + 'T18:05:00Z', gameNumber: 1, doubleHeader: 'N',
    status: { abstractGameState: 'Live', detailedState: 'In Progress' },
    teams: {
      away: { team: { id: 5434, abbreviation: 'SUG', shortName: 'Sugar Land', parentOrgName: 'Houston Astros' }, score: 3, leagueRecord: { wins: 58, losses: 52 } },
      home: { team: { id: 342, abbreviation: 'ABQ', shortName: 'Albuquerque', parentOrgName: 'Colorado Rockies' }, score: 5, leagueRecord: { wins: 57, losses: 54 } },
    },
    linescore: { currentInning: 7, inningHalf: 'Top', isTopInning: true, outs: 2, scheduledInnings: 9,
      innings: [], teams: {},
      offense: { batter: { id: 801075, fullName: 'Walker Janek' } },
      defense: { pitcher: { id: 669298, fullName: 'TJ Shook' } } },
  },
] }] };

// Corpus Christi's half of a box score, shaped like the real endpoint.
const player = (id, name, pos, bat, pit, season) => ({
  person: { id, fullName: name }, position: { abbreviation: pos },
  stats: { batting: bat || {}, pitching: pit || {} },
  seasonStats: season || { batting: {}, pitching: {} },
});
const boxscore = { teams: {
  home: {
    team: { id: 482, name: 'Corpus Christi Hooks' },
    batters: [801075, 813844, 800516],
    pitchers: [803247],
    players: {
      ID801075: player(801075, 'Walker Janek', 'C', { atBats: 4, runs: 1, hits: 2, doubles: 1, triples: 0, homeRuns: 1, rbi: 1, baseOnBalls: 0, strikeOuts: 1, stolenBases: 2 }, null, { batting: { avg: '.239' } }),
      ID813844: player(813844, 'Will Bush', 'DH', { atBats: 3, runs: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, baseOnBalls: 1, strikeOuts: 2, stolenBases: 0 }, null, { batting: { avg: '.252' } }),
      ID800516: player(800516, 'Alberto Hernandez', 'SS', { atBats: 4, runs: 1, hits: 1, doubles: 0, triples: 1, homeRuns: 0, rbi: 2, baseOnBalls: 0, strikeOuts: 0, stolenBases: 0 }, null, { batting: { avg: '.271' } }),
      ID803247: player(803247, 'Jose Guedez', 'P', null, { inningsPitched: '5.0', hits: 6, runs: 4, earnedRuns: 4, homeRuns: 2, baseOnBalls: 2, strikeOuts: 5 }, { pitching: { era: '4.15' } }),
    },
  },
  away: {
    team: { id: 260, name: 'Tulsa Drillers' },
    batters: [800543], pitchers: [],
    players: { ID800543: player(800543, 'Josue De Paula', 'LF', { atBats: 5, runs: 2, hits: 3, rbi: 3, baseOnBalls: 0, strikeOuts: 1 }, null, { batting: { avg: '.301' } }) },
  },
} };

// Two of the box score names are in the Top 30; one is an honorable mention.
const prospects = { players: [
  { id: 801075, name: 'Walker Janek', rank: 11, hm: false, article: 'https://astrosfuture.com/janek' },
  { id: 813844, name: 'Will Bush', rank: 20, hm: false, article: null },
  { id: 800516, name: 'Alberto Hernandez', rank: null, hm: true, article: null },
] };

function boot(url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const calls = [];
  dom.window.fetch = (u) => {
    calls.push(String(u));
    const body = /boxscore/.test(u) ? boxscore
      : /prospects\.json/.test(u) ? prospects
      : /schedule/.test(u) ? (String(u).includes(DATE) ? schedule : { dates: [] })
      : {};
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
  dom.window.eval(milbJs);
  dom.window.eval(scoresJs);
  return { dom, calls };
}
const settle = () => new Promise(r => setTimeout(r, 60));

(async () => {
  const BASE = 'https://apollojosh.github.io/Astros-Future/scores.html';
  const { dom, calls } = boot(BASE + '?date=' + DATE);
  const d = dom.window.document;
  await settle();

  // --- the day's games ---
  const cards = d.querySelectorAll('.game');
  assert.strictEqual(cards.length, 2, 'both games rendered');
  assert.ok(d.querySelector('.datelabel').textContent.includes('Aug 6'), 'date label');

  // AAA sorts above AA regardless of which finished first
  const levels = [...d.querySelectorAll('.g-lvl')].map(e => e.textContent);
  assert.deepStrictEqual(levels, ['AAA', 'AA'], 'ordered down the ladder');

  // the affiliate's own name and result read correctly from the home slot
  const aa = d.getElementById('g817474');
  assert.ok(aa.textContent.includes('Corpus Christi') && aa.textContent.includes('Tulsa'), 'both clubs named');
  assert.ok(aa.querySelector('.g-state').textContent.includes('Final'), 'final state');
  assert.ok(aa.textContent.includes('50-55'), 'affiliate record shown');
  assert.ok(!aa.classList.contains('won'), 'lost game not marked as a win');

  // live game flagged
  const aaa = d.getElementById('g815420');
  assert.ok(aaa.classList.contains('is-live'), 'live game flagged');
  assert.ok(aaa.querySelector('.g-state').textContent.includes('▲7'), 'inning shown');
  assert.ok(aaa.querySelector('.dot'), 'live pulse');

  // --- opening a box score ---
  assert.ok(!aa.classList.contains('open'), 'starts collapsed');
  aa.querySelector('.game-head').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.ok(aa.classList.contains('open'), 'opens on click');

  const body = aa.querySelector('.g-body').textContent;
  assert.ok(body.includes('Walker Janek') && body.includes('Jose Guedez'), 'batters and pitchers listed');
  assert.ok(body.includes('Josue De Paula'), 'opponent box score too');

  // linescore reads across
  const ls = aa.querySelector('.linescore');
  assert.ok(ls, 'linescore rendered');
  const rows = ls.querySelectorAll('tbody tr');
  assert.strictEqual(rows.length, 2, 'away and home');
  const homeCells = [...rows[1].querySelectorAll('td')].map(t => t.textContent);
  assert.strictEqual(homeCells[0], 'Corpus Christi', 'home team on the bottom row');
  assert.deepStrictEqual(homeCells.slice(-3), ['4', '7', '1'], 'R H E');

  // --- extra base hits and steals ---
  {
    const heads = [...aa.querySelectorAll('.bs table')][0].querySelectorAll('th');
    const labels = [...heads].map(h => h.textContent);
    ['2B', '3B', 'HR', 'SB'].forEach(c =>
      assert.ok(labels.includes(c), 'batting table has a ' + c + ' column, got ' + labels.join(' ')));
    // Janek: 1 double, 0 triples, 1 homer, 2 steals
    const janekRow = [...aa.querySelectorAll('.bs tbody tr')].find(r => r.textContent.includes('Walker Janek'));
    const cells = [...janekRow.querySelectorAll('td')].map(t => t.textContent.trim());
    const idx = n => labels.indexOf(n);
    assert.strictEqual(cells[idx('2B')], '1', 'his double');
    assert.strictEqual(cells[idx('HR')], '1', 'his home run');
    assert.strictEqual(cells[idx('SB')], '2', 'his steals');
    assert.strictEqual(cells[idx('3B')], '0', 'zeros read as 0, same as every other column');
    // Bush went 0-for-3: every counting column should say 0, none of them blank
    const bushRow = [...aa.querySelectorAll('.bs tbody tr')].find(r => r.textContent.includes('Will Bush'));
    const bush = [...bushRow.querySelectorAll('td')].map(t => t.textContent.trim());
    ['2B', '3B', 'HR', 'SB', 'R', 'RBI'].forEach(c =>
      assert.strictEqual(bush[idx(c)], '0', c + ' shows a plain zero'));
    // triples still present in the markup so the desktop table is complete
    assert.ok(janekRow.querySelector('td.tri'), 'triples column exists (hidden on phones by CSS)');

    // pitchers show home runs allowed
    const pHeads = [...[...aa.querySelectorAll('.bs table')][1].querySelectorAll('th')].map(h => h.textContent);
    assert.ok(pHeads.includes('HR'), 'pitching table has HR allowed: ' + pHeads.join(' '));
    const guedez = [...aa.querySelectorAll('.bs tbody tr')].find(r => r.textContent.includes('Jose Guedez'));
    const pCells = [...guedez.querySelectorAll('td')].map(t => t.textContent.trim());
    assert.strictEqual(pCells[pHeads.indexOf('HR')], '2', 'two homers allowed');
  }

  // --- prospect badges ---
  const badges = [...aa.querySelectorAll('.pros')].map(a => ({ txt: a.textContent, href: a.getAttribute('href') }));
  assert.ok(badges.some(b => b.txt === 'AF #11' && b.href === 'https://astrosfuture.com/janek'),
    'ranked prospect badged and linked to his report: ' + JSON.stringify(badges));
  assert.ok(badges.some(b => b.txt === 'AF #20'), 'prospect without a report still badged');
  assert.ok(badges.some(b => b.txt === 'HM'), 'honorable mention marked differently');
  assert.ok(!badges.some(b => b.txt.includes('De Paula')), 'opponents are not badged');

  // a player with no report falls back to the Top 30 page
  const noReport = badges.find(b => b.txt === 'AF #20');
  assert.ok(/index\.html|astrosfuture/.test(noReport.href), 'fallback link: ' + noReport.href);

  // --- box scores load once, lazily ---
  const boxCalls = calls.filter(u => /boxscore/.test(u)).length;
  assert.strictEqual(boxCalls, 1, 'only the opened game was fetched, got ' + boxCalls);
  aa.querySelector('.game-head').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  aa.querySelector('.game-head').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.strictEqual(calls.filter(u => /boxscore/.test(u)).length, 1, 'reopening reuses the cached box score');

  // --- date navigation ---
  d.getElementById('prev').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.ok(d.querySelector('.datelabel').textContent.includes('Aug 5'), 'stepped back a day');
  assert.ok(d.querySelector('.empty').textContent.includes('No affiliate games'), 'empty day says so');
  assert.ok(dom.window.location.search.includes('date=2026-08-05'), 'url follows the date so it can be shared');

  // --- a game deep-linked from the ticker opens itself ---
  const { dom: dom2 } = boot(BASE + '?date=' + DATE + '#g817474');
  await settle();
  const target = dom2.window.document.getElementById('g817474');
  assert.ok(target.classList.contains('open'), 'ticker link opens that game directly');

  console.log('scorespage.test: OK');
})().catch(e => { console.error(e); process.exit(1); });
