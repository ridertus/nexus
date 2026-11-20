// Runway: with no regular income, how many days will the money I have last at my real spending rate?
import type { NexusData, DateStr } from '../types.js';
import { type Satang, sum } from '../money.js';
import { daysBetween, parseDate } from '../dates.js';
import { accountBalances, live } from './ledger.js';

export interface RunwayResult {
  asOf: DateStr;
  spendable: Satang;              // spendable accounts
  withSavings: Satang;            // + non-spendable (savings) accounts
  daysObserved: number;           // how many days of history the average is based on
  lowData: boolean;               // < 14 days observed — the number is rough
  flexiblePerDay: Satang;         // everyday spending (not bills, not goal transfers), averaged
  billsPerDay: Satang;            // active bills as a daily amount
  burnPerDay: Satang;             // flexible + bills
  days: number | null;            // spendable ÷ burn (null = no spending yet)
  daysWithSavings: number | null;
  runOutDate: DateStr | null;
  incomeInWindow: Satang;         // money received in the window (e.g. transfers from family)
  window: number;
}

const addDays = (d: DateStr, n: number) => { const p = parseDate(d); return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10); };

export function calculateRunway(data: NexusData, asOf: DateStr, window = 30): RunwayResult {
  const bal = accountBalances(data.accounts, data.transactions, asOf);
  const active = data.accounts.filter(a => !a.archived);
  const spendable = sum(active.filter(a => a.spendable).map(a => bal.get(a.id) ?? 0));
  const withSavings = sum(active.map(a => bal.get(a.id) ?? 0));

  const from = addDays(asOf, -(window - 1));
  const txs = live(data.transactions).filter(t => t.date <= asOf);
  const first = txs.reduce<DateStr | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  const start = first && first > from ? first : from;
  const daysObserved = first ? Math.max(1, daysBetween(start, asOf) + 1) : 0;
  const inWin = txs.filter(t => t.date >= start);

  const flexible = sum(inWin.filter(t => t.type === 'expense' && !t.billId && !t.goalId).map(t => t.amount));
  const incomeInWindow = sum(inWin.filter(t => t.type === 'income').map(t => t.amount));
  const flexiblePerDay = daysObserved ? Math.round(flexible / daysObserved) : 0;
  const monthlyBills = sum(data.bills.filter(b => b.active).map(b => (b.cadence === 'yearly' ? b.amount / 12 : b.amount)));
  const billsPerDay = Math.round(monthlyBills / 30.4375);
  const burnPerDay = flexiblePerDay + billsPerDay;

  const days = burnPerDay > 0 ? Math.max(0, Math.floor(spendable / burnPerDay)) : null;
  const daysWithSavings = burnPerDay > 0 ? Math.max(0, Math.floor(withSavings / burnPerDay)) : null;
  return {
    asOf, spendable, withSavings, daysObserved, lowData: daysObserved < 14,
    flexiblePerDay, billsPerDay, burnPerDay, days, daysWithSavings,
    runOutDate: days === null ? null : addDays(asOf, days),
    incomeInWindow, window,
  };
}
