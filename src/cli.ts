#!/usr/bin/env node
// NEXUS CLI — usable today, before the Roomie UI exists. Data: $NEXUS_DIR or ~/.nexus
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { NexusService } from './service.js';
import { JsonFileStore } from './store.js';
import { formatBaht as f, parseBaht } from './money.js';

const dir = process.env.NEXUS_DIR || path.join(os.homedir(), '.nexus');
const store = new JsonFileStore(dir);
const svc = new NexusService(store);

const argv = process.argv.slice(2);
const flags: Record<string, string> = {};
const pos: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? '';
  else pos.push(a);
}
const [cmd = 'status', ...args] = pos;

function pick<T extends { id: string; name: string }>(items: T[], q: string | undefined, what: string): T {
  if (!q) throw new Error(`Missing ${what}. Options: ${items.map(i => i.name).join(', ')}`);
  const s = q.toLowerCase();
  const exact = items.find(i => i.id === q || i.id.split('_').slice(1).join('_') === s || i.name.toLowerCase() === s);
  if (exact) return exact;
  const hits = items.filter(i => i.name.toLowerCase().includes(s) || i.id.toLowerCase().includes(s));
  if (hits.length === 1) return hits[0]!;
  throw new Error(hits.length ? `"${q}" matches several (${what}): ${hits.map(h => h.name).join(', ')}` : `No ${what} "${q}". Options: ${items.map(i => i.name).join(', ')}`);
}
const accounts = () => svc.getAccounts();
const cats = (kind: 'income' | 'expense') => svc.getCategories().filter(c => c.kind === kind);
const defaultAcc = () => flags.acc ? pick(accounts(), flags.acc, 'account').id : accounts().find(a => a.spendable)!.id;
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length));

function status() {
  const d = svc.getDashboard();
  const s = d.safeToSpend;
  if (d.runway) {
    const r = d.runway;
    console.log(`\nNEXUS · ${d.asOf} · no regular income\n`);
    console.log(`  RUNWAY  ${r.days === null ? '— (record some spending first)' : `${r.days} days  (until ~${r.runOutDate})`}`);
    console.log(`  spendable ${f(r.spendable)} ÷ ${f(r.burnPerDay)}/day  (everyday ${f(r.flexiblePerDay)} + bills ${f(r.billsPerDay)}, ${r.daysObserved}-day average${r.lowData ? ', still rough' : ''})`);
    if (r.withSavings !== r.spendable) console.log(`  incl. savings ${f(r.withSavings)} → ${r.daysWithSavings ?? '—'} days`);
    console.log('');
  } else {
    console.log(`\nNEXUS · ${d.asOf} · cycle ${s.cycle.from} → ${s.cycle.to} (${s.daysLeft} days left)\n`);
    console.log(`  SAFE TO SPEND  ${f(s.safeToSpend)}   (${f(s.perDay)}/day)`);
    if (s.shortfall) console.log(`  ⚠ SHORT BY    ${f(s.shortfall)} — reserved money exceeds what you have`);
    console.log(`  available ${f(s.available)} − bills ${f(s.reserved.bills)} − goals ${f(s.reserved.goals)} − tax ${f(s.reserved.tax)}\n`);
  }
  for (const a of d.accounts) console.log(`  ${pad(a.name, 18)} ${f(a.balance)}${a.spendable ? '' : '  (savings)'}`);
  console.log(`  ${pad('TOTAL', 18)} ${f(d.totalBalance)}`);
  if (d.budgets.lines.length) {
    console.log('\n  BUDGET');
    for (const b of d.budgets.lines) console.log(`  ${pad(b.name, 18)} ${f(b.spent)} / ${f(b.plan)}  ${b.over ? 'OVER' : b.percentUsed + '%'}`);
  }
  const unpaid = d.upcomingBills.filter(b => !b.paid);
  if (unpaid.length) { console.log('\n  BILLS DUE'); for (const b of unpaid) console.log(`  ${b.due}  ${pad(b.name, 16)} ${f(b.amount)}`); }
  if (d.goals.length) { console.log('\n  GOALS'); for (const g of d.goals) console.log(`  ${pad(g.name, 18)} ${f(g.saved)} / ${f(g.target)}  ${g.percent}%  ${g.status}`); }
  console.log('');
}

