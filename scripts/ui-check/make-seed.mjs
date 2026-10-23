// Sample budget for the UI checks (Sep and Oct 2026). Regenerate with:
//   node scripts/ui-check/make-seed.mjs scripts/ui-check/sample-backup.json
import { writeFileSync } from 'node:fs';
const day = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00.000Z`;
const B = (id, name, color, order, fixed, extra = {}) => ({ id, name, color, order, isDefault: true, allocationType: 'fixed', fixedAmount: fixed, percentageAmount: 0, isSavings: false, isEveryday: true, createdAt: '2026-09-01T00:00:00.000Z', ...extra });
const buckets = [
  B('rent', 'Rent/Mortgage', '#6366f1', 0, 180000, { isEveryday: false }),
  B('util', 'Utilities', '#8b5cf6', 1, 15000, { isEveryday: false }),
  B('groc', 'Grocery', '#10b981', 2, 50000),
  B('trans', 'Transportation', '#f59e0b', 3, 20000),
  B('dine', 'Dining Out', '#ef4444', 4, 30000),
  B('ent', 'Entertainment', '#ec4899', 5, 15000),
  B('subs', 'Subscriptions', '#06b6d4', 6, 6000, { isEveryday: false }),
  B('save', 'Savings', '#22c55e', 7, 40000, { isSavings: true, isEveryday: false }),
  B('inv', 'Investments', '#3b82f6', 8, 30000, { isSavings: true, isEveryday: false }),
  B('emer', 'Emergency Fund', '#f97316', 9, 20000, { isSavings: true, isEveryday: false }),
  B('misc', 'Misc', '#6b7280', 10, 10000),
];
let n = 0;
const T = (m, d, bucketId, amount, note) => ({ id: `t${++n}`, amount, bucketId, date: day(m, d), note, createdAt: Date.parse(day(m, d)) + n * 60000 });
const spend = (m, lastDay) => {
  const rows = [
    [1, 'rent', 180000, 'Rent'], [3, 'util', 6420, 'PG&E'], [9, 'util', 5500, 'Comcast'],
    [2, 'groc', 8634, 'Trader Joe’s'], [8, 'groc', 12410, 'Whole Foods'], [14, 'groc', 6327, 'Safeway'], [20, 'groc', 9105, 'Trader Joe’s'],
    [4, 'trans', 4500, 'Clipper card'], [11, 'trans', 2318, 'Uber'], [18, 'trans', 5210, 'Shell'],
    [5, 'dine', 1845, 'Blue Bottle Coffee'], [7, 'dine', 6240, 'Nopa'], [12, 'dine', 2275, 'Tartine'], [16, 'dine', 4890, 'Burma Superstar'], [21, 'dine', 645, 'Starbucks'],
    [6, 'ent', 3200, 'AMC Metreon'], [17, 'ent', 5999, 'Steam'],
    [15, 'subs', 1549, 'Netflix'], [15, 'subs', 1199, 'Spotify'],
    [1, 'save', 40000, 'Monthly transfer'], [1, 'inv', 30000, 'VTI buy'], [1, 'emer', 20000, 'Top-up'],
    [10, 'misc', 2899, 'Target'], [19, 'misc', 1500, 'Haircut tip'],
  ];
  return rows.filter(([d]) => d <= lastDay).map(([d, b, a, note]) => T(m, d, b, m === 9 ? Math.round(a * 1.04) : a, note));
};
const transactions = [...spend(9, 30), ...spend(10, 22)];
const allocations = Object.fromEntries(buckets.map((b) => [b.id, b.fixedAmount]));
const data = {
  version: 1,
  exportedAt: '2026-10-23T08:00:00.000Z',
  data: {
    buckets,
    transactions,
    recurringTransactions: [
      { id: 'r1', amount: 180000, bucketId: 'rent', frequency: 'monthly', dayOfMonth: 1, nextDueDate: day(11, 1), note: 'Rent', isActive: true },
      { id: 'r2', amount: 3500, bucketId: 'ent', frequency: 'monthly', dayOfMonth: 25, nextDueDate: day(10, 25), note: 'Gym', isActive: true },
      { id: 'r3', amount: 1549, bucketId: 'subs', frequency: 'monthly', dayOfMonth: 27, nextDueDate: day(10, 27), note: 'Netflix', isActive: true },
    ],
    incomes: [
      { id: 'i1', amount: 520000, date: day(9, 1), note: 'Salary', isRecurring: true, type: 'fixed' },
      { id: 'i2', amount: 50000, date: day(9, 15), note: 'Bonus', isRecurring: false, type: 'one-time' },
      { id: 'i3', amount: 520000, date: day(10, 1), note: 'Salary', isRecurring: true, type: 'fixed' },
    ],
    monthSnapshots: [
      { month: '2026-09', incomeTotal: 0, allocations, spent: {}, rollovers: {} },
      { month: '2026-10', incomeTotal: 0, allocations, spent: {}, rollovers: {}, notes: [{ id: 'n1', text: 'Friend’s wedding weekend', effect: 'down', createdAt: Date.parse(day(10, 12)) }] },
    ],
    savingsGoals: [{ id: 'g1', name: 'Emergency fund', bucketId: 'emer', targetAmount: 1000000, targetDate: day(6, 30).replace('2026', '2027'), createdAt: day(1, 1), startingBalance: 380000 }],
    investmentLots: [{ id: 'l1', symbol: 'VTI', shares: 10, pricePerShare: 25000, purchaseDate: day(3, 10), note: 'First lot', soldShares: 0 }],
    investmentSells: [],
    investmentPrices: [{ symbol: 'VTI', pricePerShare: 27350, updatedAt: day(10, 20) }],
    settings: { baseCurrency: 'USD', currencyConfirmed: true },
  },
};
writeFileSync(process.argv[2], JSON.stringify(data, null, 2));
console.log('transactions', transactions.length);
