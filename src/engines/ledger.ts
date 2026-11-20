// Pure ledger math: balances and filtering. No I/O.
import type { Account, Transaction, ID } from '../types.js';
import type { Satang } from '../money.js';
import { type DateRange, inRange } from '../dates.js';

export const live = (txs: Transaction[]) => txs.filter(t => !t.voided);

export function accountBalances(accounts: Account[], txs: Transaction[], asOf?: string): Map<ID, Satang> {
  const bal = new Map<ID, Satang>(accounts.map(a => [a.id, a.openingBalance]));
  for (const t of live(txs)) {
    if (asOf && t.date > asOf) continue;
    const add = (id: ID, v: Satang) => bal.set(id, (bal.get(id) ?? 0) + v);
    if (t.type === 'income') add(t.accountId, t.amount);
    else if (t.type === 'expense') add(t.accountId, -t.amount);
    else { add(t.accountId, -t.amount); if (t.toAccountId) add(t.toAccountId, t.amount); }
  }
  return bal;
}

export function totals(txs: Transaction[], r: DateRange): { income: Satang; expense: Satang } {
  let income = 0, expense = 0;
  for (const t of live(txs)) {
    if (!inRange(t.date, r)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense };
}