function list(n = 20) {
  const acc = new Map(accounts().map(a => [a.id, a.name]));
  const cat = new Map(svc.getCategories(true).map(c => [c.id, c.name]));
  for (const t of svc.getTransactions({ limit: n })) {
    const amt = t.type === 'income' ? f(t.amount, { sign: true }) : t.type === 'expense' ? f(-t.amount) : f(t.amount);
    const what = t.type === 'transfer' ? `${acc.get(t.accountId)} → ${acc.get(t.toAccountId!)}` : `${cat.get(t.categoryId!)} · ${acc.get(t.accountId)}`;
    console.log(`${t.date}  ${pad(amt, 12)} ${pad(what, 30)} ${t.note ?? ''}  [${t.id}]`);
  }
}

const HELP = `NEXUS (data: ${dir})
  nexus                                   dashboard
  nexus spend <฿> <category> [note]       expense   --acc <account> --date YYYY-MM-DD
  nexus earn <฿> <category> [note]        income    --withheld <฿>
  nexus move <฿> <from> <to> [note]       transfer between accounts
  nexus list [n]          nexus void <id> [reason]
  nexus setbal <account> <฿>              make the current balance match reality
  nexus plan <category> <฿>               monthly budget for a category
  nexus bill add <name> <฿> <category> <dueDay>  [--yearly <month>] [--sub]
  nexus bill pay <name>   nexus bills
  nexus goal add <name> <target฿> <monthly฿> [YYYY-MM-DD]
  nexus goal put <name> <฿> [--from <account>]   nexus goals
  nexus mode none|regular   (none = show runway: how many days your money lasts)
  nexus cycle <day>       nexus taxreserve <฿/month>     nexus tax [year]
  nexus accounts | cats | export <file.csv>`;

