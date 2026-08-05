/**
 * The human-owned half of the data: rankings, ETAs, article links, Pipeline
 * ranks, honorable mentions. Read from a published Google Sheet so the site
 * owner never touches GitHub; data-sources/rankings.json is the checked-in
 * fallback AND the cache of the last good sheet read.
 *
 * Sheet layout (tab name in config.sheetTab), one header row then:
 *   Rank | Player | Position | MLB ID | ETA | Pipeline Rank | Report Link
 * Rank is 1-30, or "HM" for honorable mentions. Player + Rank are required;
 * everything else may be blank. MLB ID blank = we resolve it by name search.
 */
const fs = require('fs');
const path = require('path');
const CFG = require('../config.json');

const FALLBACK = path.join(__dirname, '..', 'data-sources', 'rankings.json');

// Minimal CSV parser that survives quoted fields with commas/newlines.
function parseCSV(text) {
  const rows = [[]];
  let field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { rows[rows.length - 1].push(field); field = ''; }
    else if (c === '\n') { rows[rows.length - 1].push(field); field = ''; rows.push([]); }
    else if (c !== '\r') field += c;
  }
  rows[rows.length - 1].push(field);
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

function fromRows(rows) {
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  const col = name => hdr.findIndex(h => h.includes(name));
  const iRank = col('rank'), iName = col('player'), iPos = col('pos'),
    iId = col('mlb id'), iEta = col('eta'), iPipe = col('pipeline'), iUrl = col('report');
  if (iRank < 0 || iName < 0) throw new Error('sheet missing Rank/Player columns');
  const prospects = [];
  rows.slice(1).forEach(r => {
    const name = (r[iName] || '').trim();
    if (!name) return;
    const rawRank = (r[iRank] || '').trim();
    const rank = /^\d+$/.test(rawRank) ? +rawRank : null; // "HM" or blank -> honorable mention
    prospects.push({
      rank, name,
      pos: iPos >= 0 ? (r[iPos] || '').trim() || null : null,
      mlbid: iId >= 0 && /^\d+$/.test((r[iId] || '').trim()) ? +(r[iId]).trim() : null,
      eta: iEta >= 0 ? (r[iEta] || '').trim() || null : null,
      pipelineRank: iPipe >= 0 && /^\d+$/.test((r[iPipe] || '').trim()) ? +(r[iPipe]).trim() : null,
      article: iUrl >= 0 ? (r[iUrl] || '').trim() || null : null,
    });
  });
  const ranked = prospects.filter(p => p.rank != null).sort((a, b) => a.rank - b.rank);
  const hm = prospects.filter(p => p.rank == null);
  if (ranked.length < 10) throw new Error(`sheet has only ${ranked.length} ranked players — refusing`);
  return { updated: new Date().toISOString().slice(0, 10), prospects: [...ranked, ...hm] };
}

async function loadRankings() {
  if (CFG.sheetId) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${CFG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CFG.sheetTab || 'Top 30')}`;
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = fromRows(parseCSV(await r.text()));
      // Cache the good read so a future sheet outage serves the last good list.
      fs.writeFileSync(FALLBACK, JSON.stringify(data, null, 2));
      console.log(`rankings: sheet OK — ${data.prospects.length} players`);
      return data;
    } catch (e) {
      console.warn('rankings: sheet failed (' + e.message + ') — using fallback file');
    }
  }
  const data = JSON.parse(fs.readFileSync(FALLBACK, 'utf8'));
  console.log(`rankings: fallback file — ${data.prospects.length} players`);
  return data;
}

module.exports = { loadRankings, parseCSV, fromRows };
