// One-time seed generator: builds rankings.json (human fallback) and
// cache.json (machine facts) from data hand-pulled off the MLB Stats API on
// 2026-08-05. The daily GitHub Actions build overwrites cache.json with live
// data; this file is kept only so the seed is reproducible/auditable.
const fs = require('fs');
const path = require('path');

// rank, name, pos, id  (rank null = honorable mention)
const LIST = [
  [1, 'Kevin Alvarez', 'OF', 829037], [2, 'Xavier Neyens', '3B', 815832],
  [3, 'Jason Schiavone', 'C', 828395], [4, 'Albert Fermín', 'SS', 837522],
  [5, 'Bryce Mayer', 'RHP', 809343], [6, 'Ethan Pecko', 'RHP', 814490],
  [7, 'Ethan Frey', 'OF', 703676], [8, 'Lucas Spence', 'OF', 828599],
  [9, 'Walker Janek', 'C', 801075], [10, 'Joseph Sullivan', 'OF', 813896],
  [11, 'Miguel Ullola', 'RHP', 699044], [12, 'James Hicks', 'RHP', 801802],
  [13, 'Jackson Nezuh', 'RHP', 694545], [14, 'Alimber Santa', 'RHP', 695001],
  [15, 'Anthony Huezo', 'OF', 805953], [16, 'Will Bush', 'C', 813844],
  [17, 'Nick Potter', 'RHP', 830769], [18, 'Anthony Millan', 'OF', 829860],
  [19, 'Cole Hertzler', 'RHP', 826315], [20, 'Max Holy', 'SS', 802959],
  [21, 'Luis De Leon', 'C', 825479], [22, 'Parker Smith', 'RHP', 809789],
  [23, 'Caden Powell', 'OF', 702547], [24, 'Zach Cole', 'OF', 805904],
  [25, 'Alonzo Tredwell', 'RHP', 696280], [26, 'Gabel Pentecost', 'RHP', 834872],
  [27, 'Sami Manzueta', '2B', 832795], [28, 'Nick Monistere', 'INF', 823809],
  [29, 'Ryan Forcucci', 'RHP', 801573], [30, 'Jase Mitchell', 'C', 834234],
  [null, 'Hudson Leach', 'RHP', 813865], [null, 'Ramsey David', 'RHP', 687062],
  // 2026 draft class — first five picks, unranked so visitors can promote them
  [null, 'Logan Hughes', 'OF', 813314], [null, 'Jack Radel', 'RHP', 806481],
  [null, 'Wes Mendes', 'LHP', 803544], [null, 'Keon Johnson', 'SS', 828801],
  [null, 'Kam Durnin', 'SS', 806494],
];

// Draft details for the 2026 picks, straight from the MLB draft endpoint, so
// they read correctly before the first Actions build fills the rest in.
const DRAFT = {
  813314: { year: 2026, round: '1', pick: 17 },
  806481: { year: 2026, round: 'PPI', pick: 28 },
  803544: { year: 2026, round: '2', pick: 57 },
  828801: { year: 2026, round: '3', pick: 93 },
  806494: { year: 2026, round: '4', pick: 121 },
};

