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

// --- editing the sheet the way a human actually does ---
const sheet = rows => fromRows(parseCSV(['Rank,Player,Position,MLB ID,ETA,Pipeline Rank,Report Link', ...rows].join('\n')));
const line = (r, n, id) => `${r},${n},OF,${id},,,`;

// Slotting someone in as 14.5 must land him between 14 and 15, and everything renumbers.
{
  const d = sheet([...Array.from({ length: 20 }, (_, i) => line(i + 1, 'P' + (i + 1), 800000 + i)),
    line('14.5', 'Newcomer', 899999)]);
  const order = d.prospects.filter(p => p.rank != null).map(p => p.name);
  assert.strictEqual(order[14], 'Newcomer', 'decimal rank slots in at the right spot');
  assert.strictEqual(order[13], 'P14'); assert.strictEqual(order[15], 'P15');
  const ranks = d.prospects.filter(p => p.rank != null).map(p => p.rank);
  assert.deepStrictEqual(ranks, Array.from({ length: 21 }, (_, i) => i + 1), 'renumbered 1..N with no gaps');
}

// Gaps left behind after deleting rows must not leave holes in the published ranks.
{
  const d = sheet([1, 2, 5, 9, 12, 14, 20, 23, 27, 30].map((r, i) => line(r, 'G' + r, 810000 + i)));
  const ranks = d.prospects.filter(p => p.rank != null).map(p => p.rank);
  assert.deepStrictEqual(ranks, [1,2,3,4,5,6,7,8,9,10], 'gaps close up');
  assert.strictEqual(d.prospects[0].name, 'G1', 'order preserved');
}

// Two players accidentally given the same number: keep both, in sheet order.
{
  const d = sheet([line(1, 'A', 820001), line(2, 'B', 820002), line(2, 'C', 820003),
    ...Array.from({ length: 8 }, (_, i) => line(i + 3, 'D' + i, 820010 + i))]);
  const names = d.prospects.filter(p => p.rank != null).map(p => p.name);
  assert.deepStrictEqual(names.slice(0, 3), ['A', 'B', 'C'], 'ties keep sheet order, nobody dropped');
}


console.log('rankings.test: OK');
