/**
 * Minor league percentile profiles, computed in-house from MLB's public
 * Stats API: pull every player at each level, build percentile pools WITHIN
 * that level, then score our tracked prospects against those pools.
 *
 * Two-floor policy (this is deliberate — see config.json):
 *  - POOL floors (poolPA/poolIP): who defines the distribution. Keeping the
 *    pool at full-season floors stops one 8-PA hot streak from warping
 *    everyone else's percentiles.
 *  - DISPLAY floors (displayPA/displayIP): the lowered bar for showing a
 *    tracked prospect's percentiles. Between display and pool floors a player
 *    is scored against the qualified pool and flagged `thin: true`; the UI
 *    must surface PA/IP and a small-sample caveat. Below display floors the
 *    player gets no percentiles at all — an honest "not enough playing time".
 *
 * Percentile idea inspired by Prospect Savant (prospectsavant.com, Ethan
 * "Duke" Hill) — the maths here is our own, from MLB's public API.
 */
const CFG = require('../config.json');
const api = require('./mlb-api');

const YEAR = CFG.season;
// sportId -> label, ordered low to high so "highest level reached" is a max()
const LEVELS = [[16, 'Rk'], [14, 'A'], [13, 'A+'], [12, 'AA'], [11, 'AAA']];
const LEVEL_RANK = new Map(LEVELS.map(([id, lbl], i) => [lbl, i]));

const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
// "82.1" means 82 innings and one out, not 82.1 innings.
const ip2out = v => {
  const n = num(v); if (n == null) return null;
  const whole = Math.floor(n);
  return whole * 3 + Math.round((n - whole) * 10);
};
const div = (a, b) => (a == null || !b ? null : a / b);
const pct1 = v => (v == null ? null : +(v * 100).toFixed(1));

// [key, label, invert] — invert = lower raw value is better
const HIT = [
  ['ops', 'OPS', 0], ['obp', 'OBP', 0], ['slg', 'SLG', 0], ['avg', 'AVG', 0],
  ['iso', 'ISO', 0], ['hrRate', 'HR%', 0], ['bbpct', 'BB%', 0],
  ['kpct', 'K%', 1], ['sb', 'SB', 0], ['babip', 'BABIP', 0],
];
const PIT = [
  ['era', 'ERA', 1], ['whip', 'WHIP', 1], ['k9', 'K/9', 0], ['bb9', 'BB/9', 1],
  ['h9', 'H/9', 1], ['hr9', 'HR/9', 1], ['kpct', 'K%', 0], ['bbpct', 'BB%', 1],
  ['kbb', 'K/BB', 0], ['strikePct', 'Strike%', 0],
];
// Composites, mirroring how a scouting board reads.
const COMPOSITES = {
  H: { production: ['ops', 'obp', 'avg'], power: ['slg', 'iso', 'hrRate'], discipline: ['bbpct', 'kpct'] },
  P: { run_prevention: ['era', 'whip', 'h9'], stuff: ['k9', 'kpct'], control: ['bb9', 'bbpct', 'kbb', 'strikePct'] },
};

// Parse EVERY player (no floor here); floors are applied later per role.
function hitRow(s) {
  const t = s.stat || {}, pa = num(t.plateAppearances);
  if (!pa) return null;
  const avg = num(t.avg), slg = num(t.slg);
  return {
    id: s.player && s.player.id, name: s.player && s.player.fullName,
    team: s.team && s.team.name, age: num(t.age), pa,
    line: `${t.avg || '—'} AVG · ${t.ops || '—'} OPS · ${t.homeRuns ?? 0} HR · ${t.stolenBases ?? 0} SB`,
    v: {
      ops: num(t.ops), obp: num(t.obp), slg, avg,
      iso: (slg != null && avg != null) ? +(slg - avg).toFixed(3) : null,
      hrRate: pct1(div(num(t.homeRuns), pa)), bbpct: pct1(div(num(t.baseOnBalls), pa)),
      kpct: pct1(div(num(t.strikeOuts), pa)), sb: num(t.stolenBases), babip: num(t.babip),
    },
  };
}
function pitRow(s) {
  const t = s.stat || {}, outs = ip2out(t.inningsPitched), bf = num(t.battersFaced);
  if (!outs) return null;
  return {
    id: s.player && s.player.id, name: s.player && s.player.fullName,
    team: s.team && s.team.name, age: num(t.age), ip: t.inningsPitched, outs,
    line: `${t.era || '—'} ERA · ${t.whip || '—'} WHIP · ${t.strikeOuts ?? 0} K · ${t.inningsPitched || 0} IP`,
    v: {
      era: num(t.era), whip: num(t.whip), k9: num(t.strikeoutsPer9Inn), bb9: num(t.walksPer9Inn),
      h9: num(t.hitsPer9Inn), hr9: num(t.homeRunsPer9), kbb: num(t.strikeoutWalkRatio),
      kpct: pct1(div(num(t.strikeOuts), bf)), bbpct: pct1(div(num(t.baseOnBalls), bf)),
      strikePct: pct1(num(t.strikePercentage)),
    },
  };
}

