// Safe to Spend: how much can I still spend this cycle without touching bills, goals or tax money?
import type { NexusData, DateStr, Bill } from '../types.js';
import { type Satang, sum } from '../money.js';
import { cycleFor, daysBetween, inRange, occurrencesIn, type DateRange } from '../dates.js';
import { accountBalances, live } from './ledger.js';

export interface UpcomingBill { billId: string; name: string; amount: Satang; due: DateStr; paid: boolean }

export function billsInCycle(bills: Bill[], data: Pick<NexusData, 'transactions'>, cycle: DateRange): UpcomingBill[] {
  const paidIds = new Set(live(data.transactions).filter(t => t.billId && inRange(t.date, cycle)).map(t => t.billId));
  const out: UpcomingBill[] = [];
  for (const b of bills) {
    if (!b.active) continue;
    const dates = occurrencesIn(cycle, b.dueDay, b.cadence === 'yearly' ? b.dueMonth : undefined);
    for (const due of dates) if (!b.startDate || due >= b.startDate) out.push({ billId: b.id, name: b.name, amount: b.amount, due, paid: paidIds.has(b.id) });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

export interface SafeToSpendResult {
  asOf: DateStr;
  cycle: DateRange;
  daysLeft: number;                 // including today
  available: Satang;                // spendable accounts only
  reserved: { bills: Satang; goals: Satang; tax: Satang; total: Satang };
  safeToSpend: Satang;              // floored at 0
  perDay: Satang;                   // rounded down to whole baht
  shortfall: Satang;                // > 0 means reserved money exceeds what you have
  unpaidBills: UpcomingBill[];
}

export function calculateSafeToSpend(data: NexusData, asOf: DateStr): SafeToSpendResult {
  const cycle = cycleFor(asOf, data.settings.cycleStartDay);
  const bal = accountBalances(data.accounts, data.transactions, asOf);
  const available = sum(data.accounts.filter(a => a.spendable && !a.archived).map(a => bal.get(a.id) ?? 0));

  const unpaidBills = billsInCycle(data.bills, data, cycle).filter(b => !b.paid);
  const bills = sum(unpaidBills.map(b => b.amount));

  const cycleTx = live(data.transactions).filter(t => inRange(t.date, cycle));
  const goals = sum(data.goals.filter(g => !g.archived).map(g => {
    const put = sum(cycleTx.filter(t => t.goalId === g.id).map(t => t.amount));
    return Math.max(0, g.monthlyContribution - put);
  }));

  const tax = data.settings.monthlyTaxReserve;
  const total = bills + goals + tax;
  const raw = available - total;
  const daysLeft = Math.max(1, daysBetween(asOf, cycle.to));
  const safeToSpend = Math.max(0, raw);
  return {
    asOf, cycle, daysLeft, available,
    reserved: { bills, goals, tax, total },
    safeToSpend,
    perDay: Math.floor(safeToSpend / daysLeft / 100) * 100, // whole baht
    shortfall: Math.max(0, -raw),
    unpaidBills,
  };
}
