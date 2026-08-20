(function () {
  'use strict';
  const M = window.MILB;
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);

  // Where a prospect badge should link when the player has no scouting report.
  const TOP30_URL = (() => {
    try {
      const raw = params.get('top30');
      if (!raw) return 'index.html';
      const u = new URL(raw, location.href);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : 'index.html';
    } catch (e) { return 'index.html'; }
  })();

  let date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : M.todayCT();
  let games = [];
  let timer = null;
  const openGames = new Set();

  // ---------- rendering ----------
  function teamRow(name, org, runs, cls) {
    return `<div class="g-row ${cls}">
      <span class="g-name">${M.esc(name)}${org ? ` <span class="g-org">${M.esc(org)}</span>` : ''}</span>
      <span class="g-runs">${runs == null ? '' : runs}</span></div>`;
  }

  function gameHTML(g) {
    const final = g.state === 'Final', live = g.state === 'Live';
    const usCls = final ? (g.tied ? '' : (g.won ? 'won' : 'lost')) : '';
    const themCls = final ? (g.tied ? '' : (g.won ? 'lost' : 'won')) : '';
    const us = teamRow(g.club, null, g.usScore, usCls);
    const them = teamRow(g.themName, g.themOrg && g.themOrg !== 'Houston Astros' ? g.themOrg : null, g.themScore, themCls);
    return `<div class="game ${live ? 'is-live' : ''} ${final && g.won ? 'won' : ''}" id="g${g.pk}" data-pk="${g.pk}">
      <div class="game-head">
        <span class="g-lvl">${M.esc(g.level)}</span>
        <span class="g-teams">${g.usIsHome ? them + us : us + them}</span>
        <span class="g-state ${live ? 'is-live' : ''}">
          <span class="s1">${live ? '<span class="dot"></span>' : ''}${M.esc(M.stateText(g))}</span>
          <span class="s2">${g.record ? M.esc(g.club + ' ' + g.record) : ''}</span>
        </span>
        <span class="g-caret">▶</span>
      </div>
      <div class="g-body"><div class="g-loading">Loading box score…</div></div>
    </div>`;
  }

  function linescoreHTML(g) {
    if (!g.innings || !g.innings.length) return '';
    const n = Math.max(g.scheduledInnings || 9, g.innings.length);
    const head = ['', ...Array.from({ length: n }, (_, i) => i + 1), 'R', 'H', 'E'];
    const side = which => {
      const cells = [];
      for (let i = 0; i < n; i++) {
        const inn = g.innings[i];
        const v = inn && inn[which] ? inn[which].runs : null;
        cells.push(`<td>${v == null ? '·' : v}</td>`);
      }
      const t = (g.rhe && g.rhe[which]) || {};
      const name = which === 'home'
        ? (g.usIsHome ? g.club : g.themName) : (g.usIsHome ? g.themName : g.club);
      return `<tr><td class="team">${M.esc(name)}</td>${cells.join('')}` +
        `<td class="tot sep">${t.runs == null ? '' : t.runs}</td>` +
        `<td class="tot">${t.hits == null ? '' : t.hits}</td>` +
        `<td class="tot">${t.errors == null ? '' : t.errors}</td></tr>`;
    };
    return `<div class="linescore"><table><thead><tr>` +
      head.map((h, i) => `<th class="${i === head.length - 3 ? 'sep' : ''}">${h}</th>`).join('') +
      `</tr></thead><tbody>${side('away')}${side('home')}</tbody></table></div>`;
  }

  // A player in the Top 30 gets his rank badged and pointed at his report.
  function prosBadge(id, pros) {
    const p = pros[id];
    if (!p) return '';
    const href = p.article || TOP30_URL;
    const label = p.hm ? 'HM' : 'AF #' + p.rank;
    return ` <a class="pros ${p.hm ? 'hm' : ''}" href="${M.esc(href)}" target="_top" ` +
      `title="${M.esc(p.name)} — Astros Future ${p.hm ? 'honorable mention' : 'No. ' + p.rank}">${label}</a>`;
  }

  function batTable(side, pros) {
    const rows = (side.batters || []).map(id => {
      const pl = side.players['ID' + id];
      if (!pl) return '';
      const b = (pl.stats && pl.stats.batting) || {};
      if (b.atBats == null && b.plateAppearances == null) return '';
      const season = (pl.seasonStats && pl.seasonStats.batting) || {};
      return `<tr><td>${M.esc(pl.person.fullName)}<span class="pos">${M.esc((pl.position || {}).abbreviation || '')}</span>${prosBadge(pl.person.id, pros)}</td>` +
        `<td>${b.atBats ?? 0}</td><td>${b.runs ?? 0}</td><td>${b.hits ?? 0}</td>` +
        `<td>${b.doubles ?? 0}</td><td class="tri">${b.triples ?? 0}</td><td>${b.homeRuns ?? 0}</td>` +
        `<td>${b.rbi ?? 0}</td><td>${b.baseOnBalls ?? 0}</td><td>${b.strikeOuts ?? 0}</td>` +
        `<td>${b.stolenBases ?? 0}</td>` +
        `<td>${season.avg || '—'}</td></tr>`;
    }).join('');
    if (!rows) return '';
    return `<div class="bs"><table><thead><tr><th>Batting</th><th>AB</th><th>R</th><th>H</th>` +
      `<th class="xbh">2B</th><th class="xbh tri">3B</th><th class="xbh">HR</th>` +
      `<th>RBI</th><th>BB</th><th>K</th><th class="xbh">SB</th><th>AVG</th>` +
      `</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function pitTable(side, pros) {
    const rows = (side.pitchers || []).map(id => {
      const pl = side.players['ID' + id];
      if (!pl) return '';
      const p = (pl.stats && pl.stats.pitching) || {};
      if (p.inningsPitched == null) return '';
      const season = (pl.seasonStats && pl.seasonStats.pitching) || {};
      return `<tr><td>${M.esc(pl.person.fullName)}${prosBadge(pl.person.id, pros)}</td>` +
        `<td>${p.inningsPitched ?? '0.0'}</td><td>${p.hits ?? 0}</td><td>${p.runs ?? 0}</td>` +
        `<td>${p.earnedRuns ?? 0}</td><td>${p.homeRuns ?? 0}</td>` +
        `<td>${p.baseOnBalls ?? 0}</td><td>${p.strikeOuts ?? 0}</td>` +
        `<td>${season.era || '—'}</td></tr>`;
    }).join('');
    if (!rows) return '';
    return `<div class="bs"><table><thead><tr><th>Pitching</th><th>IP</th><th>H</th><th>R</th>` +
      `<th>ER</th><th class="xbh">HR</th><th>BB</th><th>K</th><th>ERA</th>` +
      `</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function fillBody(el, g) {
    const body = el.querySelector('.g-body');
    let box, pros = {};
    try {
      [box, pros] = await Promise.all([M.fetchBox(g.pk), M.prospects()]);
    } catch (e) {
      body.innerHTML = linescoreHTML(g) +
        '<div class="g-loading">Box score not available for this game yet.</div>';
      M.sendHeight();
      return;
    }
    const ourSide = g.usIsHome ? box.teams.home : box.teams.away;
    const theirSide = g.usIsHome ? box.teams.away : box.teams.home;
    const live = g.state === 'Live' && (g.batter || g.pitcher)
      ? `<div class="live-now">${g.half ? M.esc(g.half) + ' ' + g.inning + (g.outs != null ? ' · ' + g.outs + ' out' : '') + ' — ' : ''}` +
        (g.pitcher ? `<b>P:</b> ${M.esc(g.pitcher.fullName)} ` : '') +
        (g.batter ? `<b>AB:</b> ${M.esc(g.batter.fullName)}` : '') + '</div>'
      : '';
    body.innerHTML = live + linescoreHTML(g) +
      `<div class="bs-hd">${M.esc(g.club)}</div>` + batTable(ourSide, pros) + pitTable(ourSide, pros) +
      `<div class="bs-hd">${M.esc(g.themName)}</div>` + batTable(theirSide, pros) + pitTable(theirSide, pros);
    M.sendHeight();
  }

  function paintDate() {
    $('#datelabel').textContent = M.prettyDate(date);
    $('#today').disabled = date === M.todayCT();
    // Keep the address bar in step so a day can be linked or bookmarked. The
    // hash has to be carried across: a ticker link arrives as ?date=…#g12345
    // and rewriting without it would drop the game we were asked to open.
    const q = new URLSearchParams(location.search);
    q.set('date', date);
    history.replaceState(null, '', location.pathname + '?' + q.toString() + (location.hash || ''));
  }

  async function load(preserveOpen) {
    // Read the requested game before anything rewrites the address bar.
    const want = (location.hash || '').replace('#g', '');
    paintDate();
    const host = $('#games');
    try {
      games = await M.fetchDay(date);
    } catch (e) {
      host.innerHTML = '<div class="empty">Scores are unavailable right now. Please try again shortly.</div>';
      M.sendHeight();
      return;
    }
    if (!games.length) {
      host.innerHTML = '<div class="empty">No affiliate games on this date.</div>';
      M.sendHeight();
      return;
    }
    host.innerHTML = games.map(gameHTML).join('');
    if (!preserveOpen) openGames.clear();
    games.forEach(g => {
      if (openGames.has(String(g.pk))) {
        const el = document.getElementById('g' + g.pk);
        el.classList.add('open');
        fillBody(el, g);
      }
    });
    // A ticker link like …/scores/?date=…#g815420 opens that game directly.
    if (want && !openGames.has(want)) {
      const el = document.getElementById('g' + want);
      const g = games.find(x => String(x.pk) === want);
      if (el && g) {
        el.classList.add('open'); openGames.add(want); fillBody(el, g);
        // Guarded: an exception here would abandon the rest of the load.
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
      }
    }
    M.sendHeight();
    clearTimeout(timer);
    if (date === M.todayCT()) timer = setTimeout(() => load(true), M.refreshMs(games));
  }

  // ---------- interaction ----------
  document.addEventListener('click', e => {
    if (e.target.closest('.pros')) return;           // let prospect links through
    const head = e.target.closest('.game-head');
    if (!head) return;
    const el = head.parentElement, pk = el.dataset.pk;
    const opening = !el.classList.contains('open');
    el.classList.toggle('open', opening);
    if (opening) {
      openGames.add(pk);
      const g = games.find(x => String(x.pk) === pk);
      if (g && el.querySelector('.g-loading')) fillBody(el, g);
    } else openGames.delete(pk);
    M.sendHeight();
  });
  $('#prev').addEventListener('click', () => { date = M.shiftDate(date, -1); load(); });
  $('#next').addEventListener('click', () => { date = M.shiftDate(date, 1); load(); });
  $('#today').addEventListener('click', () => { date = M.todayCT(); load(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && date === M.todayCT()) load(true);
  });

  load();
  addEventListener('load', M.sendHeight);
  if (window.ResizeObserver) new ResizeObserver(M.sendHeight).observe(document.body);
})();
