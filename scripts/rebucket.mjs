// One-off migration over an exported backup (Setup -> Export JSON).
// Usage: node scripts/rebucket.mjs <backup.json> <out.json>
// Reads the backup, restructures buckets, re-labels transactions, and
// writes a NEW file to re-import via Setup -> Import. The input is never
// modified (the output is created exclusively, never overwritten).
// Transactions are only ever moved between buckets; the script
// aborts if any transaction's id, amount, date or note would change, or
// if the count differs.
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath || inPath === outPath) {
  console.error('usage: node scripts/rebucket.mjs <backup.json> <out.json>');
  process.exit(1);
}

const backup = JSON.parse(readFileSync(inPath, 'utf8'));
const data = backup.data;
const fail = (msg) => { console.error('ABORT:', msg); process.exit(1); };

// New allocations apply from this month on; past months keep the
// per-month amounts already saved in monthSnapshots.
const FROM_MONTH_ISO = '2026-10-01T12:00:00.000Z';

const byName = (n) => data.buckets.find((b) => b.name === n);
const need = (n) => byName(n) ?? fail(`bucket "${n}" not found (already migrated?)`);

// Months before FROM_MONTH keep exactly the allocations they have today.
// monthlyLedger spans every month from the first activity to now,
// including quiet months and months that never got a snapshot; those fall
// back to each bucket's *current default*, so changing a default would
// silently rewrite them. Pin the old default explicitly for every such
// month before touching anything.
const monthOf = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
const FROM_MONTH = monthOf(FROM_MONTH_ISO);
const seen = [
  ...data.monthSnapshots.map((s) => s.month),
  ...data.incomes.map((i) => monthOf(i.date)),
  ...data.transactions.map((t) => monthOf(t.date)),
].filter((m) => m < FROM_MONTH);
const pastMonths = [];
if (seen.length > 0) {
  for (let m = seen.reduce((a, b) => (a < b ? a : b)); m < FROM_MONTH; m = nextMonth(m)) pastMonths.push(m);
}
const snapshotFor = (month) => {
  let snap = data.monthSnapshots.find((s) => s.month === month);
  if (!snap) {
    snap = { month, incomeTotal: 0, allocations: {}, spent: {}, rollovers: {} };
    data.monthSnapshots.push(snap);
  }
  snap.allocations ??= {};
  return snap;
};
for (const month of pastMonths) {
  const snap = snapshotFor(month);
  for (const b of data.buckets) {
    if (b.allocationType === 'fixed' && snap.allocations[b.id] === undefined) {
      snap.allocations[b.id] = b.fixedAmount ?? 0;
    }
  }
}

const before = data.transactions.map((t) => ({ ...t }));

// Renames + new default amounts (cents), effective from FROM_MONTH.
const edits = [
  ['Rent/Mortgage', 'Rent', 200000],
  ['Utilities', 'Utilities', 15000],
  ['Grocery', 'Groceries', 25000],
  ['Dining Out', 'Eating Out', 30000],
  ['Transportation', 'Transportation', 13000],
  ['Subscriptions', 'Subscriptions', 7000],
  ['Entertainment', 'Fun', 15000],
  ['Misc', 'Misc', 5000],
];
for (const [from, to, cents] of edits) {
  const b = need(from);
  b.name = to;
  b.fixedAmount = cents;
}

const newBuckets = [
  { name: 'Home & Shopping', color: '#afb42b', fixedAmount: 10000, isSavings: false, isEveryday: true },
  { name: 'Personal Care', color: '#9c27b0', fixedAmount: 4000, isSavings: false, isEveryday: true },
  { name: 'Life Admin', color: '#795548', fixedAmount: 15000, isSavings: false, isEveryday: false },
  // Money moved between your own accounts, not budget spending: its history
  // must not carry as a debt (pinHistory: false), unlike the real spending
  // buckets above.
  { name: 'One-time Transfers', color: '#b0bec5', fixedAmount: 0, isSavings: true, isEveryday: false, pinHistory: false },
];
for (const { pinHistory: _pin, ...nb } of newBuckets) {
  data.buckets.push({
    ...nb, id: crypto.randomUUID(), order: 0, isDefault: false,
    allocationType: 'fixed', percentageAmount: 0, createdAt: FROM_MONTH_ISO,
  });
}
const id = (n) => byName(n)?.id ?? fail(`missing ${n}`);