// id -> bio [age, birthDate, birthPlace, ht, wt, bt, draftYear, club, mlbDebut]
const BIO = {
  829037: [18, '2008-01-13', 'Colon, Cuba', `6' 3"`, 184, 'L/L', null, 'Fayetteville Woodpeckers', null],
  815832: [19, '2006-10-29', 'Everett, WA, USA', `6' 3"`, 210, 'L/R', 2025, 'Asheville Tourists', null],
  828395: [23, '2003-03-19', 'Baltimore, MD, USA', `6' 1"`, 200, 'R/R', 2024, 'Corpus Christi Hooks', null],
  837522: [17, '2009-02-09', 'Samana, Dominican Republic', `6' 3"`, 190, 'S/R', null, 'DSL Astros Orange', null],
  809343: [24, '2002-02-11', 'Washington, MO, USA', `6' 3"`, 210, 'R/R', 2024, 'Sugar Land Space Cowboys', null],
  814490: [23, '2002-08-25', 'Darby, PA, USA', `6' 2"`, 195, 'R/R', 2023, 'Sugar Land Space Cowboys', null],
  703676: [22, '2004-03-15', 'Leesville, LA, USA', `6' 4"`, 225, 'R/R', 2025, 'Asheville Tourists', null],
  828599: [23, '2003-01-27', 'Chicago Heights, IL, USA', `6' 0"`, 195, 'L/L', null, 'Sugar Land Space Cowboys', '2026-07-17'],
  801075: [23, '2002-09-24', 'Portland, TX, USA', `5' 11"`, 190, 'R/R', 2024, 'Corpus Christi Hooks', null],
  813896: [24, '2002-07-01', 'Birmingham, AL, USA', `5' 10"`, 198, 'L/L', 2024, 'Corpus Christi Hooks', null],
  699044: [24, '2002-06-19', 'Puerto Plata, Dominican Republic', `6' 1"`, 205, 'R/R', null, 'Sugar Land Space Cowboys', '2026-06-29'],
  801802: [25, '2001-05-09', 'Conway, AR, USA', `6' 2"`, 190, 'R/R', 2023, 'Corpus Christi Hooks', null],
  694545: [24, '2002-02-11', 'Augusta, GA, USA', `6' 1"`, 190, 'R/R', 2023, 'Sugar Land Space Cowboys', null],
  695001: [23, '2003-05-03', 'Azua, Dominican Republic', `5' 10"`, 228, 'R/R', null, 'Sugar Land Space Cowboys', '2026-05-25'],
  805953: [20, '2005-11-02', 'Palmdale, CA, USA', `6' 0"`, 185, 'L/R', 2023, 'Asheville Tourists', null],
  813844: [22, '2004-03-04', 'Dallas, TX, USA', `6' 1"`, 235, 'L/R', 2023, 'Corpus Christi Hooks', null],
  830769: [22, '2004-02-11', 'Blue Springs, MO, USA', `6' 4"`, 195, 'R/R', 2025, 'Asheville Tourists', null],
  829860: [18, '2008-05-13', 'Puerto La Cruz, Venezuela', `5' 11"`, 170, 'R/R', null, 'DSL Astros Orange', null],
  826315: [23, '2003-06-21', 'Reading, PA, USA', `6' 4"`, 235, 'R/R', 2024, 'Corpus Christi Hooks', null],
  802959: [24, '2002-07-11', 'Clinton, IA, USA', `6' 0"`, 185, 'R/R', null, 'Corpus Christi Hooks', null],
  825479: [19, '2007-01-15', 'La Vega, Dominican Republic', `5' 10"`, 210, 'R/R', null, 'Fayetteville Woodpeckers', null],
  809789: [23, '2003-03-05', 'Houston, TX, USA', `6' 4"`, 230, 'R/R', 2024, 'Asheville Tourists', null],
  702547: [22, '2003-10-24', 'Liberal, KS, USA', `6' 2"`, 200, 'R/R', 2024, 'Asheville Tourists', null],
  805904: [26, '2000-08-04', 'Springfield, MO, USA', `6' 2"`, 190, 'L/R', 2022, 'Sugar Land Space Cowboys', '2025-09-12'],
  696280: [24, '2002-05-08', 'Marblehead, MA, USA', `6' 8"`, 245, 'L/R', 2023, 'Corpus Christi Hooks', null],
  834872: [23, '2003-07-27', 'Angola, IN, USA', `6' 3"`, 200, 'R/R', 2025, 'Fayetteville Woodpeckers', null],
  832795: [17, '2008-08-21', 'Distrito Capital, Venezuela', `5' 10"`, 165, 'R/R', null, 'DSL Astros Blue', null],
  823809: [22, '2004-01-27', 'Sugar Land, TX, USA', `6' 0"`, 192, 'R/R', 2025, 'Asheville Tourists', null],
  801573: [23, '2002-12-02', 'Poway, CA, USA', `6' 3"`, 205, 'R/R', 2024, 'Fayetteville Woodpeckers', null],
  834234: [19, '2006-09-30', 'Lewes, DE, USA', `6' 3"`, 205, 'L/R', 2025, 'FCL Astros', null],
  813865: [24, '2002-06-16', 'Kansas City, MO, USA', `6' 3"`, 211, 'R/R', 2023, 'Corpus Christi Hooks', null],
  687062: [25, '2001-02-08', 'Atlanta, GA, USA', `6' 3"`, 195, 'R/R', 2024, 'Corpus Christi Hooks', null],
  813314: [21, '2005-04-27', 'Daytona Beach, FL, USA', `5' 11"`, 197, 'L/L', 2026, 'Texas Tech (drafted)', null],
  806481: [21, '2004-09-14', 'Sioux Falls, SD, USA', `6' 5"`, 250, 'R/R', 2026, 'Notre Dame (drafted)', null],
  803544: [21, '2004-10-04', 'Tampa, FL, USA', `6' 1"`, 198, 'R/L', 2026, 'Florida State (drafted)', null],
  828801: [18, '2008-03-07', 'Macon, GA, USA', `6' 2"`, 203, 'R/R', 2026, 'First Presbyterian HS (drafted)', null],
  806494: [22, '2004-08-05', 'North Kansas City, MO, USA', `6' 1"`, 200, 'R/R', 2026, 'Missouri (drafted)', null],
};

