// Thai personal income tax (PIT) estimate. Pure. Brackets and limits are DATA, keyed by tax year.
// This is an estimate for planning, not a filing tool — always confirm on efiling.rd.go.th.
import type { NexusData, DateStr, TaxSection } from '../types.js';
import { type Satang, mulRate, sum } from '../money.js';
import { live } from './ledger.js';
import { parseDate } from '../dates.js';

export interface TaxBracket { upTo: Satang | null; rate: number } // net income up to `upTo` taxed at `rate`
export interface TaxRules {
  year: number;
  brackets: TaxBracket[];
  personalAllowance: Satang;
  salaryExpenseRate: number;        // 40(1)+40(2) combined
  salaryExpenseCap: Satang;
  /** Alternative minimum tax on non-40(1) income: 0.5% of gross when that income > threshold. */
  altMinRate: number;
  altMinIncomeThreshold: Satang;
  altMinExemptBelow: Satang;        // alt tax ≤ this is waived
  verifiedAt: DateStr;
  source: string;
}

const B = (baht: number) => baht * 100;

/** Rules in force for income years 2017+ (unchanged as of the last check). Copy & edit when the RD changes them. */
const RULES_2560_PLUS: Omit<TaxRules, 'year'> = {
  brackets: [
    { upTo: B(150_000), rate: 0 },
    { upTo: B(300_000), rate: 0.05 },
    { upTo: B(500_000), rate: 0.10 },
    { upTo: B(750_000), rate: 0.15 },
    { upTo: B(1_000_000), rate: 0.20 },
    { upTo: B(2_000_000), rate: 0.25 },
    { upTo: B(5_000_000), rate: 0.30 },
    { upTo: null, rate: 0.35 },
  ],
  personalAllowance: B(60_000),
  salaryExpenseRate: 0.5,
  salaryExpenseCap: B(100_000),
  altMinRate: 0.005,
  altMinIncomeThreshold: B(120_000),
  altMinExemptBelow: B(5_000),
  verifiedAt: '2026-11-20',
  source: 'Revenue Department progressive PIT table; personal allowance 60,000; 40(1)/(2) expense 50% capped 100,000',
};

export function rulesFor(year: number, overrides: Partial<Record<number, TaxRules>> = {}): TaxRules {
  return overrides[year] ?? { year, ...RULES_2560_PLUS };
}

export function progressiveTax(net: Satang, brackets: TaxBracket[]) {
  let prev = 0, tax = 0;
  const bands: { from: Satang; to: Satang | null; rate: number; tax: Satang }[] = [];
  for (const b of brackets) {
    if (net <= prev) break;
    const top = b.upTo === null ? net : Math.min(net, b.upTo);
    const t = mulRate(top - prev, b.rate);
    bands.push({ from: prev, to: b.upTo, rate: b.rate, tax: t });
    tax += t;
    if (b.upTo === null) break;
    prev = b.upTo;
  }
  return { tax, bands };
}

export interface TaxInput {
  gross: Record<TaxSection, Satang>;
  allowances: Satang;               // everything beyond the personal allowance
  section408DeductionRate: number;
}

export function computeTax(input: TaxInput, rules: TaxRules) {
  const g = input.gross;
  const salaryGross = g['40(1)'] + g['40(2)'];
  const salaryExpense = Math.min(mulRate(salaryGross, rules.salaryExpenseRate), rules.salaryExpenseCap);
  const bizExpense = mulRate(g['40(8)'], input.section408DeductionRate);
  const totalGross = salaryGross + g['40(8)'];
  const allowances = rules.personalAllowance + input.allowances;
  const netIncome = Math.max(0, totalGross - salaryExpense - bizExpense - allowances);
  const prog = progressiveTax(netIncome, rules.brackets);

  const nonSalary = g['40(2)'] + g['40(8)'];
  let altMin = 0;
  if (nonSalary > rules.altMinIncomeThreshold) {
    const a = mulRate(nonSalary, rules.altMinRate);
    if (a > rules.altMinExemptBelow) altMin = a;
  }
  const tax = Math.max(prog.tax, altMin);
  return {
    totalGross, salaryExpense, bizExpense, allowances, netIncome,
    progressiveTax: prog.tax, altMinTax: altMin, tax,
    method: tax === prog.tax ? 'progressive' as const : 'alt_min_0.5pct' as const,
    bands: prog.bands,
  };
}

export interface TaxEstimate extends ReturnType<typeof computeTax> {
  year: number;
  basis: 'actual_ytd' | 'projected_full_year';
  withheld: Satang;
  remaining: Satang;                // tax − withheld (negative = refund expected)
  rules: { verifiedAt: DateStr; source: string };
}

/** Estimate for `year` from ledger income. Returns actual YTD and a full-year projection. */
export function estimateTax(data: NexusData, year: number, asOf: DateStr, overrides?: Partial<Record<number, TaxRules>>) {
  const rules = rulesFor(year, overrides);
  const sectionOf = new Map(data.categories.filter(c => c.taxSection).map(c => [c.id, c.taxSection!]));
  const gross: Record<TaxSection, Satang> = { '40(1)': 0, '40(2)': 0, '40(8)': 0 };
  let withheld = 0;
  for (const t of live(data.transactions)) {
    if (t.type !== 'income' || !t.date.startsWith(`${year}-`) || t.date > asOf) continue;
    const s = t.categoryId ? sectionOf.get(t.categoryId) : undefined;
    if (!s) continue;
    gross[s] += t.amount;
    withheld += t.withheld ?? 0;
  }
  const allowances = sum(data.settings.taxAllowances.map(a => a.amount));
  const mk = (gr: typeof gross, wh: Satang, basis: TaxEstimate['basis']): TaxEstimate => {
    const r = computeTax({ gross: gr, allowances, section408DeductionRate: data.settings.section408DeductionRate }, rules);
    return { ...r, year, basis, withheld: wh, remaining: r.tax - wh, rules: { verifiedAt: rules.verifiedAt, source: rules.source } };
  };
  const actual = mk(gross, withheld, 'actual_ytd');

  // Projection = what you have so far + your average month (since you started tracking this year) × months left.
  // It never invents income for months before your first tracked income.
  const a = parseDate(asOf);
  const firstMonth = Math.min(13, ...live(data.transactions)
    .filter(t => t.type === 'income' && t.date.startsWith(`${year}-`) && t.date <= asOf && t.categoryId && sectionOf.has(t.categoryId))
    .map(t => parseDate(t.date).m));
  let projected = actual;
  if (a.y === year && firstMonth <= a.m && a.m < 12) {
    const tracked = a.m - firstMonth + 1, left = 12 - a.m;
    const grow = (v: Satang) => v + Math.round((v / tracked) * left);
    projected = mk({ '40(1)': grow(gross['40(1)']), '40(2)': grow(gross['40(2)']), '40(8)': grow(gross['40(8)']) }, grow(withheld), 'projected_full_year');
  }
  return { actual, projected };
}
