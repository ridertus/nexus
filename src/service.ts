// The one API everything else uses (Electron IPC, AI tools, CLI). Loads → validates → calls engines → saves.
import type { Account, Bill, Category, DateStr, Goal, ID, NexusData, Settings, Transaction } from './types.js';
import { type Satang, assertSatang } from './money.js';
import type { Store } from './store-types.js';
import { migrate } from './seed.js';
import { parseDate, todayBangkok, cycleFor } from './dates.js';
import { accountBalances, live } from './engines/ledger.js';
import { calculateSafeToSpend, billsInCycle } from './engines/safe-to-spend.js';
import { calculateBudgets, calculateGoals, calculateCashFlow } from './engines/budget-goals.js';
import { estimateTax } from './engines/tax.js';
import { calculateRunway } from './engines/runway.js';

export class NexusError extends Error {}
const fail = (msg: string): never => { throw new NexusError(msg); };
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${globalThis.crypto.randomUUID().slice(0, 6)}`;

export interface NewTransaction {
  date?: DateStr;                   // default: today (Bangkok)
  type: Transaction['type'];
  amount: Satang;
  accountId: ID;
  toAccountId?: ID;
  categoryId?: ID;
  note?: string;
  withheld?: Satang;
  goalId?: ID;
  billId?: ID;
  source?: Transaction['source'];
}

export interface TransactionQuery {
  from?: DateStr; to?: DateStr;     // inclusive from, exclusive to
  accountId?: ID; categoryId?: ID; type?: Transaction['type'];
  text?: string; includeVoided?: boolean; limit?: number;
}

export interface Draft { id: string; createdAt: string; summary: string; transaction: NewTransaction }

export class NexusService {
  private _data: NexusData;
  /** Always current: reloads if another process (CLI ↔ Roomie) wrote the file since we last touched it. */
  private get data(): NexusData {
    if (this.store.isStale?.()) this._data = this.store.load();
    return this._data;
  }
  private drafts = new Map<string, Draft>();
  private listeners = new Set<() => void>();

  constructor(private store: Store, private clock: () => DateStr = () => todayBangkok()) {
    this._data = store.load();
  }

  today() { return this.clock(); }
  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private commit(mutate: (d: NexusData) => void) {
    const next = structuredClone(this.data);
    mutate(next);
    this.store.save(next);          // only swap in-memory state once the write succeeded
    this._data = next;
    for (const fn of this.listeners) fn();
  }

  // ---------------- read ----------------
  snapshot(): NexusData { return structuredClone(this.data); }
  getSettings(): Settings { return structuredClone(this.data.settings); }
  getAccounts(includeArchived = false) {
    const bal = accountBalances(this.data.accounts, this.data.transactions, this.today());
    return this.data.accounts.filter(a => includeArchived || !a.archived).map(a => ({ ...a, balance: bal.get(a.id) ?? 0 }));
  }
  getCategories(includeArchived = false) { return this.data.categories.filter(c => includeArchived || !c.archived).map(c => ({ ...c })); }
  getBills() { return this.data.bills.map(b => ({ ...b })); }

  getTransactions(q: TransactionQuery = {}): Transaction[] {
    const text = q.text?.toLowerCase();
    const catName = new Map(this.data.categories.map(c => [c.id, c.name.toLowerCase()]));
    const out = this.data.transactions.filter(t =>
      (q.includeVoided || !t.voided) &&
      (!q.from || t.date >= q.from) && (!q.to || t.date < q.to) &&
      (!q.accountId || t.accountId === q.accountId || t.toAccountId === q.accountId) &&
      (!q.categoryId || t.categoryId === q.categoryId) &&
      (!q.type || t.type === q.type) &&
      (!text || (t.note ?? '').toLowerCase().includes(text) || (t.categoryId && catName.get(t.categoryId)?.includes(text))),
    ).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return structuredClone(q.limit ? out.slice(0, q.limit) : out);
  }

  getSafeToSpend(asOf = this.today()) { return calculateSafeToSpend(this.data, asOf); }
  getBudgets(asOf = this.today()) { return calculateBudgets(this.data, asOf); }
  getGoals(asOf = this.today()) { return calculateGoals(this.data, asOf); }
  getCashFlow(months = 6, asOf = this.today()) { return calculateCashFlow(this.data, asOf, months); }
  getRunway(asOf = this.today(), window = 30) { return calculateRunway(this.data, asOf, window); }
  getTax(year = Number(this.today().slice(0, 4))) { return estimateTax(this.data, year, this.today()); }
  getUpcomingBills(asOf = this.today()) {
    return billsInCycle(this.data.bills, this.data, cycleFor(asOf, this.data.settings.cycleStartDay));
  }

  /** Everything the dashboard needs in one call. */
  getDashboard(asOf = this.today()) {
    const accounts = this.getAccounts();
    return {
      asOf,
      totalBalance: accounts.reduce((s, a) => s + a.balance, 0),
      accounts,
      safeToSpend: this.getSafeToSpend(asOf),
      runway: this.data.settings.incomeMode === 'none' ? this.getRunway(asOf) : undefined,
      budgets: this.getBudgets(asOf),
      goals: this.getGoals(asOf),
      cashFlow: this.getCashFlow(6, asOf),
      upcomingBills: this.getUpcomingBills(asOf),
      recent: this.getTransactions({ limit: 10 }),
    };
  }

  // ---------------- validation ----------------
  private account(id: ID | undefined, label = 'accountId'): Account {
    const a = this.data.accounts.find(x => x.id === id);
    if (!a) fail(`Unknown ${label}: ${id}`);
    if (a!.archived) fail(`Account "${a!.name}" is archived`);
    return a!;
  }

  validateTransaction(input: NewTransaction): Transaction {
    const date = input.date ?? this.today();
    try { parseDate(date); } catch (e) { fail((e as Error).message); }
    assertSatang(input.amount);
    if (input.amount <= 0) fail('amount must be > 0 (type carries the direction)');
    this.account(input.accountId);
    if (input.type === 'transfer') {
      this.account(input.toAccountId, 'toAccountId');
      if (input.toAccountId === input.accountId) fail('Transfer needs two different accounts');
      if (input.categoryId) fail('Transfers have no category');
    } else {
      if (input.toAccountId) fail('toAccountId is only for transfers');
      if (!input.categoryId) fail('categoryId is required for income/expense');
      const c = this.data.categories.find(x => x.id === input.categoryId);
      if (!c) fail(`Unknown categoryId: ${input.categoryId}`);
      if (c!.kind !== input.type) fail(`Category "${c!.name}" is ${c!.kind}, not ${input.type}`);
    }
    if (input.withheld !== undefined) {
      assertSatang(input.withheld, 'withheld');
      if (input.type !== 'income' || input.withheld < 0 || input.withheld > input.amount) fail('withheld must be 0..amount on income');
    }
    if (input.goalId && !this.data.goals.some(g => g.id === input.goalId)) fail(`Unknown goalId: ${input.goalId}`);
    if (input.billId && !this.data.bills.some(b => b.id === input.billId)) fail(`Unknown billId: ${input.billId}`);
    const t: Transaction = {
      id: newId('tx'), date, type: input.type, amount: input.amount, accountId: input.accountId,
      source: input.source ?? 'manual', voided: false, createdAt: new Date().toISOString(),
    };
    for (const k of ['toAccountId', 'categoryId', 'withheld', 'goalId', 'billId'] as const) {
      if (input[k] !== undefined) (t as any)[k] = input[k];
    }
    const note = input.note?.trim();
    if (note) t.note = note;
    return t;
  }

  // ---------------- transactions ----------------
  addTransaction(input: NewTransaction): Transaction {
    const t = this.validateTransaction(input);
    this.commit(d => { d.transactions.push(t); });
    return structuredClone(t);
  }

  updateTransaction(id: ID, patch: Partial<NewTransaction>): Transaction {
    const old = this.data.transactions.find(t => t.id === id) ?? fail(`Unknown transaction ${id}`);
    if (old.voided) fail('Cannot edit a voided transaction');
    const { id: _i, createdAt, voided, source, ...rest } = old;
    const merged = { ...rest, source, ...patch } as NewTransaction;
    // allow clearing optional fields by passing null
    for (const [k, v] of Object.entries(patch)) if (v === null) delete (merged as any)[k];
    const t = { ...this.validateTransaction(merged), id, createdAt };
    this.commit(d => { d.transactions[d.transactions.findIndex(x => x.id === id)] = t; });
    return structuredClone(t);
  }

  voidTransaction(id: ID, reason?: string): void {
    const i = this.data.transactions.findIndex(t => t.id === id);
    if (i < 0) fail(`Unknown transaction ${id}`);
    this.commit(d => {
      const t = d.transactions[i]!;
      t.voided = true;
      if (reason) t.note = `${t.note ? t.note + ' · ' : ''}[void: ${reason}]`;
    });
  }

  /** Undo a void (used by the UI's "undo" toast). */
  unvoidTransaction(id: ID): void {
    const i = this.data.transactions.findIndex(t => t.id === id);
    if (i < 0) fail(`Unknown transaction ${id}`);
    this.commit(d => {
      const t = d.transactions[i]!;
      t.voided = false;
      const note = t.note?.replace(/( · )?\[void: [^\]]*\]$/, '');
      if (note) t.note = note; else delete t.note;
    });
  }

  // ---------------- AI drafts (confirmed only by the human, via UI/IPC) ----------------
  proposeTransaction(input: NewTransaction): Draft {
    const t = this.validateTransaction({ ...input, source: 'ai' });
    const acc = this.data.accounts.find(a => a.id === t.accountId)!;
    const cat = this.data.categories.find(c => c.id === t.categoryId);
    const draft: Draft = {
      id: newId('draft'), createdAt: new Date().toISOString(),
      summary: `${t.type} ${(t.amount / 100).toFixed(2)} THB · ${acc.name}${cat ? ' · ' + cat.name : ''} · ${t.date}${t.note ? ' · ' + t.note : ''}`,
      transaction: { ...input, date: t.date, source: 'ai' },
    };
    this.drafts.set(draft.id, draft);
    return structuredClone(draft);
  }
  listDrafts(): Draft[] { return [...this.drafts.values()].map(d => structuredClone(d)); }
  confirmDraft(id: string): Transaction {
    const d = this.drafts.get(id) ?? fail(`No pending draft ${id} (already confirmed, discarded, or app restarted)`);
    const t = this.addTransaction(d.transaction);
    this.drafts.delete(id);
    return t;
  }
  discardDraft(id: string) { this.drafts.delete(id); }

  // ---------------- accounts / categories ----------------
  addAccount(a: Omit<Account, 'id' | 'archived'> & { archived?: boolean }): Account {
    if (!a.name?.trim()) fail('name required');
    assertSatang(a.openingBalance, 'openingBalance');
    const acc: Account = { archived: false, ...a, name: a.name.trim(), id: newId('acc') };
    this.commit(d => { d.accounts.push(acc); });
    return { ...acc };
  }
  updateAccount(id: ID, patch: Partial<Omit<Account, 'id'>>): Account {
    if (!this.data.accounts.some(a => a.id === id)) fail(`Unknown account ${id}`);
    if (patch.openingBalance !== undefined) assertSatang(patch.openingBalance, 'openingBalance');
    let out!: Account;
    this.commit(d => { const a = d.accounts.find(x => x.id === id)!; Object.assign(a, patch, { id }); out = { ...a }; });
    return out;
  }

  addCategory(c: Omit<Category, 'id' | 'archived'>): Category {
    if (!c.name?.trim()) fail('name required');
    if (c.monthlyPlan !== undefined) assertSatang(c.monthlyPlan, 'monthlyPlan');
    if (c.kind === 'expense' && c.taxSection) fail('taxSection is for income categories');
    const cat: Category = { ...c, name: c.name.trim(), id: newId('cat'), archived: false };
    this.commit(d => { d.categories.push(cat); });
    return { ...cat };
  }
  updateCategory(id: ID, patch: Partial<Omit<Category, 'id' | 'kind'>>): Category {
    if (!this.data.categories.some(c => c.id === id)) fail(`Unknown category ${id}`);
    if (patch.monthlyPlan !== undefined) assertSatang(patch.monthlyPlan, 'monthlyPlan');
    let out!: Category;
    this.commit(d => { const c = d.categories.find(x => x.id === id)!; Object.assign(c, patch, { id }); out = { ...c }; });
    return out;
  }
  /** Set this cycle's plan for many categories at once: { cat_food: 600000, ... } (satang). */
  setPlans(plans: Record<ID, Satang>) {
    for (const [id, v] of Object.entries(plans)) {
      const c = this.data.categories.find(x => x.id === id) ?? fail(`Unknown category ${id}`);
      if (c.kind !== 'expense') fail(`${c.name} is not an expense category`);
      assertSatang(v, 'plan'); if (v < 0) fail('plan must be >= 0');
    }
    this.commit(d => { for (const [id, v] of Object.entries(plans)) d.categories.find(c => c.id === id)!.monthlyPlan = v; });
  }

  // ---------------- bills ----------------
  addBill(b: Omit<Bill, 'id' | 'active'> & { active?: boolean }): Bill {
    this.account(b.accountId);
    assertSatang(b.amount); if (b.amount <= 0) fail('amount must be > 0');
    if (!Number.isInteger(b.dueDay) || b.dueDay < 1 || b.dueDay > 31) fail('dueDay must be 1..31');
    if (b.cadence === 'yearly' && !(b.dueMonth && b.dueMonth >= 1 && b.dueMonth <= 12)) fail('yearly bills need dueMonth 1..12');
    const c = this.data.categories.find(x => x.id === b.categoryId);
    if (!c || c.kind !== 'expense') fail('categoryId must be an expense category');
    if (b.startDate) parseDate(b.startDate);
    const bill: Bill = { active: true, startDate: this.today(), ...b, id: newId('bill') };
    this.commit(d => { d.bills.push(bill); });
    return { ...bill };
  }
  updateBill(id: ID, patch: Partial<Omit<Bill, 'id'>>): Bill {
    if (!this.data.bills.some(b => b.id === id)) fail(`Unknown bill ${id}`);
    let out!: Bill;
    this.commit(d => { const b = d.bills.find(x => x.id === id)!; Object.assign(b, patch, { id }); out = { ...b }; });
    return out;
  }
  /** Record paying a bill: an expense linked to it, so Safe-to-Spend stops reserving it. */
  payBill(id: ID, opts: { date?: DateStr; amount?: Satang; accountId?: ID } = {}): Transaction {
    const b = this.data.bills.find(x => x.id === id) ?? fail(`Unknown bill ${id}`);
    return this.addTransaction({
      type: 'expense', amount: opts.amount ?? b.amount, accountId: opts.accountId ?? b.accountId,
      categoryId: b.categoryId, billId: b.id, note: b.name, date: opts.date,
    });
  }

  // ---------------- goals ----------------
  addGoal(g: Omit<Goal, 'id' | 'archived'>): Goal {
    if (!g.name?.trim()) fail('name required');
    assertSatang(g.target, 'target'); assertSatang(g.monthlyContribution, 'monthlyContribution');
    if (g.target <= 0) fail('target must be > 0');
    if (g.targetDate) parseDate(g.targetDate);
    const goal: Goal = { ...g, name: g.name.trim(), id: newId('goal'), archived: false };
    this.commit(d => { d.goals.push(goal); });
    return { ...goal };
  }
  updateGoal(id: ID, patch: Partial<Omit<Goal, 'id'>>): Goal {
    if (!this.data.goals.some(g => g.id === id)) fail(`Unknown goal ${id}`);
    let out!: Goal;
    this.commit(d => { const g = d.goals.find(x => x.id === id)!; Object.assign(g, patch, { id }); out = { ...g }; });
    return out;
  }
  /** Move money into a goal = transfer from a spending account into a (usually non-spendable) savings account. */
  contributeToGoal(goalId: ID, amount: Satang, fromAccountId: ID, toAccountId = 'acc_savings', date?: DateStr): Transaction {
    return this.addTransaction({ type: 'transfer', amount, accountId: fromAccountId, toAccountId, goalId, date, note: 'goal' });
  }

  // ---------------- settings ----------------
  updateSettings(patch: Partial<Settings>): Settings {
    if (patch.cycleStartDay !== undefined && !(Number.isInteger(patch.cycleStartDay) && patch.cycleStartDay >= 1 && patch.cycleStartDay <= 28))
      fail('cycleStartDay must be 1..28');
    if (patch.incomeMode !== undefined && !['regular', 'none'].includes(patch.incomeMode)) fail('incomeMode must be regular or none');
    if (patch.monthlyTaxReserve !== undefined) assertSatang(patch.monthlyTaxReserve, 'monthlyTaxReserve');
    if (patch.section408DeductionRate !== undefined && !(patch.section408DeductionRate >= 0 && patch.section408DeductionRate <= 1))
      fail('section408DeductionRate must be 0..1');
    this.commit(d => { Object.assign(d.settings, patch); });
    return this.getSettings();
  }

  // ---------------- backup / restore ----------------
  /** Replace everything (restore from a backup file). Validates schema first. */
  replaceAll(raw: unknown): void {
    const d = migrate(raw);
    if (!Array.isArray(d.accounts) || !Array.isArray(d.transactions) || !d.settings) fail('Not a NEXUS backup file');
    this.commit(x => { Object.assign(x, structuredClone(d)); });
    this.drafts.clear();
  }

  // ---------------- export ----------------
  exportCsv(): string {
    const acc = new Map(this.data.accounts.map(a => [a.id, a.name]));
    const cat = new Map(this.data.categories.map(c => [c.id, c.name]));
    const q = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const rows = [['date', 'type', 'amount', 'account', 'to_account', 'category', 'note', 'withheld', 'voided']];
    for (const t of [...this.data.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([t.date, t.type, (t.amount / 100).toFixed(2), acc.get(t.accountId) ?? t.accountId,
        t.toAccountId ? acc.get(t.toAccountId) ?? '' : '', t.categoryId ? cat.get(t.categoryId) ?? '' : '',
        t.note ?? '', t.withheld ? (t.withheld / 100).toFixed(2) : '', t.voided ? 'yes' : '']);
    }
    return '﻿' + rows.map(r => r.map(q).join(',')).join('\n') + '\n'; // BOM so Excel shows Thai correctly
  }
}

export { live };