try {
  switch (cmd) {
    case 'status': status(); break;
    case 'spend': case 'earn': {
      const type = cmd === 'spend' ? 'expense' : 'income';
      const [amt, c, ...note] = args;
      const t = svc.addTransaction({
        type, amount: parseBaht(amt ?? ''), categoryId: pick(cats(type), c, 'category').id, accountId: defaultAcc(),
        note: note.join(' ') || undefined, date: flags.date, withheld: flags.withheld ? parseBaht(flags.withheld) : undefined,
      });
      console.log(`✓ ${type} ${f(t.amount)} saved [${t.id}]`);
      console.log(`  safe to spend now: ${f(svc.getSafeToSpend().safeToSpend)}`);
      break;
    }
    case 'move': {
      const [amt, from, to, ...note] = args;
      const t = svc.addTransaction({ type: 'transfer', amount: parseBaht(amt ?? ''), accountId: pick(accounts(), from, 'account').id,
        toAccountId: pick(accounts(), to, 'account').id, note: note.join(' ') || undefined, date: flags.date });
      console.log(`✓ transfer ${f(t.amount)} [${t.id}]`); break;
    }
    case 'list': list(Number(args[0] ?? 20)); break;
    case 'void': svc.voidTransaction(args[0] ?? '', args.slice(1).join(' ') || undefined); console.log('✓ voided'); break;
    case 'setbal': {
      const a = pick(accounts(), args[0], 'account');
      const want = parseBaht(args[1] ?? '');
      svc.updateAccount(a.id, { openingBalance: a.openingBalance + (want - a.balance) });
      console.log(`✓ ${a.name} balance is now ${f(want)}`); break;
    }
    case 'plan': { const c = pick(cats('expense'), args[0], 'category'); svc.setPlans({ [c.id]: parseBaht(args[1] ?? '') }); console.log(`✓ ${c.name} plan ${args[1]}`); break; }
    case 'bills': for (const b of svc.getUpcomingBills()) console.log(`${b.due}  ${pad(b.name, 16)} ${f(b.amount)}  ${b.paid ? 'paid' : 'due'}`); break;
    case 'bill': {
      const [sub, ...r] = args;
      if (sub === 'add') {
        const b = svc.addBill({ name: r[0] ?? '', amount: parseBaht(r[1] ?? ''), categoryId: pick(cats('expense'), r[2], 'category').id,
          accountId: defaultAcc(), dueDay: Number(r[3]), cadence: flags.yearly ? 'yearly' : 'monthly',
          dueMonth: flags.yearly ? Number(flags.yearly) : undefined, isSubscription: 'sub' in flags });
        console.log(`✓ bill ${b.name} [${b.id}]`);
      } else if (sub === 'pay') {
        const b = pick(svc.getBills(), r[0], 'bill');
        svc.payBill(b.id, { date: flags.date, amount: flags.amount ? parseBaht(flags.amount) : undefined });
        console.log(`✓ paid ${b.name}`);
      } else throw new Error('bill add | bill pay');
      break;
    }
    case 'goals': for (const g of svc.getGoals()) console.log(`${pad(g.name, 18)} ${f(g.saved)} / ${f(g.target)}  ${g.percent}%  ${g.status}${g.projectedDate ? '  ~' + g.projectedDate : ''}${g.neededPerMonth ? '  need ' + f(g.neededPerMonth) + '/mo' : ''}`); break;
    case 'goal': {
      const [sub, ...r] = args;
      if (sub === 'add') {
        const g = svc.addGoal({ name: r[0] ?? '', target: parseBaht(r[1] ?? ''), monthlyContribution: parseBaht(r[2] ?? '0'), targetDate: r[3] });
        console.log(`✓ goal ${g.name} [${g.id}]`);
      } else if (sub === 'put') {
        const g = pick(svc.snapshot().goals.filter(x => !x.archived), r[0], 'goal');
        svc.contributeToGoal(g.id, parseBaht(r[1] ?? ''), defaultAcc(), flags.to ? pick(accounts(), flags.to, 'account').id : undefined);
        console.log(`✓ ${f(parseBaht(r[1] ?? ''))} → ${g.name}`);
      } else throw new Error('goal add | goal put');
      break;
    }
    case 'mode': {
      const m = args[0] === 'none' ? 'none' : args[0] === 'regular' ? 'regular' : null;
      if (!m) throw new Error('nexus mode none | regular');
      svc.updateSettings({ incomeMode: m });
      console.log(m === 'none' ? '✓ no regular income — dashboard shows runway' : '✓ regular income — dashboard shows safe-to-spend per cycle');
      break;
    }
    case 'cycle': svc.updateSettings({ cycleStartDay: Number(args[0]) }); console.log(`✓ cycle starts on day ${args[0]}`); break;
    case 'taxreserve': svc.updateSettings({ monthlyTaxReserve: parseBaht(args[0] ?? '0') }); console.log('✓ saved'); break;
    case 'tax': {
      const { actual, projected } = svc.getTax(args[0] ? Number(args[0]) : undefined);
      for (const e of [actual, projected]) {
        console.log(`\n${e.basis === 'actual_ytd' ? 'YEAR TO DATE' : 'FULL-YEAR PROJECTION'} (${e.year})`);
        console.log(`  gross ${f(e.totalGross)}  − expenses ${f(e.salaryExpense + e.bizExpense)}  − allowances ${f(e.allowances)}  = net ${f(e.netIncome)}`);
        console.log(`  tax ${f(e.tax)} (${e.method})   withheld ${f(e.withheld)}   ${e.remaining >= 0 ? 'to pay ' + f(e.remaining) : 'refund ~' + f(-e.remaining)}`);
      }
      console.log(`\n  Estimate only — rules last checked ${actual.rules.verifiedAt}. Confirm at efiling.rd.go.th.\n`);
      break;
    }
    case 'accounts': for (const a of accounts()) console.log(`${pad(a.id, 14)} ${pad(a.name, 18)} ${f(a.balance)}`); break;
    case 'cats': for (const c of svc.getCategories()) console.log(`${pad(c.id, 16)} ${pad(c.kind, 8)} ${c.name}${c.monthlyPlan ? '  plan ' + f(c.monthlyPlan) : ''}${c.taxSection ? '  ' + c.taxSection : ''}`); break;
    case 'export': { const file = args[0] ?? 'nexus-export.csv'; fs.writeFileSync(file, svc.exportCsv()); console.log(`✓ ${file}`); break; }
    case 'help': case '-h': case '--help': console.log(HELP); break;
    default: console.log(HELP); process.exitCode = 1;
  }
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
}