// Refiled expenses must keep counting against *something* in every past
// month. A bucket created in October is otherwise skipped for earlier
// months, so the spend would vanish from rollover. A pinned zero makes
// each of those months count for it: no plan then, so the spend carries
// forward as a balance to work down.
for (const nb of newBuckets.filter((b) => b.pinHistory !== false)) {
  for (const month of pastMonths) snapshotFor(month).allocations[id(nb.name)] = 0;
}

// Move rules: [from bucket, predicate on transaction, to bucket]
const note = (t) => (t.note ?? '').toLowerCase();
const has = (...w) => (t) => w.some((x) => note(t).includes(x));
const moves = [
  ['Misc', has('dandies', 'haircut', 'decim'), 'Personal Care'],
  ['Misc', has('gas', 'enterprise', 'caltrain'), 'Transportation'],
  ['Misc', has('uscis', 'zillow', 'vittoria', 'u-haul'), 'Life Admin'],
  ['Misc', has('amazon', 'home depot', 'goodwill', 'h&m'), 'Home & Shopping'],
  ['Misc', has('hinge'), 'Subscriptions'],
  ['Misc', has('ps game', 'concert'), 'Fun'],
  ['Fun', has('h&m', 'uniqlo'), 'Home & Shopping'],
  ['Utilities', has('t-mobile'), 'Subscriptions'],
  // June 2026 stock-portfolio top-up from savings (one-off lumps).
  ['Investments', (t) => t.amount >= 400000 && t.date.startsWith('2026-06'), 'One-time Transfers'],
];
const moved = [];
for (const [from, pred, to] of moves) {
  for (const t of data.transactions) {
    if (t.bucketId === id(from) && pred(t)) {
      t.bucketId = id(to);
      moved.push([t.date.slice(0, 10), (t.amount / 100).toFixed(2), t.note ?? '', from, to]);
    }
  }
}

// Remove the unused Savings bucket only if nothing references it.
const sav = need('Savings');
if (data.transactions.some((t) => t.bucketId === sav.id)) fail('Savings has transactions');
if (data.recurringTransactions.some((r) => r.bucketId === sav.id)) fail('Savings has recurring items');
if (data.savingsGoals.some((g) => g.bucketId === sav.id)) fail('Savings has a goal');
data.buckets = data.buckets.filter((b) => b.id !== sav.id);
for (const s of data.monthSnapshots) delete s.allocations?.[sav.id];

const order = ['Rent', 'Utilities', 'Groceries', 'Eating Out', 'Transportation', 'Subscriptions', 'Fun',
  'Home & Shopping', 'Personal Care', 'Life Admin', 'Investments', 'Emergency Fund', 'Misc', 'One-time Transfers'];
for (const b of data.buckets) {
  const i = order.indexOf(b.name);
  if (i < 0) fail(`unexpected bucket ${b.name}`);
  b.order = i;
}
data.buckets.sort((a, b) => a.order - b.order);

// Safety: transactions may only change bucketId.
const live = new Set(data.buckets.map((b) => b.id));
if (before.length !== data.transactions.length) fail('transaction count changed');
for (let i = 0; i < before.length; i++) {
  const { bucketId: _a, ...x } = before[i];
  const { bucketId: bid, ...y } = data.transactions[i];
  if (JSON.stringify(x) !== JSON.stringify(y)) fail(`transaction ${before[i].id} changed beyond its bucket`);
  if (!live.has(bid)) fail(`transaction ${before[i].id} points at a missing bucket`);
}

// 'wx' creates the file exclusively: it refuses an existing path, so the
// source can never be overwritten, however it is spelled (relative path,
// symlink, hard link).
try {
  writeFileSync(outPath, JSON.stringify(backup, null, 2), { flag: 'wx' });
} catch (e) {
  if (e.code === 'EEXIST') fail(`${outPath} already exists; choose a new output path`);
  throw e;
}
console.log(`${data.transactions.length} transactions, ${moved.length} moved, 0 deleted`);
for (const m of moved) console.log(m.join(' | '));
