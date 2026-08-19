(function () {
  'use strict';
  const M = window.MILB;
  const rail = document.getElementById('more') && document.getElementById('rail');
  const params = new URLSearchParams(location.search);

  // Where "All scores" and each game should send the reader. The host page
  // passes ?scores=<url>; falling back to this widget's own Scores page means
  // it still works when opened directly.
  const SCORES_URL = (() => {
    try {
      const raw = params.get('scores');
      if (!raw) return 'scores.html';
      const u = new URL(raw, location.href);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : 'scores.html';
    } catch (e) { return 'scores.html'; }
  })();

  function gameHTML(g, dateStr) {
    const usRow = `<span class="tg-row us ${g.state === 'Final' ? (g.won ? 'won' : (g.tied ? '' : 'lost')) : ''}">
        <span class="tg-abbr">${M.esc(g.abbr)}</span>
        <span class="tg-score">${g.usScore == null ? '' : g.usScore}</span></span>`;
    const themRow = `<span class="tg-row ${g.state === 'Final' ? (g.won === false && !g.tied ? 'won' : 'lost') : ''}">
        <span class="tg-abbr">${M.esc(g.themAbbr)}</span>
        <span class="tg-score">${g.themScore == null ? '' : g.themScore}</span></span>`;
    // Home team on the bottom line, the way a scoreboard reads.
    const rows = g.usIsHome ? themRow + usRow : usRow + themRow;
    const live = g.state === 'Live';
    return `<a class="tg" href="${M.esc(SCORES_URL)}${SCORES_URL.includes('?') ? '&' : '?'}date=${dateStr}#g${g.pk}" target="_top">
      <span class="tg-lvl">${M.esc(g.level)}</span>
      <span class="tg-teams">${rows}</span>
      <span class="tg-state ${live ? 'is-live' : ''}">${live ? '<span class="dot"></span>' : ''}${M.esc(M.stateText(g))}</span>
    </a>`;
  }

  let timer = null;
  async function draw() {
    const railEl = document.getElementById('rail');
    const more = document.getElementById('more');
    let games = [], date = M.todayCT();
    try {
      games = await M.fetchDay(date);
      // Early morning there may be nothing yet — show last night instead, so
      // the banner is never empty at breakfast.
      if (!games.length) {
        const y = M.shiftDate(date, -1);
        const last = await M.fetchDay(y);
        if (last.length) { games = last; date = y; }
      }
    } catch (e) {
      railEl.innerHTML = '<span class="ticker-empty">Scores unavailable right now.</span>';
      M.sendHeight();
      return;
    }
    if (!games.length) {
      railEl.innerHTML = '<span class="ticker-empty">No affiliate games scheduled.</span>';
    } else {
      const isYesterday = date !== M.todayCT();
      railEl.innerHTML = (isYesterday
        ? '<span class="ticker-empty">Last night:</span>' : '') +
        games.map(g => gameHTML(g, date)).join('');
    }
    more.href = SCORES_URL;
    more.hidden = false;
    M.sendHeight();

    clearTimeout(timer);
    timer = setTimeout(draw, M.refreshMs(games));
  }

  draw();
  // Coming back to a tab after a while should show current scores, not stale ones.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
  addEventListener('load', M.sendHeight);
  if (window.ResizeObserver) new ResizeObserver(M.sendHeight).observe(document.body);
})();
