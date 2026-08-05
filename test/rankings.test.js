// Sheet CSV parsing: quoted fields, HM rows, column detection, refusal guard.
const assert = require('assert');
const { parseCSV, fromRows } = require('../src/rankings');

const csv = [
  'Rank,Player,Position,MLB ID,ETA,Pipeline Rank,Report Link',
  '1,Kevin Alvarez,OF,829037,2028,1,https://astrosfuture.com/kevin-alvarez',
  '2,"Neyens, Xavier",3B,815832,2028,2,',
  '3,Jason Schiavone,C,,2027,,',
  ...Array.from({ length: 27 }, (_, i) => `${i + 4},Player ${i + 4},RHP,${700000 + i},,,`),
  'HM,Hudson Leach,RHP,813865,,,',
  ',Ramsey David,RHP,687062,,,',
].join('\n');

const rows = parseCSV(csv);
assert.strictEqual(rows.length, 33);
assert.strictEqual(rows[2][1], 'Neyens, Xavier', 'quoted comma survives');

const data = fromRows(rows);
const ranked = data.prospects.filter(p => p.rank != null);
const hm = data.prospects.filter(p => p.rank == null);
assert.strictEqual(ranked.length, 30);
assert.strictEqual(hm.length, 2, 'HM and blank-rank rows both become honorable mentions');
assert.strictEqual(ranked[0].mlbid, 829037);
assert.strictEqual(ranked[0].pipelineRank, 1);
assert.strictEqual(ranked[0].article, 'https://astrosfuture.com/kevin-alvarez');
assert.strictEqual(ranked[2].mlbid, null, 'blank MLB ID -> null (resolved later by search)');

// A near-empty sheet must throw rather than publish a wiped list.
assert.throws(() => fromRows(parseCSV('Rank,Player\n1,Solo Guy')), /only 1 ranked/);

console.log('rankings.test: OK');