// Standard "percent of the pool at or below", ties split.
function percentile(sorted, v, invert) {
  if (v == null || !sorted.length) return null;
  let below = 0, eq = 0;
  for (const x of sorted) { if (x < v) below++; else if (x === v) eq++; }
  const p = 100 * (below + 0.5 * eq) / sorted.length;
  return Math.round(invert ? 100 - p : p);
}

const qualifies = (r, kind) => kind === 'H' ? r.pa >= CFG.poolPA : r.outs >= CFG.poolIP * 3;
const displayable = (r, kind) => kind === 'H' ? r.pa >= CFG.displayPA : r.outs >= CFG.displayIP * 3;

/**
 * Score `rows` (all parsed players at one level) against pools built from
 * qualified players only. Returns only rows meeting the display floor,
 * each with p/comp/agg/score and `thin` when under the pool floor.
 */
function score(rows, spec, kind) {
  const qual = rows.filter(r => qualifies(r, kind));
  const pools = {};
  spec.forEach(([k]) => { pools[k] = qual.map(r => r.v[k]).filter(v => v != null).sort((a, b) => a - b); });
  const ages = qual.map(r => r.age).filter(v => v != null).sort((a, b) => a - b);

  const out = rows.filter(r => displayable(r, kind));
  out.forEach(r => {
    r.p = {};
    spec.forEach(([k, , inv]) => { const pc = percentile(pools[k], r.v[k], inv); if (pc != null) r.p[k] = pc; });
    r.p.age = percentile(ages, r.age, 1);
    const all = Object.entries(r.p).filter(([k]) => k !== 'age').map(([, v]) => v);
    r.agg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null;
    r.comp = {};
    Object.entries(COMPOSITES[kind]).forEach(([name, keys]) => {
      const vals = keys.map(k => r.p[k]).filter(v => v != null);
      if (vals.length) r.comp[name] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    // Age-weighted headline: mostly performance, real thumb on the scale
    // for being young at the level.
    r.score = (r.agg == null) ? null
      : Math.round(r.agg * 0.8 + (r.p.age == null ? 50 : r.p.age) * 0.2);
    r.thin = !qualifies(r, kind);
  });
  return { scored: out, poolN: qual.length };
}

/**
 * Fetch + score all levels. Returns { players, pools, labels } where players
 * is keyed by MLB id and holds each player's HIGHEST level profile.
 * `trackedIds` (Set) limits the output; pass null to keep everyone.
 */
async function milbPercentiles(trackedIds) {
  const players = {};
  const meta = [];
  for (const [sportId, lvl] of LEVELS) {
    for (const [group, kind, parse, spec] of [
      ['hitting', 'H', hitRow, HIT], ['pitching', 'P', pitRow, PIT],
    ]) {
      const d = await api.levelStats(sportId, group);
      let rows = ((d && d.stats && d.stats[0] && d.stats[0].splits) || []).map(parse).filter(Boolean);
      if (!rows.length) { console.warn(`  ${lvl} ${group}: no data — skipped`); continue; }
      // A player traded mid-level shows up twice; keep the larger sample.
      const best = new Map();
      rows.forEach(r => {
        const cur = best.get(r.id);
        if (!cur || (r.pa || r.outs || 0) > (cur.pa || cur.outs || 0)) best.set(r.id, r);
      });
      rows = [...best.values()];
      const { scored, poolN } = score(rows, spec, kind);
      if (poolN < 15) { console.warn(`  ${lvl} ${group}: pool only ${poolN} — too thin, skipped`); continue; }
      scored.forEach(r => {
        if (trackedIds && !trackedIds.has(r.id)) return;
        const prev = players[r.id];
        // Promoted players appear at several levels; keep the highest reached.
        if (prev && LEVEL_RANK.get(prev.lvl) >= LEVEL_RANK.get(lvl)) return;
        players[r.id] = {
          lvl, kind, name: r.name, team: r.team, age: r.age,
          pa: r.pa, ip: r.ip, line: r.line, thin: r.thin,
          v: r.v, p: r.p, comp: r.comp, agg: r.agg, score: r.score, poolN,
        };
      });
      meta.push({ level: lvl, group, n: poolN });
      console.log(`  ${lvl.padEnd(3)} ${group.padEnd(8)} pool ${poolN}`);
    }
  }
  return {
    players, pools: meta,
    labels: { H: HIT.map(([k, l]) => [k, l]), P: PIT.map(([k, l]) => [k, l]) },
  };
}

module.exports = { milbPercentiles, score, percentile, hitRow, pitRow, HIT, PIT, LEVELS };
