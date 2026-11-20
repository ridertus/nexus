import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressiveTax, rulesFor, computeTax } from '../src/engines/tax.js';
import { parseBaht, formatBaht } from '../src/money.js';
import { cycleFor, occurrencesIn } from '../src/dates.js';
import { NexusService } from '../src/service.js';
import { MemoryStore } from '../src/store.js';

const B = (n: number) => n * 100;

test('money parsing/formatting', () => {
  assert.equal(parseBaht('1,234.5'), 123450);
  assert.equal(parseBaht('฿60'), 6000);
  assert.equal(parseBaht(59.99), 5999);
  assert.throws(() => parseBaht('1.234'));
  assert.equal(formatBaht(1842000), '฿18,420');
  assert.equal(formatBaht(-5050), '-฿50.50');
});

test('Thai PIT progressive table — golden values', () => {
  const br = rulesFor(2026).brackets;
  // net income → tax (hand-checked against the RD table)
  const cases: [number, number][] = [
    [150_000, 0], [200_000, 2_500], [300_000, 7_500], [320_000, 9_500],
    [440_000, 21_500], [560_000, 36_500], [800_000, 75_000], [1_040_000, 125_000],
    [2_500_000, 115_000 + 250_000 + 150_000], [6_000_000, 115_000 + 250_000 + 900_000 + 350_000],
  ];
  for (const [net, tax] of cases) assert.equal(progressiveTax(B(net), br).tax, B(tax), `net ${net}`);
});

test('salary: 50% expense capped at 100k, personal allowance 60k', () => {
  const r = computeTax({ gross: { '40(1)': B(360_000), '40(2)': 0, '40(8)': 0 }, allowances: 0, section408DeductionRate: 0.6 }, rulesFor(2026));
  assert.equal(r.salaryExpense, B(100_000));
  assert.equal(r.netIncome, B(200_000));
  assert.equal(r.tax, B(2_500));
});

test('0.5% minimum tax kicks in for large non-salary gross with small net', () => {
  // 40(8) 2,000,000 with 60% deduction & big allowances → small progressive tax, but 0.5% = 10,000
  const r = computeTax({ gross: { '40(1)': 0, '40(2)': 0, '40(8)': B(2_000_000) }, allowances: B(600_000), section408DeductionRate: 0.6 }, rulesFor(2026));
  assert.equal(r.netIncome, B(140_000));
  assert.equal(r.progressiveTax, 0);
  assert.equal(r.tax, B(10_000));
  assert.equal(r.method, 'alt_min_0.5pct');
});

test('pay cycle boundaries', () => {
  assert.deepEqual(cycleFor('2026-11-20', 1), { from: '2026-11-01', to: '2026-12-01' });
  assert.deepEqual(cycleFor('2026-11-20', 25), { from: '2026-10-25', to: '2026-11-25' });
  assert.deepEqual(cycleFor('2026-11-25', 25), { from: '2026-11-25', to: '2026-12-25' });
  assert.deepEqual(occurrencesIn({ from: '2026-02-01', to: '2026-03-01' }, 31), ['2026-02-28']);
});

function setup(today = '2026-11-20') {
  const svc = new NexusService(new MemoryStore(), () => today);
  svc.updateAccount('acc_bank', { openingBalance: B(20_000) });
  return svc;
}

