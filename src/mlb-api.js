// Thin MLB Stats API client: pacing, retries, small helpers. Node 20+ fetch.
// Ported from the Astros Trade Hub pattern; no code is shared across repos.
const CFG = require('../config.json');
const BASE = 'https://statsapi.mlb.com/api/v1';

let inFlight = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 3) {
  while (inFlight >= (CFG.concurrency || 8)) await sleep(25);
  inFlight++;
  try {
    for (let a = 1; a <= tries; a++) {
      try {
        await sleep(CFG.requestDelayMs || 60);
        const res = await fetch(url, { headers: { 'User-Agent': 'astros-future-top30' } });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        if (a === tries) { console.warn('  ! fetch failed:', url.slice(0, 110), e.message); return null; }
        await sleep(500 * a);
      }
    }
  } finally { inFlight--; }
}

const api = {
  get,
  // Batched person lookups. hydrate=currentTeam gives club + parent org;
  // rosterEntries carries IL status.
  people: (ids, hydrate = 'currentTeam,rosterEntries,draft') =>
    get(`${BASE}/people?personIds=${ids.join(',')}&hydrate=${encodeURIComponent(hydrate)}`),
  // Career MLB stats — used only for the rookie-limits graduation check.
  careerStats: (id, pitcher) =>
    get(`${BASE}/people/${id}/stats?stats=career&group=${pitcher ? 'pitching' : 'hitting'}&sportId=1`),
  search: name =>
    get(`${BASE}/people/search?names=${encodeURIComponent(name)}&sportIds=1,11,12,13,14,16&hydrate=currentTeam`),
  // Full level pool for percentile computation.
  levelStats: (sportId, group) =>
    get(`${BASE}/stats?stats=season&group=${group}&season=${CFG.season}&sportId=${sportId}&limit=3000&playerPool=ALL`),
};

module.exports = api;
