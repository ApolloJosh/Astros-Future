/**
 * Build pipeline: rankings (human, via sheet) + facts (machine, via MLB
 * StatsAPI) -> docs/data/prospects.json + prospects.js.
 *
 * Resilience: every successful per-player fetch is cached into
 * data-sources/cache.json. If the API is unreachable (or one player's fetch
 * fails), the last cached facts are used instead, so a flaky data source can
 * never blank the page. The initial checked-in cache doubles as seed data.
 *
 * prospects.js is the same payload wrapped as `window.AF_DATA = {...}` —
 * loaded via <script>, which sidesteps CORS entirely (file://, iframes, CDNs).
 */
const fs = require('fs');
const path = require('path');
const CFG = require('../config.json');
const api = require('./mlb-api');
const { loadRankings } = require('./rankings');
const { milbPercentiles } = require('./fetch-milb');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'data');
const CACHE_FILE = path.join(ROOT, 'data-sources', 'cache.json');
const POOLS_FILE = path.join(ROOT, 'data-sources', 'pools.json');

const PHOTO_DIR = path.join(ROOT, 'docs', 'assets', 'photos');

// Custom headshots. MLB has no photo for most 17-year-olds in the DSL, so a
// file named <mlbid>.jpg|png|webp dropped in docs/assets/photos wins over the
// MLB CDN. Same-origin, so it also stays safe to draw on the share card.
function photoOverrides() {
  const map = {};
  try {
    fs.readdirSync(PHOTO_DIR).forEach(f => {
      const m = /^(\d+)\.(jpe?g|png|webp)$/i.exec(f);
      if (m) map[m[1]] = 'assets/photos/' + f;
    });
  } catch (e) { /* folder is optional */ }
  return map;
}

const LVL_OF_SPORT = { 11: 'AAA', 12: 'AA', 13: 'A+', 14: 'A', 16: 'Rk', 1: 'MLB' };
const readJSON = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } };

const isPitcherPos = pos => /P$|^P$/i.test((pos || '').trim()) || /^(SP|RP|RHP|LHP)$/i.test((pos || '').trim());

function bioFrom(person) {
  const p = person;
  const team = p.currentTeam || {};
  // rosterEntries: latest active entry whose status mentions the injured list.
  let il = null;
  (p.rosterEntries || []).forEach(e => {
    const s = (e.status && (e.status.description || e.status.code)) || '';
    if (e.isActive !== false && /injured/i.test(s)) il = s.replace(/\s*list\s*/i, ' List').trim();
  });
  // Draft details: the entry where he actually signed (isPass=false), else latest.
  const dr = (p.drafts || []).find(d => d.isDrafted && !d.isPass) || (p.drafts || [])[0] || null;
  return {
    id: p.id, name: p.fullName,
    age: p.currentAge ?? null, birthDate: p.birthDate || null,
    birthPlace: [p.birthCity, p.birthStateProvince, p.birthCountry].filter(Boolean).join(', ') || null,
    ht: p.height || null, wt: p.weight || null,
    bt: (p.batSide && p.batSide.code || '—') + '/' + (p.pitchHand && p.pitchHand.code || '—'),
    posApi: p.primaryPosition && p.primaryPosition.abbreviation || null,
    draftYear: p.draftYear || null,
    draft: dr ? { year: +dr.year || p.draftYear || null, round: dr.pickRound || null, pick: dr.pickNumber || null } : null,
    mlbDebut: p.mlbDebutDate || null,
    club: team.name || null,
    // sport isn't hydrated on currentTeam by default; level is refined later
    // from milb data (highest level with 2026 stats) when available.
    il,
  };
}

// Rookie limits: > 130 MLB at-bats or > 50 MLB innings pitched.
async function isGraduated(id, pitcher) {
  const d = await api.careerStats(id, pitcher);
  const sp = d && d.stats && d.stats[0] && d.stats[0].splits;
  if (!sp || !sp.length) return false;
  const t = sp[0].stat || {};
  if (pitcher) {
    const ip = parseFloat(t.inningsPitched || 0);
    return ip > 50;
  }
  return (t.atBats || 0) > 130;
}

