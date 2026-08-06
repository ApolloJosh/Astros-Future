/**
 * Writes data-sources/rankings.json (the build's fallback list) and
 * astros-future-rankings.csv (for importing into the owner's Google Sheet).
 *
 * Run once whenever the list is edited here rather than in the sheet:
 *   node data-sources/build-rankings.js
 *
 * Once the sheet is live it becomes the source of truth and this file is just
 * the record of where the seed came from. MLB IDs were resolved against the
 * Astros' full-season affiliate rosters on 2026-08-05 — note Jagger Beck
 * (828672, RHP at Fayetteville) is NOT the Jack Beck the Astros took in round
 * 13 of the 2026 draft (842042, an infielder).
 */
const fs = require('fs');
const path = require('path');

// rank, name, position, mlbid, MLB Pipeline rank (the ordering this list used
// to carry, kept so the page can show both his rank and Pipeline's)
const TOP30 = [
  [1, 'Kevin Alvarez', 'OF', 829037, 1],
  [2, 'Xavier Neyens', '3B', 815832, 2],
  [3, 'Logan Hughes', 'OF', 813314, null],
  [4, 'Jack Radel', 'RHP', 806481, null],
  [5, 'Albert Fermín', 'SS', 837522, 4],
  [6, 'Bryce Mayer', 'RHP', 809343, 5],
  [7, 'Ethan Frey', 'OF', 703676, 7],
  [8, 'Ethan Pecko', 'RHP', 814490, 6],
  [9, 'Jason Schiavone', 'C', 828395, 3],
  [10, 'Wes Mendes', 'LHP', 803544, null],
  [11, 'Walker Janek', 'C', 801075, 9],
  [12, 'Anthony Huezo', 'OF', 805953, 15],
  [13, 'Kam Durnin', 'SS', 806494, null],
  [14, 'Beau Peterson', '3B', 828679, null],
  [15, 'Cole Hertzler', 'RHP', 826315, 19],
  [16, 'Caden Powell', 'SS', 702547, 23],
  [17, 'Nick Potter', 'RHP', 830769, 17],
  [18, 'Jagger Beck', 'RHP', 828672, null],
  [19, 'Keon Johnson', 'SS', 828801, null],
  [20, 'Will Bush', 'C', 813844, 16],
  [21, 'Luis De Leon', 'C', 825479, 21],
  [22, 'Joseph Sullivan', 'OF', 813896, 10],
  [23, 'Nehomar Ochoa Jr.', 'OF', 806441, null],
  [24, 'Juan Fraide', 'RHP', 830004, null],
  [25, 'Jackson Nezuh', 'RHP', 694545, 13],
  [26, 'Jase Mitchell', 'C', 834234, 30],
  [27, 'Gabel Pentecost', 'RHP', 834872, 26],
  [28, 'Adrian Ardines', 'RHP', 821593, null],
  [29, 'Juan Sierra', 'OF', 808027, null],
  [30, 'Alonzo Tredwell', 'RHP', 696280, 25],
];

const HM = [
  ['Sami Manzueta', '2B', 832795, 27],
  ['Max Holy', 'SS', 802959, 20],
  ['James Hicks', 'RHP', 801802, 12],
  ['Javier Perez', 'RHP', 823649, null],
  ['Justin Thomas Jr.', 'OF', 702520, null],
  ['Yamal Encarnacion', '2B', 699043, null],
  ['Trevor Austin', 'SS', 809338, null],
  ['Alejandro Nunez', 'SS', 805168, null],
  ['Kyle Walker', '2B', 809143, null],
  ['Chase Call', 'OF', 813842, null],
  ['Josh Wakefield', 'OF', 811718, null],
  ['Drew Brutcher', 'OF', 695046, null],
  ['Brandon McPherson', 'RHP', 835483, null],
  ['Kellan Oakes', 'RHP', 822163, null],
  ['Andrew Taylor', 'RHP', 800063, null],
  ['Gavin Eddy', 'RHP', 806066, null],
  ['Michael Addari', 'RHP', 809085, null],
  ['Ryan Forcucci', 'RHP', 801573, 29],
  ['Anthony Millan', 'OF', 829860, 18],
  // Held over from the previous list. Not on his current 30 or his HM list,
  // but kept in the pool so visitors can still promote them. The first four
  // have already debuted in the majors and will carry a "Graduated" badge.
  ['Lucas Spence', 'OF', 828599, 8],
  ['Miguel Ullola', 'RHP', 699044, 11],
  ['Alimber Santa', 'RHP', 695001, 14],
  ['Zach Cole', 'OF', 805904, 24],
  ['Parker Smith', 'RHP', 809789, 22],
  ['Nick Monistere', 'INF', 823809, 28],
  ['Hudson Leach', 'RHP', 813865, null],
  ['Ramsey David', 'RHP', 687062, null],
];

const prospects = [
  ...TOP30.map(([rank, name, pos, mlbid, pipelineRank]) =>
    ({ rank, name, pos, mlbid, eta: null, pipelineRank, article: null })),
  ...HM.map(([name, pos, mlbid, pipelineRank]) =>
    ({ rank: null, name, pos, mlbid, eta: null, pipelineRank, article: null })),
];

const ids = prospects.map(p => p.mlbid);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) throw new Error('duplicate MLB ids: ' + dupes.join(', '));
if (ids.some(id => !id)) throw new Error('a player is missing an MLB id');

fs.writeFileSync(path.join(__dirname, 'rankings.json'),
  JSON.stringify({ updated: new Date().toISOString().slice(0, 10), prospects }, null, 2));

// CSV for Google Sheets — headers must match what src/rankings.js looks for.
const esc = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const rows = [['Rank', 'Player', 'Position', 'MLB ID', 'ETA', 'Pipeline Rank', 'Report Link']];
prospects.forEach(p => rows.push([
  p.rank == null ? 'HM' : p.rank, p.name, p.pos, p.mlbid, '', p.pipelineRank ?? '', '',
]));
fs.writeFileSync(path.join(__dirname, '..', 'astros-future-rankings.csv'),
  rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n');

console.log(`rankings.json + CSV written: ${TOP30.length} ranked, ${HM.length} honorable mentions`);