test('safe to spend reserves unpaid bills, goal contributions and tax', () => {
  const svc = setup();
  const rent = svc.addBill({ name: 'ค่าห้อง', amount: B(4_500), categoryId: 'cat_home', accountId: 'acc_bank', cadence: 'monthly', dueDay: 28, isSubscription: false });
  svc.addBill({ name: 'Netflix', amount: B(419), categoryId: 'cat_subs', accountId: 'acc_bank', cadence: 'monthly', dueDay: 5, isSubscription: true, startDate: '2026-11-01' }); // tracked since Nov 1, 5th passed unpaid → still reserved
  const g = svc.addGoal({ name: 'Emergency', target: B(150_000), monthlyContribution: B(3_000) });
  svc.updateSettings({ monthlyTaxReserve: B(500) });
  svc.addTransaction({ type: 'expense', amount: B(60), accountId: 'acc_bank', categoryId: 'cat_food', note: 'ข้าวมันไก่' });

  let s = svc.getSafeToSpend();
  assert.equal(s.available, B(19_940));
  assert.equal(s.reserved.bills, B(4_919));
  assert.equal(s.reserved.goals, B(3_000));
  assert.equal(s.safeToSpend, B(19_940 - 4_919 - 3_000 - 500));
  assert.equal(s.daysLeft, 11);

  // paying rent and contributing to the goal releases the reservations, balance math stays consistent
  svc.payBill(rent.id);
  svc.contributeToGoal(g.id, B(1_000), 'acc_bank');
  s = svc.getSafeToSpend();
  assert.equal(s.available, B(19_940 - 4_500 - 1_000));
  assert.equal(s.reserved.bills, B(419));
  assert.equal(s.reserved.goals, B(2_000));
  assert.equal(s.safeToSpend, B(19_940 - 4_919 - 3_000 - 500)); // unchanged: money just moved from "reserved" to "spent/saved"
  assert.equal(svc.getGoals()[0]!.saved, B(1_000));
});

test('a new bill does not show past occurrences as overdue', () => {
  const svc = setup('2026-11-20');
  svc.updateSettings({ cycleStartDay: 25 });          // cycle 2026-10-25 → 2026-11-25
  svc.addBill({ name: 'rent', amount: B(4_500), categoryId: 'cat_home', accountId: 'acc_bank', cadence: 'monthly', dueDay: 28, isSubscription: false });
  assert.equal(svc.getSafeToSpend().reserved.bills, 0); // Oct 28 was before tracking started
  const older = setup('2026-11-20');
  older.updateSettings({ cycleStartDay: 25 });
  older.addBill({ name: 'rent', amount: B(4_500), categoryId: 'cat_home', accountId: 'acc_bank', cadence: 'monthly', dueDay: 28, isSubscription: false, startDate: '2026-01-01' });
  assert.equal(older.getSafeToSpend().reserved.bills, B(4_500));
});

test('shortfall is reported instead of a negative safe-to-spend', () => {
  const svc = setup();
  svc.addBill({ name: 'big', amount: B(25_000), categoryId: 'cat_home', accountId: 'acc_bank', cadence: 'monthly', dueDay: 30, isSubscription: false });
  const s = svc.getSafeToSpend();
  assert.equal(s.safeToSpend, 0);
  assert.equal(s.shortfall, B(5_000));
});

test('budgets track spending per category this cycle', () => {
  const svc = setup();
  svc.setPlans({ cat_food: B(6_000) });
  svc.addTransaction({ type: 'expense', amount: B(4_000), accountId: 'acc_bank', categoryId: 'cat_food', date: '2026-11-03' });
  svc.addTransaction({ type: 'expense', amount: B(3_000), accountId: 'acc_bank', categoryId: 'cat_food', date: '2026-10-30' }); // last cycle
  svc.addTransaction({ type: 'expense', amount: B(2_500), accountId: 'acc_bank', categoryId: 'cat_food', date: '2026-11-19' });
  const line = svc.getBudgets().lines[0]!;
  assert.equal(line.spent, B(6_500));
  assert.equal(line.over, true);
});

test('validation rejects bad input', () => {
  const svc = setup();
  assert.throws(() => svc.addTransaction({ type: 'expense', amount: -5, accountId: 'acc_bank', categoryId: 'cat_food' }));
  assert.throws(() => svc.addTransaction({ type: 'expense', amount: 1.5, accountId: 'acc_bank', categoryId: 'cat_food' }));
  assert.throws(() => svc.addTransaction({ type: 'expense', amount: 100, accountId: 'acc_bank', categoryId: 'cat_salary' }), /is income/);
  assert.throws(() => svc.addTransaction({ type: 'transfer', amount: 100, accountId: 'acc_bank', toAccountId: 'acc_bank' }));
  assert.throws(() => svc.addTransaction({ type: 'expense', amount: 100, accountId: 'acc_bank', categoryId: 'cat_food', date: '2026-02-30' }));
});

