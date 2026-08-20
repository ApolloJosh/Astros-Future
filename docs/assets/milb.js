/* Astros Future — shared minor league scoreboard data layer.
 *
 * Used by both ticker.html and scores.html. Unlike the Top 30 page, this data
 * is NOT built ahead of time: scores change during games, so the browser talks
 * to MLB's Stats API directly. That API sends permissive CORS headers, so no
 * server or proxy is involved — the page just fetches.
 *
 * One request covers the whole farm system: the schedule endpoint accepts a
 * comma-separated list of team ids, so all seven clubs come back together.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;  // node tests
  root.MILB = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const API = 'https://statsapi.mlb.com/api/v1';

  // The Astros farm system. `order` fixes the display sequence top to bottom;
  // a fan reads the ladder in level order, so the ticker never reshuffles.
  const CLUBS = {
    5434: { abbr: 'SUG', club: 'Sugar Land', level: 'AAA', order: 1 },
    482:  { abbr: 'CC',  club: 'Corpus Christi', level: 'AA', order: 2 },
    573:  { abbr: 'ASH', club: 'Asheville', level: 'A+', order: 3 },
    3712: { abbr: 'FAY', club: 'Fayetteville', level: 'A', order: 4 },
    1998: { abbr: 'FCL', club: 'FCL Astros', level: 'FCL', order: 5 },
    5005: { abbr: 'DSL-O', club: 'DSL Astros Orange', level: 'DSL', order: 6 },
    601:  { abbr: 'DSL-B', club: 'DSL Astros Blue', level: 'DSL', order: 7 },
  };
  const CLUB_IDS = Object.keys(CLUBS);
  const SPORT_IDS = '11,12,13,14,16';
  const TZ = 'America/Chicago';   // the audience is in Houston

  // ---------- dates ----------
  // A night game in Texas is already "tomorrow" in UTC, so every date decision
  // has to be made in Central or the scoreboard flips over at 7pm.
  function todayCT() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
  function shiftDate(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }
  function prettyDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const label = dt.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
    const t = todayCT();
    if (ymd === t) return 'Today · ' + label;
    if (ymd === shiftDate(t, -1)) return 'Yesterday · ' + label;
    if (ymd === shiftDate(t, 1)) return 'Tomorrow · ' + label;
    return label;
  }
  function gameTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: TZ,
      }).replace(' ', '').toLowerCase();
    } catch (e) { return ''; }
  }

  // ---------- normalising a game ----------
  // MLB reports home and away; we care about "us" and "them", because the
  // affiliate might be either.
  function normalizeGame(g) {
    const home = g.teams && g.teams.home, away = g.teams && g.teams.away;
    if (!home || !away) return null;
    const usIsHome = !!CLUBS[home.team.id];
    const us = usIsHome ? home : away;
    const them = usIsHome ? away : home;
    const meta = CLUBS[us.team.id];
    if (!meta) return null;                       // not one of ours
    const ls = g.linescore || {};
    const state = g.status ? g.status.abstractGameState : 'Preview';
    const detailed = g.status ? g.status.detailedState : '';
    const usScore = us.score == null ? null : us.score;
    const themScore = them.score == null ? null : them.score;
    return {
      pk: g.gamePk,
      level: meta.level, order: meta.order, abbr: meta.abbr, club: meta.club,
      usIsHome,
      usScore, themScore,
      themAbbr: (them.team.abbreviation || '').slice(0, 5),
      themName: them.team.shortName || them.team.name || '',
      themOrg: them.team.parentOrgName || null,
      record: us.leagueRecord ? us.leagueRecord.wins + '-' + us.leagueRecord.losses : null,
      state,                                       // Preview | Live | Final
      detailed,                                    // "Delayed", "Postponed", …
      inning: ls.currentInning || null,
      half: ls.inningHalf || ls.inningState || null,
      isTop: ls.isTopInning !== undefined ? ls.isTopInning : null,
      outs: ls.outs == null ? null : ls.outs,
      innings: ls.innings || [],
      rhe: ls.teams || null,
      scheduledInnings: ls.scheduledInnings || 9,
      batter: ls.offense && ls.offense.batter ? ls.offense.batter : null,
      pitcher: ls.defense && ls.defense.pitcher ? ls.defense.pitcher : null,
      startTime: g.gameDate,
      doubleHeader: g.doubleHeader && g.doubleHeader !== 'N',
      gameNumber: g.gameNumber || 1,
      won: state === 'Final' && usScore != null && themScore != null ? usScore > themScore : null,
      tied: state === 'Final' && usScore === themScore,
    };
  }

  // Level order, then first pitch. Predictable beats clever: the AAA club is
  // always first, so people learn where to look.
  function sortGames(games) {
    return games.slice().sort((a, b) =>
      (a.order - b.order) || (a.gameNumber - b.gameNumber) ||
      String(a.startTime).localeCompare(String(b.startTime)));
  }

  // One line describing where a game stands.
  function stateText(g) {
    if (g.state === 'Final') {
      const extra = g.inning && g.inning > g.scheduledInnings ? '/' + g.inning : '';
      return 'Final' + extra;
    }
    if (g.state === 'Live') {
      if (/warmup|delay|suspend/i.test(g.detailed || '')) return g.detailed;
      const arrow = g.isTop === false ? '▼' : '▲';
      return arrow + (g.inning || '');
    }
    if (/postponed|cancel|suspend/i.test(g.detailed || '')) return g.detailed;
    return gameTime(g.startTime);
  }

  // ---------- fetching ----------
  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function fetchDay(ymd) {
    const url = API + '/schedule?sportId=' + SPORT_IDS +
      '&teamId=' + CLUB_IDS.join(',') +
      '&date=' + ymd + '&hydrate=linescore,team';
    const j = await getJSON(url);
    const dates = j.dates || [];
    const raw = dates.length ? (dates[0].games || []) : [];
    return sortGames(raw.map(normalizeGame).filter(Boolean));
  }

  const boxCache = {};
  async function fetchBox(pk) {
    if (boxCache[pk]) return boxCache[pk];
    const j = await getJSON(API + '/game/' + pk + '/boxscore');
    boxCache[pk] = j;
    return j;
  }

  // ---------- prospect tie-in ----------
  // The Top 30 page already publishes its data next door, so a player in the
  // box score can be badged with his rank and pointed at his scouting report.
  let prospectsPromise = null;
  function prospects() {
    if (prospectsPromise) return prospectsPromise;
    prospectsPromise = getJSON('data/prospects.json')
      .then(d => {
        const byId = {};
        (d.players || []).forEach(p => {
          if (p.id) byId[p.id] = { rank: p.rank, hm: p.hm, name: p.name, article: p.article };
        });
        return byId;
      })
      .catch(() => ({}));           // scoreboard works fine without it
    return prospectsPromise;
  }

  // How often to poll: often while something is live, rarely otherwise.
  function refreshMs(games) {
    if (games.some(g => g.state === 'Live')) return 30000;
    if (games.some(g => g.state === 'Preview')) return 120000;
    return 600000;
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Tell a host page how tall we are (same contract as the Top 30 widget).
  function sendHeight() {
    if (typeof window === 'undefined' || window.parent === window) return;
    const post = () => {
      try {
        // Measure the content, not the document: documentElement.scrollHeight
        // is never smaller than the viewport, and inside an iframe the viewport
        // IS the iframe — so a short widget would report the frame's current
        // height and could never shrink back down.
        const h = Math.ceil(document.body.getBoundingClientRect().height)
          || document.body.scrollHeight;
        window.parent.postMessage({ af30Height: h }, '*');
      } catch (e) {}
    };
    post();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(post);
  }

  return {
    CLUBS, CLUB_IDS, API, TZ,
    todayCT, shiftDate, prettyDate, gameTime,
    normalizeGame, sortGames, stateText,
    fetchDay, fetchBox, prospects, refreshMs, esc, sendHeight,
  };
}));