// hitters: id -> [lvl, pa, avg, obp, slg, ops, hr, sb, bb, k, babip]
const HIT = {
  829037: ['A', 348, .280, .356, .463, .819, 9, 14, 32, 60, .320],
  815832: ['A+', 65, .250, .446, .438, .884, 2, 2, 17, 21, .400],
  828395: ['AA', 231, .258, .398, .403, .801, 6, 15, 39, 67, .368],
  837522: ['Rk', 171, .341, .503, .545, 1.048, 5, 20, 42, 33, .416],
  703676: ['A+', 273, .270, .366, .446, .812, 9, 18, 37, 80, .367],
  828599: ['AAA', 71, .246, .310, .377, .687, 1, 3, 5, 23, .350],
  801075: ['AA', 126, .239, .294, .410, .704, 5, 14, 8, 42, .329],
  813896: ['AA', 343, .221, .327, .391, .718, 11, 20, 41, 107, .305],
  805953: ['A+', 60, .278, .350, .500, .850, 3, 3, 6, 19, .375],
  813844: ['AA', 292, .252, .380, .417, .797, 10, 11, 46, 100, .386],
  829860: ['Rk', 143, .252, .406, .411, .817, 3, 19, 30, 23, .279],
  802959: ['AA', 297, .193, .323, .287, .610, 5, 20, 45, 93, .280],
  825479: ['A', 13, .364, .462, .364, .826, 0, 0, 2, 2, .444],
  702547: ['A+', 368, .287, .383, .449, .832, 12, 28, 50, 102, .384],
  805904: ['AAA', 135, .158, .252, .233, .485, 2, 4, 12, 55, .270],
  832795: ['Rk', 151, .254, .391, .443, .834, 5, 4, 21, 31, .299],
  823809: ['A+', 21, .105, .190, .105, .295, 0, 0, 2, 9, .200],
  834234: ['Rk', 160, .168, .463, .267, .730, 0, 9, 54, 47, .304],
};

