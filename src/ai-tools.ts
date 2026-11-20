// Tool definitions for Mali's LLM brain (works with Claude API `tools` and Ollama `tools`).
// The model sees amounts in BAHT (numbers), the engine stores satang.
// Write tools only create DRAFTS. There is deliberately NO confirm tool: the human confirms in the UI
// (ipc 'nexus:confirmDraft'), so the model can never commit a financial change on its own.
import type { NexusService } from './service.js';
import { parseBaht } from './money.js';

type JSONSchema = Record<string, unknown>;
export interface ToolDef { name: string; description: string; input_schema: JSONSchema }

const obj = (properties: Record<string, JSONSchema>, required: string[] = []): JSONSchema =>
  ({ type: 'object', properties, required, additionalProperties: false });
const date = { type: 'string', description: 'YYYY-MM-DD (Asia/Bangkok)' };
const baht = { type: 'number', description: 'Amount in Thai baht, e.g. 59.5' };

export const nexusTools: ToolDef[] = [
  { name: 'nexus_get_dashboard', description: 'Overview: total balance, accounts, safe-to-spend, budgets, goals, upcoming bills, recent transactions.', input_schema: obj({}) },
  { name: 'nexus_get_safe_to_spend', description: 'How much the user can still spend this pay cycle, per day, and what is reserved (bills, goals, tax).', input_schema: obj({}) },
  { name: 'nexus_get_transactions', description: 'List/search transactions, newest first.', input_schema: obj({
    from: date, to: { ...date, description: 'exclusive end date' }, text: { type: 'string', description: 'search in note/category name' },
    categoryId: { type: 'string' }, accountId: { type: 'string' }, type: { enum: ['income', 'expense', 'transfer'] },
    limit: { type: 'integer', minimum: 1, maximum: 200 },
  }) },
  { name: 'nexus_get_budgets', description: 'This cycle: planned vs spent per category.', input_schema: obj({}) },
  { name: 'nexus_get_goals', description: 'Savings goals progress and whether each is on track.', input_schema: obj({}) },
  { name: 'nexus_get_cash_flow', description: 'Monthly income/expense/net for the last N months.', input_schema: obj({ months: { type: 'integer', minimum: 1, maximum: 24 } }) },
  { name: 'nexus_get_tax_estimate', description: 'Thai PIT estimate (actual year-to-date and full-year projection). It is an estimate, not filing advice.', input_schema: obj({ year: { type: 'integer' } }) },
  { name: 'nexus_get_reference', description: 'Accounts and categories with their ids. Call before proposing a transaction if you do not know the ids.', input_schema: obj({}) },
  { name: 'nexus_propose_transaction', description: 'Create a DRAFT transaction for the user to confirm in the app. Nothing is saved until they confirm. Tell the user what you drafted.', input_schema: obj({
    type: { enum: ['income', 'expense', 'transfer'] }, amount: baht, accountId: { type: 'string' },
    toAccountId: { type: 'string', description: 'transfer only' }, categoryId: { type: 'string', description: 'required for income/expense' },
    date, note: { type: 'string' },
  }, ['type', 'amount', 'accountId']) },
];

const toBaht = (v: unknown): unknown => {
  // Convert every satang field in results to baht for the model, so it never misreads 6000 as ฿6,000.
  if (Array.isArray(v)) return v.map(toBaht);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = SATANG_KEYS.has(k) && typeof x === 'number' ? x / 100 : toBaht(x);
    return out;
  }
  return v;
};
const SATANG_KEYS = new Set(['amount', 'balance', 'openingBalance', 'totalBalance', 'available', 'bills', 'goals', 'tax', 'total',
  'safeToSpend', 'perDay', 'shortfall', 'plan', 'spent', 'remaining', 'unplannedSpent', 'monthlyPlan', 'target', 'saved',
  'neededPerMonth', 'monthlyContribution', 'income', 'expense', 'net', 'withheld', 'totalGross', 'salaryExpense', 'bizExpense',
  'allowances', 'netIncome', 'progressiveTax', 'altMinTax', 'from', 'to', 'monthlyTaxReserve']);
// note: 'from'/'to' are satang only inside tax bands; date strings pass through untouched because they are not numbers.

export async function runNexusTool(svc: NexusService, name: string, input: any = {}): Promise<unknown> {
  switch (name) {
    case 'nexus_get_dashboard': return toBaht(svc.getDashboard());
    case 'nexus_get_safe_to_spend': return toBaht(svc.getSafeToSpend());
    case 'nexus_get_transactions': return toBaht(svc.getTransactions({ limit: 50, ...input }));
    case 'nexus_get_budgets': return toBaht(svc.getBudgets());
    case 'nexus_get_goals': return toBaht(svc.getGoals());
    case 'nexus_get_cash_flow': return toBaht(svc.getCashFlow(input.months ?? 6));
    case 'nexus_get_tax_estimate': return { ...(toBaht(svc.getTax(input.year)) as object), disclaimer: 'Estimate only. Confirm at efiling.rd.go.th.' };
    case 'nexus_get_reference': return {
      today: svc.today(),
      accounts: svc.getAccounts().map(a => ({ id: a.id, name: a.name, kind: a.kind })),
      categories: svc.getCategories().map(c => ({ id: c.id, name: c.name, kind: c.kind })),
    };
    case 'nexus_propose_transaction': {
      const d = svc.proposeTransaction({ ...input, amount: parseBaht(input.amount) });
      return { draftId: d.id, summary: d.summary, status: 'waiting_for_user_confirmation' };
    }
    default: throw new Error(`Unknown NEXUS tool: ${name}`);
  }
}

/** Safe wrapper: errors become a tool result the model can read and recover from. */
export async function runNexusToolSafe(svc: NexusService, name: string, input?: any) {
  try { return { ok: true, result: await runNexusTool(svc, name, input) }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}
