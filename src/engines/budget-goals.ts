import type { NexusData, DateStr, ID } from '../types.js';
import { type Satang, sum } from '../money.js';
import { addMonths, cycleFor, daysBetween, inRange, parseDate, toDateStr, type DateRange } from '../dates.js';
import { live, totals } from './ledger.js';

// ---------- Budgets (monthly plan per expense category) ----------
export interface BudgetLine { categoryId: ID; name: string; plan: Satang; spent: Satang; remaining: Satang; percentUsed: number; over: boolean }

export function calculateBudgets(data: NexusData, asOf: DateStr): { cycle: DateRange; lines: BudgetLine[]; unplannedSpent: Satang } {
  const cycle = cycleFor(asOf, data.settings.cycleStartDay);
  const exp = live(data.transactions).filter(t => t.type === 'expense' && inRange(t.date, cycle));
  const spentBy = new Map<ID | undefined, Satang>();
  for (const t of exp) spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amount);

  const lines: BudgetLine[] = [];
  const planned = new Set<ID>();
  for (const c of data.categories) {
    if (c.kind !== 'expense' || c.archived || !c.monthlyPlan) continue;
    planned.add(c.id);
    const spent = spentBy.get(c.id) ?? 0;
    lines.push({
      categoryId: c.id, name: c.name, plan: c.monthlyPlan, spent,
      remaining: c.monthlyPlan - spent,
      percentUsed: Math.round((spent / c.monthlyPlan) * 1000) / 10,
      over: spent > c.monthlyPlan,
    });
  }
  const unplannedSpent = sum([...spentBy].filter(([id]) => !id || !planned.has(id)).map(([, v]) => v));
  return { cycle, lines, unplannedSpent };
}

// ---------- Goals ----------
export interface GoalProgress {
  goalId: ID; name: string; target: Satang; saved: Satang; percent: number;
  status: 'done' | 'ahead' | 'on_track' | 'behind' | 'no_plan';
  projectedDate?: DateStr;
  neededPerMonth?: Satang;          // to hit targetDate from here
}

export function calculateGoals(data: NexusData, asOf: DateStr): GoalProgress[] {
  const tx = live(data.transactions).filter(t => t.goalId && t.date <= asOf);
  return data.goals.filter(g => !g.archived).map(g => {
    const saved = sum(tx.filter(t => t.goalId === g.id).map(t => t.amount));
    const left = Math.max(0, g.target - saved);
    const percent = g.target > 0 ? Math.min(100, Math.round((saved / g.target) * 1000) / 10) : 100;
    const base = { goalId: g.id, name: g.name, target: g.target, saved, percent };
    if (left === 0) return { ...base, status: 'done' as const };

    let projectedDate: DateStr | undefined;
    if (g.monthlyContribution > 0) {
      const months = Math.ceil(left / g.monthlyContribution);
      const { y, m, d } = parseDate(asOf);
      const p = addMonths(y, m, months);
      projectedDate = toDateStr(p.y, p.m, Math.min(d, 28));
    }
    if (!g.targetDate) return { ...base, status: projectedDate ? 'on_track' as const : 'no_plan' as const, projectedDate };

    const monthsToTarget = Math.max(1, Math.ceil(daysBetween(asOf, g.targetDate) / 30.4375));
    const neededPerMonth = Math.ceil(left / monthsToTarget);
    let status: GoalProgress['status'] = 'behind';
    if (projectedDate && projectedDate <= g.targetDate) {
      status = g.monthlyContribution > neededPerMonth * 1.1 ? 'ahead' : 'on_track';
    }
    return { ...base, status, projectedDate, neededPerMonth };
  });
}

// ---------- Cash flow ----------
export interface CashFlowPoint { month: string; income: Satang; expense: Satang; net: Satang }

export function calculateCashFlow(data: NexusData, asOf: DateStr, months = 6): CashFlowPoint[] {
  const { y, m } = parseDate(asOf);
  const out: CashFlowPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const a = addMonths(y, m, -i), b = addMonths(a.y, a.m, 1);
    const t = totals(data.transactions, { from: toDateStr(a.y, a.m, 1), to: toDateStr(b.y, b.m, 1) });
    out.push({ month: `${a.y}-${String(a.m).padStart(2, '0')}`, ...t, net: t.income - t.expense });
  }
  return out;
}
