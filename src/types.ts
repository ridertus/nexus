import type { Satang } from './money.js';

export type ID = string;
/** Local calendar date, 'YYYY-MM-DD' (Asia/Bangkok — the only timezone that matters for one user). */
export type DateStr = string;

export interface Account {
  id: ID;
  name: string;                       // "Krungthai NEXT", "TrueMoney", "เงินสด"
  kind: 'bank' | 'wallet' | 'cash';
  openingBalance: Satang;
  /** false for a savings account whose money is not for day-to-day spending. */
  spendable: boolean;
  archived: boolean;
}

export type TaxSection = '40(1)' | '40(2)' | '40(8)';

export interface Category {
  id: ID;
  name: string;                       // "อาหาร", "เดินทาง", "เงินเดือน"
  kind: 'income' | 'expense';
  /** Monthly spending plan (budget). 0/undefined = no plan. Expense categories only. */
  monthlyPlan?: Satang;
  /** Only for income categories that count toward Thai PIT. */
  taxSection?: TaxSection;
  /** UI icon key (optional; UI falls back by name). */
  icon?: string;
  archived: boolean;
}

export interface Transaction {
  id: ID;
  date: DateStr;
  type: 'income' | 'expense' | 'transfer';
  amount: Satang;                     // always > 0; `type` carries direction
  accountId: ID;
  toAccountId?: ID;                   // transfer only
  categoryId?: ID;                    // income/expense only
  note?: string;
  /** Tax withheld at source on this income (ภาษีหัก ณ ที่จ่าย). */
  withheld?: Satang;
  goalId?: ID;                        // a transfer/expense that funds a goal
  billId?: ID;                        // marks this payment as paying a Bill
  source: 'manual' | 'csv' | 'ai';
  voided: boolean;                    // never deleted — voided instead
  createdAt: string;                  // ISO timestamp
}

export interface Bill {
  id: ID;
  name: string;                       // "ค่าห้อง", "Netflix"
  amount: Satang;
  categoryId: ID;
  accountId: ID;
  cadence: 'monthly' | 'yearly';
  dueDay: number;                     // 1–31 (clamped to month length)
  dueMonth?: number;                  // 1–12, yearly only
  isSubscription: boolean;
  active: boolean;
  /** First date this bill applies; earlier occurrences are ignored (you paid them before tracking). */
  startDate?: DateStr;
}

export interface Goal {
  id: ID;
  name: string;
  target: Satang;
  monthlyContribution: Satang;
  targetDate?: DateStr;
  archived: boolean;
}

export interface Settings {
  /** Day of month the pay cycle starts (e.g. 1, or 25 if paid on the 25th). */
  cycleStartDay: number;
  /** Set aside this much per month for tax in Safe-to-Spend. 0 = off. */
  monthlyTaxReserve: Satang;
  /** Extra Thai PIT allowances beyond the personal 60,000 (SSO, life insurance, ...). */
  taxAllowances: { label: string; amount: Satang }[];
  /** 'none' = no regular income: the home screen shows runway (days the money lasts) instead of per-cycle safe-to-spend. */
  incomeMode?: 'regular' | 'none';
  /** Expense deduction rate for 40(8) income — depends on the kind of business; check before filing. */
  section408DeductionRate: number;
}

export interface NexusData {
  schemaVersion: number;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  bills: Bill[];
  goals: Goal[];
}