// pitchers: id -> [lvl, ip, era, whip, k, bb, bf, k9, bb9, h9, hr9, kbb, strikePct]
const PIT = {
  809343: ['AA', '69.0', 2.61, 1.13, 100, 34, 279, 13.04, 4.43, 5.74, 0.91, 2.94, 64.0],
  814490: ['AAA', '70.2', 4.84, 1.32, 68, 23, 298, 8.66, 2.93, 8.92, 0.76, 2.96, 65.0],
  699044: ['AAA', '57.0', 4.89, 1.39, 78, 38, 247, 12.32, 6.00, 6.47, 1.42, 2.05, 60.0],
  801802: ['AA', '90.2', 4.96, 1.35, 78, 27, 379, 7.74, 2.68, 9.43, 1.19, 2.89, 64.0],
  694545: ['AAA', '14.2', 4.91, 1.36, 19, 8, 64, 11.66, 4.91, 7.36, 0.61, 2.38, 61.0],
  695001: ['AAA', '30.2', 1.76, 1.08, 34, 12, 125, 9.98, 3.52, 6.16, 0.29, 2.83, 63.0],
  830769: ['A', '59.2', 2.11, 1.16, 70, 32, 239, 10.56, 4.83, 5.58, 0.60, 2.19, 61.0],
  826315: ['AA', '25.0', 2.88, 1.12, 16, 15, 103, 5.76, 5.40, 4.68, 1.80, 1.07, 60.0],
  809789: ['A+', '80.2', 6.47, 1.67, 60, 31, 372, 6.69, 3.46, 11.60, 1.00, 1.94, 64.0],
  834872: ['A', '17.0', 4.24, 1.12, 19, 7, 70, 10.06, 3.71, 6.35, 1.06, 2.71, 65.0],
  801573: ['A', '15.2', 13.79, 3.13, 9, 34, 97, 5.17, 19.53, 8.62, 0.00, 0.26, 42.0],
  813865: ['AA', '22.0', 7.36, 1.64, 26, 20, 108, 10.64, 8.18, 6.55, 1.23, 1.30, 56.0],
  687062: ['AA', '35.0', 8.49, 2.11, 44, 34, 184, 11.31, 8.74, 10.29, 2.31, 1.29, 56.0],
};
// 696280 Tredwell: no 2026 game action (kept null — likely IL; live build will confirm)

const r3 = v => ('' + v.toFixed(3)).replace(/^0\./, '.');
const ip2out = v => { const n = parseFloat(v); const w = Math.floor(n); return w * 3 + Math.round((n - w) * 10); };
const pct1 = v => +(v * 100).toFixed(1);

const cache = { players: {} };
const rankings = { updated: '2026-08-05', prospects: [] };

for (const [rank, name, pos, id] of LIST) {
  rankings.prospects.push({ rank, name, pos, mlbid: id, eta: null, pipelineRank: null, article: null });
  const [age, birthDate, birthPlace, ht, wt, bt, draftYear, club, mlbDebut] = BIO[id];
  const rec = {
    id, name, pos, age, birthDate, birthPlace, ht, wt, bt, draftYear,
    club, il: null, mlbDebut, graduated: false, draft: DRAFT[id] || null,
    lvl: null, kind: /HP$|^P$/.test(pos) ? 'P' : 'H',
    line: null, pa: null, ip: null, thin: false,
    v: null, p: null, comp: null, agg: null, score: null, poolN: null,
  };
  if (HIT[id]) {
    const [lvl, pa, avg, obp, slg, ops, hr, sb, bb, k, babip] = HIT[id];
    rec.lvl = lvl; rec.kind = 'H'; rec.pa = pa;
    rec.line = `${r3(avg)} AVG · ${r3(ops)} OPS · ${hr} HR · ${sb} SB`;
    rec.thin = pa >= 15 && pa < 50;
    rec.v = {
      ops, obp, slg, avg, iso: +(slg - avg).toFixed(3),
      hrRate: pct1(hr / pa), bbpct: pct1(bb / pa), kpct: pct1(k / pa), sb, babip,
    };
  } else if (PIT[id]) {
    const [lvl, ip, era, whip, k, bb, bf, k9, bb9, h9, hr9, kbb, strikePct] = PIT[id];
    rec.lvl = lvl; rec.kind = 'P'; rec.ip = ip;
    rec.line = `${era.toFixed(2)} ERA · ${whip.toFixed(2)} WHIP · ${k} K · ${ip} IP`;
    const outs = ip2out(ip);
    rec.thin = outs >= 5 * 3 && outs < 20 * 3;
    rec.v = { era, whip, k9, bb9, h9, hr9, kbb, kpct: pct1(k / bf), bbpct: pct1(bb / bf), strikePct };
  }
  cache.players[id] = rec;
}

fs.writeFileSync(path.join(__dirname, 'rankings.json'), JSON.stringify(rankings, null, 2));
fs.writeFileSync(path.join(__dirname, 'cache.json'), JSON.stringify(cache));
console.log('seed written:', rankings.prospects.length, 'players');