(async () => {
  const rankings = await loadRankings();
  const cache = readJSON(CACHE_FILE, { players: {} });
  const photos = photoOverrides();
  const nPhotos = Object.keys(photos).length;
  if (nPhotos) console.log(`custom photos: ${nPhotos}`);

  // ---- resolve missing MLB ids by name (org-scoped when possible) ----
  for (const pr of rankings.prospects) {
    if (pr.mlbid) continue;
    const d = await api.search(pr.name);
    const cands = (d && d.people) || [];
    const inOrg = cands.find(c => c.currentTeam && (c.currentTeam.parentOrgId === CFG.teamId || c.currentTeam.id === CFG.teamId));
    const pick = inOrg || cands[0];
    if (pick) { pr.mlbid = pick.id; console.log(`resolved id: ${pr.name} -> ${pick.id}${inOrg ? '' : ' (no org match — verify!)'}`); }
    else console.warn(`could not resolve MLB id for ${pr.name}`);
  }

  const ids = rankings.prospects.map(p => p.mlbid).filter(Boolean);
  const tracked = new Set(ids);

  // ---- bios (batched) ----
  const bios = {};
  for (let i = 0; i < ids.length; i += 20) {
    const d = await api.people(ids.slice(i, i + 20));
    ((d && d.people) || []).forEach(p => { bios[p.id] = bioFrom(p); });
  }

  // ---- minor league percentiles ----
  let milb = null;
  try {
    milb = await milbPercentiles(tracked);
    if (!Object.keys(milb.players).length) milb = null;
  } catch (e) { console.warn('milb percentiles failed:', e.message); }

  // ---- assemble per-player records ----
  const players = [];
  for (const pr of rankings.prospects) {
    const id = pr.mlbid;
    const bio = id && bios[id];
    const m = id && milb && milb.players[id];
    let rec;
    if (bio) {
      const pitcher = isPitcherPos(pr.pos || bio.posApi);
      let graduated = false;
      if (bio.mlbDebut) {
        try { graduated = await isGraduated(id, pitcher); } catch (e) { /* keep false */ }
      }
      // If the percentile pull failed this run, keep the last cached stats
      // rather than blanking the marquee feature for a day.
      const keep = (!m && cache.players[id]) || null;
      const s = m || keep || {};
      rec = {
        id, name: pr.name, pos: pr.pos || bio.posApi,
        age: bio.age, birthDate: bio.birthDate, birthPlace: bio.birthPlace,
        ht: bio.ht, wt: bio.wt, bt: bio.bt, draftYear: bio.draftYear, draft: bio.draft,
        club: bio.club, il: bio.il, mlbDebut: bio.mlbDebut, graduated,
        lvl: s.lvl || null,
        kind: s.kind || (pitcher ? 'P' : 'H'),
        line: s.line || null,
        pa: s.pa || null, ip: s.ip || null,
        thin: s.thin || false,
        v: s.v || null, p: s.p || null,
        comp: s.comp || null, agg: s.agg ?? null,
        score: s.score ?? null, poolN: s.poolN || null,
      };
      cache.players[id] = rec; // remember the good fetch
    } else if (id && cache.players[id]) {
      rec = { ...cache.players[id], name: pr.name, pos: pr.pos || cache.players[id].pos };
      console.warn(`using cached facts for ${pr.name}`);
    } else {
      rec = { id: id || null, name: pr.name, pos: pr.pos || null, kind: isPitcherPos(pr.pos) ? 'P' : 'H' };
      console.warn(`no facts for ${pr.name} — bare record`);
    }
    // human-owned fields land last so the sheet always wins
    rec.rank = pr.rank;
    rec.hm = pr.rank == null;
    rec.photo = (id && photos[id]) || null;
    rec.eta = pr.eta || CFG.etaAuto[rec.lvl] || null;
    rec.pipelineRank = pr.pipelineRank ?? null;
    rec.article = pr.article || null;
    players.push(rec);
  }

  // ---- versioned link pools ----
  // Share codes encode positions in a fixed id list, not raw MLB ids, which is
  // what makes them short. That list therefore has to be frozen: when the owner
  // adds or drops a player the ids shift, and every previously shared link would
  // silently decode to the wrong 30. So each distinct roster gets a version, and
  // old versions are kept forever — a link made last month still resolves
  // against the pool it was made with.
  // A version also pins the owner's own order, because the short scheme stores
  // "what differs from his list" — if his list changes, the same bits mean
  // something new. Both halves are therefore frozen together.
  const linkPools = readJSON(POOLS_FILE, []);
  const currentIds = players.map(p => p.id).filter(Boolean).sort((a, b) => a - b);
  const currentDef = players.filter(p => !p.hm && p.rank != null)
    .sort((a, b) => a.rank - b.rank).map(p => p.id);
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const latest = linkPools[linkPools.length - 1];
  if (!latest || !eq(latest.ids, currentIds) || !eq(latest.def, currentDef)) {
    linkPools.push({ v: linkPools.length, ids: currentIds, def: currentDef });
    console.log(`link pool v${linkPools.length - 1} created (${currentIds.length} players)`);
  }
  fs.writeFileSync(POOLS_FILE, JSON.stringify(linkPools));

  const out = {
    updated: new Date().toISOString(), season: CFG.season,
    source: 'MLB Stats API — percentiles computed in-house, per level',
    floors: { poolPA: CFG.poolPA, poolIP: CFG.poolIP, displayPA: CFG.displayPA, displayIP: CFG.displayIP },
    pools: (milb && milb.pools) || [],
    labels: (milb && milb.labels) || null,
    linkPools,
    players,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'prospects.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(OUT_DIR, 'prospects.js'), 'window.AF_DATA = ' + JSON.stringify(out) + ';');
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  const ranked = players.filter(p => !p.hm).length;
  console.log(`prospects.json: ${ranked} ranked + ${players.length - ranked} honorable mentions` +
    (milb ? '' : ' (percentiles unavailable this run — cached/absent)'));
})().catch(e => { console.error('build failed:', e.message); process.exit(1); });
