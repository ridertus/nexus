// Sample data so the app can be explored before entering real numbers. Deterministic.
import type { NexusService } from '../src/service.js';
import { addMonths, parseDate, toDateStr, daysInMonth } from '../src/dates.js';

export function loadDemo(svc: NexusService) {
  const today = svc.today();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const B = (n: number) => Math.round(n * 100);

  svc.updateSettings({ cycleStartDay: 1, monthlyTaxReserve: B(500) });
  svc.updateAccount('acc_bank', { openingBalance: B(14200) });
  svc.updateAccount('acc_tmw', { openingBalance: B(850) });
  svc.updateAccount('acc_cash', { openingBalance: B(400) });
  svc.updateAccount('acc_savings', { openingBalance: B(38000) });
  svc.setPlans({ cat_food: B(6500), cat_transport: B(1500), cat_shopping: B(2000), cat_fun: B(1500), cat_health: B(800) });

  const rent = svc.addBill({ name: 'ค่าห้อง', amount: B(4500), categoryId: 'cat_home', accountId: 'acc_bank', cadence: 'monthly', dueDay: 5, isSubscription: false });
  const net = svc.addBill({ name: 'เน็ตบ้าน', amount: B(599), categoryId: 'cat_home', accountId: 'acc_bank', cadence: 'monthly', dueDay: 15, isSubscription: false });
  const nf = svc.addBill({ name: 'Netflix', amount: B(419), categoryId: 'cat_subs', accountId: 'acc_bank', cadence: 'monthly', dueDay: 24, isSubscription: true });
  svc.addBill({ name: 'Spotify', amount: B(69), categoryId: 'cat_subs', accountId: 'acc_tmw', cadence: 'monthly', dueDay: 27, isSubscription: true });
  const ef = svc.addGoal({ name: 'เงินสำรองฉุกเฉิน', target: B(150000), monthlyContribution: B(3000), targetDate: `${Number(today.slice(0, 4)) + 3}-12-31` });
  const pc = svc.addGoal({ name: 'อัปเกรดคอม', target: B(35000), monthlyContribution: B(2000), targetDate: `${Number(today.slice(0, 4)) + 1}-06-30` });

  const { y, m, d } = parseDate(today);
  const start = (() => { const s = addMonths(y, m, -3); return toDateStr(s.y, s.m, 1); })();
  for (const b of svc.getBills()) svc.updateBill(b.id, { startDate: start });
  for (let back = 2; back >= 0; back--) {
    const mm = addMonths(y, m, -back);
    const last = back === 0 ? d : daysInMonth(mm.y, mm.m);
    for (let day = 1; day <= last; day++) {
      const date = toDateStr(mm.y, mm.m, day);
      const tx = (o: any) => svc.addTransaction({ date, ...o });
      if (day === 1) {
        tx({ type: 'income', amount: B(28000), accountId: 'acc_bank', categoryId: 'cat_salary', note: 'เงินเดือน', withheld: B(150) });
        tx({ type: 'transfer', amount: B(1500), accountId: 'acc_bank', toAccountId: 'acc_tmw', note: 'เติม TrueMoney' });
        tx({ type: 'transfer', amount: B(2000), accountId: 'acc_bank', toAccountId: 'acc_savings', goalId: ef.id, note: 'goal' });
      }
      if (day === 3 && (back !== 0 || d >= 3)) tx({ type: 'transfer', amount: B(1000), accountId: 'acc_bank', toAccountId: 'acc_savings', goalId: pc.id, note: 'goal' });
      if (day === 5) svc.payBill(rent.id, { date });
      if (day === 15) svc.payBill(net.id, { date });
      if (day === 24) svc.payBill(nf.id, { date });
      if (day === 18 && back === 1) tx({ type: 'income', amount: B(4500), accountId: 'acc_bank', categoryId: 'cat_freelance', note: 'งานเว็บ', withheld: B(135) });
      // daily life
      tx({ type: 'expense', amount: B(pick([45, 50, 55, 60])), accountId: pick(['acc_tmw', 'acc_bank']), categoryId: 'cat_food', note: pick(['ข้าวมันไก่', 'กะเพราไข่ดาว', 'ก๋วยเตี๋ยว', 'ข้าวผัด']) });
      if (rnd() < 0.75) tx({ type: 'expense', amount: B(pick([60, 70, 89, 120, 145])), accountId: pick(['acc_tmw', 'acc_bank', 'acc_cash']), categoryId: 'cat_food', note: pick(['ข้าวเย็น', 'ส้มตำ', '7-Eleven', 'ชาไทย']) });
      if (rnd() < 0.45) tx({ type: 'expense', amount: B(pick([16, 25, 32, 44])), accountId: 'acc_tmw', categoryId: 'cat_transport', note: pick(['BTS', 'MRT', 'วิน']) });
      if (rnd() < 0.08) tx({ type: 'expense', amount: B(pick([290, 450, 690, 1290])), accountId: 'acc_bank', categoryId: 'cat_shopping', note: pick(['Shopee', 'Lazada', 'Uniqlo']) });
      if (rnd() < 0.06) tx({ type: 'expense', amount: B(pick([180, 350, 600])), accountId: 'acc_bank', categoryId: 'cat_fun', note: pick(['Steam', 'หนัง', 'เติมเกม']) });
      if (rnd() < 0.03) tx({ type: 'expense', amount: B(pick([120, 250])), accountId: 'acc_cash', categoryId: 'cat_health', note: 'ยา' });
    }
  }
}
