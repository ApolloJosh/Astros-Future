/* Astros Future — interactive Top 30.
   Data arrives via data/prospects.js (window.AF_DATA) so the page works from
   file://, iframes and Pages alike — no CORS anywhere. */
(function () {
  'use strict';
  const D = window.AF_DATA || { players: [], floors: {}, labels: null, pools: [] };
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Headshots, sure-fire: MLB's photo CDN with a default-image transform, so a
  // player with no photo gets a proper silhouette instead of a broken image.
  // Fallback chain: MiLB headshot -> spots avatar -> initials circle.
  const shotMilb = id => id ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_120,q_auto:best/v1/people/${id}/headshot/milb/current` : '';
  const shot = id => id ? `https://midfield.mlbstatic.com/v1/people/${id}/spots/120` : '';
  const initials = name => (name || '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  document.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.classList.contains('shot')) return;
    if (img.dataset.fb) { img.src = img.dataset.fb; img.removeAttribute('data-fb'); return; }
    const span = document.createElement('span');
    span.className = 'shot init';
    span.textContent = img.dataset.init || '?';
    img.replaceWith(span);
  }, true);

  const FLOORS = Object.assign({ poolPA: 50, poolIP: 20, displayPA: 15, displayIP: 5 }, D.floors);
  // Fallback bar labels for builds where the percentile pull hasn't run yet.
  const LABELS = D.labels || {
    H: [['ops','OPS'],['obp','OBP'],['slg','SLG'],['avg','AVG'],['iso','ISO'],['hrRate','HR%'],['bbpct','BB%'],['kpct','K%'],['sb','SB'],['babip','BABIP']],
    P: [['era','ERA'],['whip','WHIP'],['k9','K/9'],['bb9','BB/9'],['h9','H/9'],['hr9','HR/9'],['kpct','K%'],['bbpct','BB%'],['kbb','K/BB'],['strikePct','Strike%']],
  };

  const players = D.players || [];
  const byId = new Map(players.map(p => [p.id, p]));
  const defaultOrder = players.filter(p => !p.hm && p.rank != null)
    .sort((a, b) => a.rank - b.rank).map(p => p.id);
  const SIZE = defaultOrder.length || 30;
  const LS_KEY = 'af30-list-v1';

  // ---------- state ----------
  let order = [];        // visitor's 30 (ids)
  let viewingShared = false;

  function normalize(ids) {
    const seen = new Set();
    const out = [];
    (ids || []).forEach(id => {
      id = +id;
      if (byId.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
    });
    defaultOrder.forEach(id => { if (out.length < SIZE && !seen.has(id)) { seen.add(id); out.push(id); } });
    return out.slice(0, SIZE);
  }
  const hmPool = () => players.filter(p => !order.includes(p.id)).map(p => p.id);
  const isDefault = () => order.length === defaultOrder.length && order.every((id, i) => id === defaultOrder[i]);

  function load() {
    const q = new URLSearchParams(location.search).get('list');
    if (q) {
      order = normalize(q.split('.'));
      viewingShared = !isDefault();
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && Array.isArray(s.list)) { order = normalize(s.list); return; }
    } catch (e) {}
    order = defaultOrder.slice();
  }
  function save() {
    if (viewingShared) return; // don't clobber the visitor's own list while browsing someone else's
    try {
      if (isDefault()) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify({ list: order, t: Date.now() }));
    } catch (e) {}
  }

  // ---------- percentile bars (Savant-style diverging scale) ----------
  function savantColor(pc) {
    const stops = [[0, [50, 84, 168]], [25, [126, 155, 203]], [50, [186, 194, 202]], [75, [214, 122, 106]], [100, [196, 40, 40]]];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) if (pc >= stops[i][0] && pc <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    const t = b[0] === a[0] ? 0 : (pc - a[0]) / (b[0] - a[0]);
    const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const ipOuts = ip => { if (ip == null) return null; const n = parseFloat(ip); const w = Math.floor(n); return w * 3 + Math.round((n - w) * 10); };
  const fmtV = v => v == null ? '—' : (typeof v === 'number' && v < 1 && v > -1 && v !== 0 ? ('' + v.toFixed(3)).replace(/^(-?)0\./, '$1.') : v);

  function sampleTxt(p) {
    return p.kind === 'H' ? (p.pa != null ? p.pa + ' PA' : null) : (p.ip != null ? p.ip + ' IP' : null);
  }
  function pctSection(p) {
    const sample = sampleTxt(p);
    const hd = (extra) => `<div class="pct-hd">Percentiles <span class="sub">${esc(p.lvl || '')}${sample ? ' · ' + sample : ''}${extra || ''}</span></div>`;
    if (!p.line) {
      return hd() + `<div class="empty-note">No 2026 game action yet${p.il ? ' — currently on the ' + esc(p.il) : ''}.</div>`;
    }
    const under = p.kind === 'H'
      ? (p.pa != null && p.pa < FLOORS.displayPA)
      : (ipOuts(p.ip) != null && ipOuts(p.ip) < FLOORS.displayIP * 3);
    if (!p.p) {
      if (under) return hd() + `<div class="empty-note">Not enough playing time yet for reliable percentiles (${sample || 'tiny sample'}).</div>`;
      return hd() + `<div class="empty-note">Percentiles arrive with the next data refresh.</div>`;
    }
    const thinNote = p.thin
      ? `<div class="thin-note">Small sample — ${sample} is under the usual ${p.kind === 'H' ? FLOORS.poolPA + ' PA' : FLOORS.poolIP + ' IP'} floor, so these percentiles are noisier than most.</div>`
      : '';
    const labels = LABELS[p.kind] || [];
    const bars = labels.map(([k, label]) => {
      const pc = p.p[k], v = p.v && p.v[k];
      if (pc == null) return '';
      const col = savantColor(pc);
      return `<div class="sbar"><span class="slbl">${esc(label)}</span>` +
        `<span class="strack"><span class="sfill" style="width:${pc}%;background:${col}"></span>` +
        `<span class="sdot" style="left:calc(${pc}% - 11px);background:${col}">${pc}</span></span>` +
        `<span class="sval">${esc(fmtV(v))}</span></div>`;
    }).join('');
    if (!bars) return hd() + `<div class="empty-note">Percentiles arrive with the next data refresh.</div>`;
    const box = (l, v) => v == null ? '' : `<div class="pvbox"><span>${esc(l)}</span><b>${v}</b></div>`;
    const comps = Object.entries(p.comp || {}).map(([k, v]) => box(k.replace(/_/g, ' '), v)).join('');
    const poolTxt = p.poolN ? ` · vs ${p.poolN} qualified` : '';
    return hd(poolTxt) + thinNote +
      `<div class="pvgrid">${box('Prospect score', p.score)}${box('Young for level', p.p.age)}${comps}</div>` +
      `<div class="sscale"><span style="color:#3254a8">POOR</span><span>AVERAGE</span><span style="color:#c42828">GREAT</span></div>` +
      bars +
      `<div class="credit">Ranked against ${esc(p.lvl)} only, computed from the MLB Stats API. Inspired by <a href="https://prospectsavant.com" target="_blank" rel="noopener">Prospect Savant</a>.</div>`;
  }

  // ---------- rows ----------
  function chips(p) {
    let h = '';
    if (p.il) h += `<span class="chip il">${esc(p.il.replace(/injured list/i, 'IL'))}</span>`;
    if (p.graduated) h += `<span class="chip grad">Graduated</span>`;
    else if (p.mlbDebut) h += `<span class="chip debut">MLB Debut</span>`;
    return h;
  }
  function detail(p) {
    const draftTxt = p.draft && p.draft.round
      ? `Drafted ${p.draft.year} · Round ${p.draft.round}, Pick ${p.draft.pick}`
      : (p.draftYear ? 'Drafted ' + p.draftYear : 'Int’l signing');
    const bits = [p.bt ? 'B/T ' + p.bt : null, p.ht, p.wt ? p.wt + ' lbs' : null,
      p.birthPlace, draftTxt, p.club].filter(Boolean);
    const season = p.line
      ? `<div class="season"><span class="lvl-tag">${esc(p.lvl || '—')}</span>${esc(p.line)}</div>`
      : `<div class="season"><span class="lvl-tag">2026</span>No game action yet</div>`;
    const article = p.article
      ? `<a class="report-lnk" href="${esc(p.article)}" target="_blank" rel="noopener">Read the full ${esc(p.name)} scouting report →</a>` : '';
    return `<div class="bio">${esc(bits.join(' · '))}</div>` + season + pctSection(p) + article;
  }
  function rowHTML(p, i, hm) {
    const rankCell = hm ? `<span class="rank">HM</span>` : `<span class="rank">${i + 1}</span>`;
    const right = hm
      ? `<button class="promote" data-promote="${p.id}">↑ My 30</button>`
      : `<span class="cell eta"><span class="lbl">ETA</span><span class="val">${esc(p.eta || '—')}</span></span>` +
        `<span class="cell af"><span class="lbl">AF</span><span class="val">#${p.rank ?? '—'}</span></span>` +
        `<span class="cell pipe"><span class="lbl">MLB</span><span class="val">${p.pipelineRank ? '#' + p.pipelineRank : '—'}</span></span>`;
    return `<li class="row ${hm ? 'hm-row' : ''}" data-id="${p.id}">
      <div class="row-main">
        <span class="grip" ${hm ? 'style="visibility:hidden"' : ''} title="Drag to reorder">⠿</span>
        ${rankCell}
        <img class="shot" loading="lazy" alt="" src="${shotMilb(p.id)}" data-fb="${shot(p.id)}" data-init="${esc(initials(p.name))}">
        <span class="who">
          <span class="pname">${esc(p.name)} ${chips(p)}</span>
          <span class="pmeta">${esc([p.pos, p.age ? 'Age ' + p.age : null, p.lvl].filter(Boolean).join(' · '))}</span>
        </span>
        ${right}
        <span class="caret">▶</span>
      </div>
      <div class="detail">${detail(p)}</div>
    </li>`;
  }

  function render() {
    $('#list').innerHTML = order.map((id, i) => rowHTML(byId.get(id), i, false)).join('');
    $('#hm').innerHTML = hmPool().map(id => rowHTML(byId.get(id), 0, true)).join('');
    $('#reset').hidden = isDefault() && !localStorage.getItem(LS_KEY);
    $('#shared-banner').hidden = !viewingShared;
    sendHeight();
  }

  // ---------- interactions ----------
  document.addEventListener('click', e => {
    const pro = e.target.closest('[data-promote]');
    if (pro) {
      const id = +pro.dataset.promote;
      claimIfShared();
      order = order.slice(0, SIZE - 1);   // last ranked drops to HM
      order.push(id);
      save(); render();
      return;
    }
    const main = e.target.closest('.row-main');
    if (main && !e.target.closest('.grip')) {
      main.parentElement.classList.toggle('open');
      sendHeight();
    }
  });

  function claimIfShared() {
    if (!viewingShared) return;
    viewingShared = false;
    history.replaceState(null, '', location.pathname);
    $('#shared-banner').hidden = true;
  }

  // Pointer-based drag (mouse + touch) on the grip only.
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.grip');
    if (!grip || grip.style.visibility === 'hidden') return;
    const row = grip.closest('.row');
    if (!row || row.closest('#hm')) return;
    e.preventDefault();
    claimIfShared();
    const r = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.style.setProperty('--ghost-w', r.width + 'px');
    ghost.style.width = r.width + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost);
    row.classList.add('dragging');
    drag = { row, ghost, dy: e.clientY - r.top };
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    e.preventDefault();
    drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
    const rows = [...$('#list').children].filter(x => x !== drag.row);
    let placed = false;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) { r.before(drag.row); placed = true; break; }
    }
    if (!placed) $('#list').appendChild(drag.row);
  }, { passive: false });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    drag.ghost.remove();
    drag.row.classList.remove('dragging');
    document.body.style.userSelect = '';
    order = [...$('#list').children].map(r => +r.dataset.id);
    drag = null;
    save(); render();
  });

  // ---------- share link ----------
  function shareURL() {
    const base = location.origin === 'null' || location.protocol === 'file:'
      ? location.href.split('?')[0] : location.origin + location.pathname;
    return isDefault() ? base : base + '?list=' + order.join('.');
  }
  $('#share').addEventListener('click', () => {
    const url = shareURL();
    $('#share-out').hidden = false;
    $('#share-url').value = url;
    copyText(url);
  });
  $('#copy').addEventListener('click', () => copyText($('#share-url').value));
  function copyText(t) {
    const done = ok => { if (ok) { $('#copied').hidden = false; setTimeout(() => $('#copied').hidden = true, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(() => done(true), () => { legacyCopy(t); done(true); });
    else { legacyCopy(t); done(true); }
  }
  function legacyCopy(t) {
    const el = $('#share-url'); el.select(); el.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); } catch (e) {}
  }

  $('#reset').addEventListener('click', () => {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    viewingShared = false;
    history.replaceState(null, '', location.pathname);
    order = defaultOrder.slice();
    render();
  });
  $('#adopt').addEventListener('click', () => { claimIfShared(); save(); render(); });
  $('#see-default').addEventListener('click', e => {
    e.preventDefault();
    viewingShared = false;
    history.replaceState(null, '', location.pathname);
    load(); render();
  });

  // ---------- PNG card (no player photos — by design) ----------
  const loadImg = url => new Promise(res => {
    if (!url) return res(null);
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = url;
  });
  async function drawCard(noLogo) {
    const W = 1080, H = 1620;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const NAVY = '#013369', FLAME = '#FE4020', MUT = '#5d6470';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.fillStyle = NAVY; x.fillRect(0, 0, W, 170);
    x.fillStyle = FLAME; x.fillRect(0, 0, W, 10);
    const logo = noLogo ? null : await loadImg('https://astrosfuture.com/wp-content/uploads/2016/04/AF-logo-1.png');
    if (logo) {
      const lh = 90, lw = logo.width * (lh / logo.height);
      x.drawImage(logo, 40, 42, lw, lh);
    } else {
      x.fillStyle = '#fff'; x.font = '900 44px Roboto, sans-serif'; x.textAlign = 'left';
      x.fillText('ASTROS FUTURE', 40, 105);
    }
    x.textAlign = 'right';
    x.fillStyle = '#fff'; x.font = '900 52px Roboto, sans-serif';
    x.fillText(isDefault() ? 'TOP 30 PROSPECTS' : 'MY ASTROS TOP 30', W - 44, 92);
    x.font = '400 24px Roboto, sans-serif'; x.fillStyle = '#c9d4e4';
    x.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W - 44, 132);

    // 30 rows in two columns of 15: rank · name · age · level · pos
    const colX = [44, W / 2 + 24], colW = W / 2 - 68;
    const top = 230, rowH = 82;
    order.forEach((id, i) => {
      const p = byId.get(id);
      const cx = colX[i < 15 ? 0 : 1], cy = top + (i % 15) * rowH;
      x.textAlign = 'left';
      x.fillStyle = i < 3 ? FLAME : NAVY;
      x.font = '900 34px Roboto, sans-serif';
      x.fillText(String(i + 1), cx, cy + 6);
      x.fillStyle = '#000'; x.font = '700 27px Roboto, sans-serif';
      let name = p.name;
      while (x.measureText(name).width > colW - 120 && name.length > 3) name = name.slice(0, -1);
      if (name !== p.name) name = name.trim() + '…';
      x.fillText(name, cx + 58, cy + 2);
      x.fillStyle = MUT; x.font = '400 20px Roboto, sans-serif';
      x.fillText([p.age != null ? 'Age ' + p.age : null, p.lvl, p.pos].filter(Boolean).join('  ·  '), cx + 58, cy + 30);
      x.strokeStyle = '#eceef1'; x.beginPath();
      x.moveTo(cx, cy + 48); x.lineTo(cx + colW, cy + 48); x.stroke();
    });

    x.fillStyle = FLAME; x.fillRect(0, H - 92, W, 92);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '900 30px Roboto, sans-serif';
    x.fillText('Rank the Astros top prospects at AstrosFuture.com', W / 2, H - 36);
    return cv;
  }
  $('#png').addEventListener('click', async () => {
    let url = null;
    try { url = (await drawCard()).toDataURL('image/png'); }
    catch (e) { try { url = (await drawCard(true)).toDataURL('image/png'); } catch (e2) {} }
    if (!url) return alert('Sorry — the image export failed in this browser.');
    const a = document.createElement('a');
    a.href = url; a.download = 'my-astros-top-30.png';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // ---------- iframe auto-height ----------
  function sendHeight() {
    if (window.parent === window) return;
    requestAnimationFrame(() => {
      try { parent.postMessage({ af30Height: document.documentElement.scrollHeight }, '*'); } catch (e) {}
    });
  }
  if (window.ResizeObserver) new ResizeObserver(sendHeight).observe(document.body);
  addEventListener('load', sendHeight);

  // ---------- boot ----------
  if (D.updated) $('#updated').textContent = 'Updated ' + new Date(D.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  load();
  render();
})();