test('void keeps the record but removes it from balances', () => {
  const svc = setup();
  const t = svc.addTransaction({ type: 'expense', amount: B(100), accountId: 'acc_bank', categoryId: 'cat_food' });
  svc.voidTransaction(t.id, 'typo');
  assert.equal(svc.getAccounts().find(a => a.id === 'acc_bank')!.balance, B(20_000));
  assert.equal(svc.getTransactions({ includeVoided: true }).length, 1);
  assert.equal(svc.getTransactions().length, 0);
  svc.unvoidTransaction(t.id);
  assert.equal(svc.getTransactions().length, 1);
  assert.equal(svc.getTransactions()[0]!.note, undefined);
});

test('replaceAll restores a backup and rejects junk', () => {
  const a = setup();
  a.addTransaction({ type: 'expense', amount: B(1), accountId: 'acc_bank', categoryId: 'cat_food' });
  const b = new NexusService(new MemoryStore(), () => '2026-11-20');
  b.replaceAll(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(b.getTransactions().length, 1);
  assert.throws(() => b.replaceAll({ schemaVersion: 1, hello: 1 }), /Not a NEXUS backup/);
  assert.equal(b.getTransactions().length, 1);
});

test('tax estimate from ledger with withholding and projection', () => {
  const svc = setup('2026-06-15');
  for (let m = 1; m <= 6; m++) {
    svc.addTransaction({ type: 'income', amount: B(30_000), accountId: 'acc_bank', categoryId: 'cat_salary', date: `2026-0${m}-01`, withheld: B(200) });
  }
  const { actual, projected } = svc.getTax(2026);
  assert.equal(actual.totalGross, B(180_000));
  assert.equal(actual.withheld, B(1_200));
  assert.equal(projected.totalGross, B(360_000));
  assert.equal(projected.tax, B(2_500));
  assert.equal(projected.remaining, B(2_500 - 2_400));
});

test('projection does not invent income before tracking started', () => {
  const svc = setup('2026-11-20');
  svc.addTransaction({ type: 'income', amount: B(30_000), accountId: 'acc_bank', categoryId: 'cat_salary', date: '2026-11-01' });
  const { projected } = svc.getTax(2026);
  assert.equal(projected.totalGross, B(60_000)); // Nov actual + Dec at the same rate
});

test('runway: days the money lasts at the real spending rate', () => {
  const svc = setup('2026-11-20');                 // bank ฿20,000
  svc.updateAccount('acc_savings', { openingBalance: B(10_000) });
  assert.equal(svc.getRunway().days, null);        // nothing spent yet
  for (let d = 11; d <= 20; d++) svc.addTransaction({ type: 'expense', amount: B(200), accountId: 'acc_bank', categoryId: 'cat_food', date: `2026-11-${d}` });
  svc.addTransaction({ type: 'income', amount: B(3_000), accountId: 'acc_bank', categoryId: 'cat_other_in', date: '2026-11-15' });
  const bill = svc.addBill({ name: 'sub', amount: B(608.75), categoryId: 'cat_subs', accountId: 'acc_bank', cadence: 'monthly', dueDay: 1, isSubscription: true }); // ≈ ฿20/day
  svc.payBill(bill.id, { date: '2026-11-20' });     // bill payments are not double-counted as everyday spending
  const r = svc.getRunway();
  assert.equal(r.daysObserved, 10);
  assert.equal(r.lowData, true);
  assert.equal(r.flexiblePerDay, B(200));
  assert.equal(r.billsPerDay, B(20));
  assert.equal(r.spendable, B(20_000 - 2_000 + 3_000 - 608.75));
  assert.equal(r.days, Math.floor(B(20_391.25) / B(220)));   // 92
  assert.equal(r.daysWithSavings, Math.floor(B(30_391.25) / B(220)));
  assert.equal(r.runOutDate, '2027-02-20');
  assert.equal(r.incomeInWindow, B(3_000));
});
