// NEXUS PWA — all views. Engine = ../src (same code + tests as the CLI).
import { NexusService } from '../src/service.js';
import type { Transaction, Category, Account, Bill, Goal } from '../src/types.js';
import { parseBaht } from '../src/money.js';
import { defaultData } from '../src/seed.js';
import { addMonths, cycleFor, daysBetween, parseDate, toDateStr, type DateRange } from '../src/dates.js';
import { LocalStorageStore, safeStorage } from './browser-store.js';
import { catIcon, accIcon, ICON_CHOICES } from './icons.js';
import { loadDemo } from './demo.js';
import * as U from './ui.js';

const { $, $$, esc, ic, baht } = U;
const APP_VERSION = '3.0.0';

// ------------------------------------------------------------------ boot
const storage = safeStorage();
const store = new LocalStorageStore(storage.ls);
const firstRun = !store.exists();
const svc = new NexusService(store);
let prefs = U.loadPrefs();
U.applyTheme(prefs);
U.setHaptics(prefs.haptics);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => U.applyTheme(prefs));
const setPrefs = (p: Partial<U.Prefs>) => { prefs = { ...prefs, ...p }; U.savePrefs(prefs); };

type Route = { page: string; sub?: string };
const st = {
  ledger: { offset: 0, type: 'all' as 'all' | Transaction['type'], q: '', voided: false },
  catTab: 'expense' as Category['kind'],
  taxBasis: 'projected' as 'projected' | 'actual',
  taxYear: Number(svc.today().slice(0, 4)),
};
let installEvt: any = null;

// ------------------------------------------------------------------ helpers
function maps() {
  const cats = new Map(svc.getCategories(true).map(c => [c.id, c]));
  const accs = new Map(svc.getAccounts(true).map(a => [a.id, a]));
  return { cats, accs };
}
const nextDay = (d: string) => { const p = parseDate(d); return new Date(Date.UTC(p.y, p.m - 1, p.d + 1)).toISOString().slice(0, 10); };
const prevDay = (d: string) => { const p = parseDate(d); return new Date(Date.UTC(p.y, p.m - 1, p.d - 1)).toISOString().slice(0, 10); };
const lastDay = (r: DateRange) => prevDay(r.to);
function cycleAt(offset: number): DateRange {
  const base = cycleFor(svc.today(), svc.getSettings().cycleStartDay);
  if (!offset) return base;
  const p = parseDate(base.from);
  const m = addMonths(p.y, p.m, offset);
  return cycleFor(toDateStr(m.y, m.m, Math.min(p.d, 28)), svc.getSettings().cycleStartDay);
}
const cycleLabel = (r: DateRange) => `${U.dShort(r.from)} – ${U.dMed(lastDay(r))}`;
/** Run an action; on error show it and return false. */
function tryDo(fn: () => unknown): boolean {
  try { fn(); return true; } catch (e) { U.toast((e as Error).message, { error: true }); U.buzz(40); return false; }
}
function guard<T>(fn: () => T): T | undefined {
  try { return fn(); } catch (e) { U.toast((e as Error).message, { error: true }); U.buzz(40); return undefined; }
}
/** Section header (spec 3): Thai h2 + tracked EN label, optional counter chip and link. `code` keeps v2's
 *  "02 BUDGET" style ids; only the words are shown. `icon` is kept for call-site compatibility. */
const secH = (code: string, title: string, _icon: string, link?: { href: string; label: string }, counter?: { text: string; sr: string }) => `
  <div class="sec-h"><div class="tt"><h2>${esc(title)}</h2><span class="sec-en" aria-hidden="true">${esc(code.replace(/^\d+\s+/, ''))}</span></div>
    ${counter ? `<span class="chip-y"><span aria-hidden="true">${esc(counter.text)}</span><span class="sr">${esc(counter.sr)}</span></span>` : ''}
    ${link ? `<a class="link" href="${link.href}">${esc(link.label)}${ic('chevron')}</a>` : ''}</div>`;

/** Empty state (spec 4.9, Decision 7): hatched box, EN heading (decorative), Thai title + description. */
const emptyBox = (en: string, title: string, desc = '', action = '') =>
  `<div class="empty"><span class="empty-en" aria-hidden="true">${en}</span><b>${title}</b>${desc ? `<span>${desc}</span>` : ''}${action}</div>`;

/** Chip on warn / neg notices (spec 4.10); the Thai sentence beside it carries the meaning. */
const noteChip = (kind: 'warn' | 'neg') => `<span class="schip ${kind}" aria-hidden="true">${kind === 'neg' ? 'ALERT' : 'WARN'}</span>`;

/** Numeral with the unit after it (spec 4.3): <n>int<dec>.xx</dec></n><cur>฿</cur> */
function numCur(satang: number, unit = '฿') {
  const p = U.bahtParts(satang);
  return `<span class="n">${p.neg ? '−' : ''}${p.int}${p.dec ? `<span class="dec">${p.dec}</span>` : ''}</span><span class="cur">${unit}</span>`;
}
/** Status chip: the English word is visual, the Thai meaning is read out (spec 7: never colour alone). */
/** Decision 12: nothing recorded yet — no transactions and every account balance is zero. */
const isNoData = () => svc.snapshot().transactions.length === 0 && svc.getAccounts().every(a => a.balance === 0);
const statusChip = (cls: 'pos' | 'warn' | 'neg' | 'info' | 'none', en: string, th: string) =>
  `<span class="schip ${cls}"><span aria-hidden="true">${en}</span><span class="sr">${esc(th)}</span></span>`;

function txRow(t: Transaction, m = maps()) {
  const c = t.categoryId ? m.cats.get(t.categoryId) : undefined;
  const a = m.accs.get(t.accountId);
  const to = t.toAccountId ? m.accs.get(t.toAccountId) : undefined;
  let icon = 'transfer', name = '', sub = '', amt = '', cls = '';
  if (t.type === 'transfer') {
    name = t.goalId ? `ออม · ${esc(svc.snapshot().goals.find(g => g.id === t.goalId)?.name ?? 'เป้าหมาย')}` : esc(t.note || 'โอนระหว่างบัญชี');
    sub = `${esc(a?.name)} → ${esc(to?.name)}`;
    amt = baht(t.amount); cls = 'muted';
  } else {
    icon = c ? catIcon(c) : 'other';
    name = esc(t.note || c?.name || '—');
    sub = `${esc(t.note ? c?.name ?? '' : '')}${t.note ? ' · ' : ''}${esc(a?.name)}`;
    amt = t.type === 'income' ? baht(t.amount, { sign: true }) : '−' + baht(t.amount);
    cls = t.type === 'income' ? 'pos' : '';
  }
  return `<button class="row ${t.voided ? 'voided' : ''}" data-tx="${t.id}">
    <span class="ic ${t.type === 'income' ? 'in' : ''}">${ic(icon)}</span>
    <span class="mid"><span class="n">${name}${t.source === 'ai' ? '<span class="badge-ai">AI</span>' : ''}</span><span class="s">${sub}${t.voided ? ' · ยกเลิกแล้ว' : ''}</span></span>
    <span class="amt ${cls}">${amt}</span></button>`;
}

// ------------------------------------------------------------------ shell
const NAV = [
  { page: 'home', label: 'หน้าหลัก', icon: 'homeNav' },
  { page: 'ledger', label: 'รายการ', icon: 'list' },
  { page: 'add', label: 'จด', icon: 'plus' },
  { page: 'plan', label: 'แผน', icon: 'plan' },
  { page: 'more', label: 'เพิ่มเติม', icon: 'more' },
];
function shell() {
  document.body.innerHTML = `
  <a class="sr" href="#view">ข้ามไปเนื้อหา</a>
  <div class="shell">
    <nav class="rail" aria-label="เมนูหลัก">
      <div class="brand">NEXUS</div><div class="brand-sub">FINANCE OS</div>
      <button class="add" data-act="add">${ic('plus')}<span>จด</span></button>
      ${NAV.filter(n => n.page !== 'add').map(n => `<a href="#${n.page}" data-nav="${n.page}">${ic(n.icon)}<span>${n.label}</span></a>`).join('')}
      <a href="#more-tax" data-nav="tax">${ic('tax')}<span>ภาษี</span></a>
      <div class="grow"></div><div class="vtext" aria-hidden="true">OVER THE MONTH / INTO THE BLACK</div>
    </nav>
    <div class="main">
      <header class="topbar"><div class="wrap" id="topbar"></div></header>
      <div id="demo"></div>
      <main class="wrap" id="view" tabindex="-1"></main>
    </div>
  </div>
  <nav class="nav" aria-label="เมนูหลัก">
    ${NAV.map(n => n.page === 'add'
      ? `<button class="fab" data-act="add" aria-label="จดรายการใหม่">${ic('plus')}</button>`
      : `<a href="#${n.page}" data-nav="${n.page}">${ic(n.icon)}<span>${n.label}</span></a>`).join('')}
  </nav>`;
}

function route(): Route {
  const [page = 'home', sub] = location.hash.replace(/^#\/?/, '').split(/[\/-]/);
  return { page: page || 'home', sub };
}

function render() {
  const r = route();
  const navKey = r.page === 'more' && r.sub === 'tax' ? 'tax' : r.page;
  $$('[data-nav]').forEach(a => a.getAttribute('data-nav') === navKey ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  // mobile nav: tax lives under "more"
  $$('.nav [data-nav]').forEach(a => { if (a.getAttribute('data-nav') === 'more' && r.page === 'more') a.setAttribute('aria-current', 'page'); });
  $('#demo')!.innerHTML = prefs.demo ? `<div class="demo-bar"><div class="in"><b>โหมดตัวอย่าง</b><span>ข้อมูลสมมติ ลองกดเล่นได้เลย</span><button data-act="end-demo">เริ่มใช้จริง</button></div></div>` : '';
  const views: Record<string, () => [string, string]> = {
    home: viewHome, ledger: viewLedger, plan: () => viewPlan(r.sub), more: () => viewMore(r.sub),
  };
  const [head, body] = (views[r.page] ?? viewHome)();
  $('#topbar')!.innerHTML = systemStrip();
  $('#view')!.innerHTML = head + body;
  // Motion (spec 5): stagger in only when the route changes — never on same-page re-renders
  // (saving an entry, visibilitychange, storage sync, ledger cycle paging).
  const key = `${r.page}/${r.sub ?? ''}`;
  if (key !== lastRouteKey) { staggerIn($('#view')!); lastRouteKey = key; }
  afterRender(r);
}
let lastRouteKey = '';
/** Give each top-level block `.st` and `--i` (capped at 14). Layout wrappers (.home-grid, .two) are looked through. */
function staggerIn(view: HTMLElement) {
  const items: HTMLElement[] = [];
  for (const el of Array.from(view.children) as HTMLElement[]) {
    if (el.matches('.home-grid, .two')) for (const col of Array.from(el.children)) items.push(...(Array.from(col.children) as HTMLElement[]));
    else items.push(el);
  }
  items.forEach((el, i) => { el.classList.add('st'); el.style.setProperty('--i', String(Math.min(i, 14))); });
}

// System strip (spec 4.1): tri-colour mark + NEXUS // FINANCE OS · date and time in Bangkok, Gregorian year.
const bkkTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const stripStamp = () => `${svc.today().replace(/-/g, '.')} · ${bkkTime()}`;
const systemStrip = () => `<div class="sys-l"><i class="tri-v" aria-hidden="true"></i><span class="sys">NEXUS // FINANCE OS</span></div>
  <span class="sys" id="sys-clock">${stripStamp()}</span>`;
setInterval(() => { const c = $('#sys-clock'); if (c) c.textContent = stripStamp(); }, 20000);

const MON_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/**
 * Module header (spec 4.2, Decision 8): breadcrumb + hatch tail, Thai <h1> + EN subtitle,
 * yellow lead → ticked rule → optional counter chip. Sub-pages get a back link before the breadcrumb.
 */
function moduleHeader(o: { crumb: string; th: string; en: string; counter?: string; back?: string }) {
  return `<header class="mh">
    <div class="mh-crumb">${o.back ? `<a class="icon-btn mh-back" href="${o.back}" aria-label="กลับ">${ic('back')}</a>` : ''}<span aria-hidden="true">// NEXUS / ${esc(o.crumb)}</span><i class="mh-hatch" aria-hidden="true"></i></div>
    <div class="mh-title"><h1 tabindex="-1">${esc(o.th)}</h1><span class="mh-en" aria-hidden="true">${esc(o.en)}</span></div>
    <div class="mh-rule" aria-hidden="true"><i class="lead"></i><i class="tk"></i>${o.counter ? `<span class="chip-y">${esc(o.counter)}</span>` : ''}</div>
  </header>`;
}

// ------------------------------------------------------------------ HOME
function viewHome(): [string, string] {
  const today = svc.today();
  const s = svc.getSafeToSpend();
  const m = maps();
  const todayTx = svc.getTransactions({ from: today, to: nextDay(today) });
  const todayExp = todayTx.filter(t => t.type === 'expense' && !t.billId && !t.goalId).reduce((a, t) => a + t.amount, 0);
  const dayBudget = Math.floor((s.safeToSpend + todayExp) / s.daysLeft / 100) * 100;
  const leftToday = dayBudget - todayExp;
  const bad = s.shortfall > 0;
  const p = U.bahtParts(s.safeToSpend);
  const base = Math.max(s.available, s.reserved.total, 1);
  const w = (v: number) => `${Math.max(0, (v / base) * 100).toFixed(2)}%`;
  const elapsed = (daysBetween(s.cycle.from, today) + 1) / daysBetween(s.cycle.from, s.cycle.to);

  // NEAR LIMIT (Decision 2): total budget used faster than the cycle has elapsed (+10%), or today over its share.
  const bud = svc.getBudgets();
  const plannedAll = bud.lines.reduce((a, l) => a + l.plan, 0), spentAll = bud.lines.reduce((a, l) => a + l.spent, 0);
  const budgetFast = plannedAll > 0 && (spentAll / plannedAll) * 100 > elapsed * 100 + 10;
  const near = !bad && (budgetFast || leftToday < 0);
  const noData = isNoData();
  const chip = noData ? statusChip('none', 'NO DATA', 'สถานะ: ยังไม่มีข้อมูล')
    : bad ? statusChip('neg', 'SHORTFALL', 'สถานะ: เงินไม่พอ')
    : near ? statusChip('warn', 'NEAR LIMIT', 'สถานะ: ใกล้เกินงบ')
    : statusChip('pos', 'ON TRACK', 'สถานะ: ตามแผน');
  const todayPct = dayBudget ? Math.min(100, (todayExp / dayBudget) * 100) : todayExp ? 100 : 0;

  const hero = svc.getSettings().incomeMode === 'none' ? heroRunway(todayExp) : `
  <section class="hero ${bad ? 'bad' : near ? 'near' : ''}" aria-labelledby="sts-l">
    <div class="hero-top"><span class="hl" id="sts-l"><span aria-hidden="true">SAFE TO SPEND · </span><span class="th">${bad ? 'เงินไม่พอสำหรับสิ่งที่กันไว้' : 'ใช้ได้อีกในรอบนี้'}</span></span>${chip}</div>
    <div class="hero-amt ${bad ? 'neg' : ''}" aria-live="polite">${bad ? numCur(-s.shortfall) : numCur(s.safeToSpend)}</div>
    <div class="hero-sub">${bad ? `ขาดอยู่ <b class="neg">${baht(s.shortfall)}</b> — ลองเลื่อนการออมหรือลดค่าใช้จ่าย` : `เฉลี่ย <b>${baht(s.perDay)}</b>/วัน · อีก <b>${s.daysLeft}</b> วัน`} · รอบ ${esc(cycleLabel(s.cycle))}${budgetFast && !bad ? ' · <span class="warn">งบรวมใช้เร็วกว่าแผน</span>' : ''}</div>
    ${noData ? '' : `<div class="cap">
      <div class="cap-bar" role="img" aria-label="เงินที่มี ${baht(s.available)} แบ่งเป็นใช้ได้ ${baht(s.safeToSpend)} บิล ${baht(s.reserved.bills)} ออม ${baht(s.reserved.goals)} ภาษี ${baht(s.reserved.tax)}">
        ${s.safeToSpend ? `<i class="free" style="width:${w(s.safeToSpend)}"></i>` : ''}
        ${s.reserved.bills ? `<i class="lock l1" style="width:${w(s.reserved.bills)}"></i>` : ''}
        ${s.reserved.goals ? `<i class="lock l2" style="width:${w(s.reserved.goals)}"></i>` : ''}
        ${s.reserved.tax ? `<i class="lock l3" style="width:${w(s.reserved.tax)}"></i>` : ''}
      </div>
      <div class="cap-legend">
        <span><i class="sw free" aria-hidden="true"></i>ใช้ได้ ${baht(s.safeToSpend)}</span>
        <span><i class="sw l1" aria-hidden="true"></i>บิล ${baht(s.reserved.bills)}</span>
        <span><i class="sw l2" aria-hidden="true"></i>ออม ${baht(s.reserved.goals)}</span>
        <span><i class="sw l3" aria-hidden="true"></i>ภาษี ${baht(s.reserved.tax)}</span>
      </div>
    </div>`}
    <div class="today">
      <div class="t-top"><span class="hl"><span aria-hidden="true">TODAY · </span><span class="th">${leftToday < 0 ? 'ใช้เกินวันนี้' : 'วันนี้เหลือ'}</span></span><span class="t-val ${leftToday < 0 ? 'over' : ''}">${numCur(leftToday)}</span></div>
      <div class="t-bar" aria-hidden="true"><i class="${leftToday < 0 ? 'over' : ''}" style="width:${todayPct}%"></i></div>
      <div class="t-foot"><span>ใช้ ${baht(todayExp)}</span><span>/ ${baht(dayBudget)}</span></div>
    </div>
  </section>`;

  // stat tiles (spec 4.4, Decision 5): engine numbers only
  const accsAll = svc.getAccounts();
  const balTotal = accsAll.reduce((a, x) => a + x.balance, 0);
  const balSpend = accsAll.filter(a => a.spendable).reduce((a, x) => a + x.balance, 0);
  const cf = svc.getCashFlow(2);
  const cfPrev = cf[0]!, cfNow = cf[1]!;
  const dNet = cfNow.net - cfPrev.net;
  const stats = `
  <section class="stats" aria-label="สรุปยอดเงิน">
    <div class="stat"><span class="ml"><span aria-hidden="true">TOTAL BALANCE</span><span class="th">ยอดรวม</span></span>
      <span class="sv ${balTotal < 0 ? 'neg' : ''}">${numCur(balTotal)}</span>
      <span class="sl">ใช้จ่ายได้ ${baht(balSpend)}<br>ออม ${baht(balTotal - balSpend)}</span></div>
    <div class="stat"><span class="ml"><span aria-hidden="true">NET</span><span class="th">สุทธิเดือนนี้</span></span>
      <span class="sv ${cfNow.net < 0 ? 'neg' : ''}">${numCur(cfNow.net)}</span>
      <span class="sl ${dNet > 0 ? 'pos' : dNet < 0 ? 'neg' : ''}">${dNet ? `<span aria-hidden="true">${dNet > 0 ? '▲' : '▼'} </span><span class="sr">${dNet > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} </span>${baht(Math.abs(dNet))} จากเดือนก่อน` : 'เท่ากับเดือนก่อน'}</span></div>
  </section>`;

  // notices
  const notes: string[] = [];
  const overdue = s.unpaidBills.filter(b => b.due < today);
  for (const b of overdue.slice(0, 2)) notes.push(`<div class="notice neg">${noteChip('neg')}<span><b>${esc(b.name)}</b> เลยกำหนด ${-daysBetween(today, b.due)} วัน · ${baht(b.amount)}</span><button class="act" data-pay="${b.billId}">จ่ายแล้ว</button></div>`);
  const txCount = svc.snapshot().transactions.length;
  const lastB = prefs.lastBackup;
  if (!prefs.demo && txCount >= 15 && (!lastB || daysBetween(lastB, today) > 14)) {
    notes.push(`<div class="notice warn">${noteChip('warn')}<span>${lastB ? `สำรองข้อมูลล่าสุด ${daysBetween(lastB, today)} วันก่อน` : 'ยังไม่เคยสำรองข้อมูล'} — ข้อมูลอยู่ในเครื่องนี้เท่านั้น</span><a class="act" href="#more-backup">สำรอง</a></div>`);
  }
  if (installEvt && !prefs.dismissInstall) notes.push(`<div class="notice">${ic('phone')}<span>ติดตั้ง NEXUS เป็นแอป เปิดได้จากหน้าจอหลัก ใช้ได้แม้ออฟไลน์</span><button class="act" data-act="install">ติดตั้ง</button></div>`);

  if (!storage.persistent) notes.unshift(`<div class="notice neg">${noteChip('neg')}<span>เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล — ข้อมูลจะหายเมื่อปิดหน้านี้</span></div>`);
  // bills
  const cycleBills = svc.getUpcomingBills();
  const bills = billOrder(cycleBills).slice(0, 4);
  const billsHtml = svc.getBills().filter(b => b.active).length === 0
    ? emptyBox('NO BILLS', 'ยังไม่มีบิลประจำ', 'เพิ่มค่าห้อง ค่าเน็ต Subscription เพื่อให้ "ใช้ได้" แม่นขึ้น', `<a class="btn sm" href="#plan-bills">เพิ่มบิล</a>`)
    : bills.length === 0 ? emptyBox('NO BILLS DUE', 'ไม่มีบิลในรอบนี้')
    : `<div class="plates">${bills.map(b => billRow(b, today)).join('')}</div>`;

  // budgets
  const lines = [...bud.lines].sort((a, b) => b.percentUsed - a.percentUsed).slice(0, 4);
  const budHtml = lines.length === 0
    ? emptyBox('NO BUDGET', 'ยังไม่ได้ตั้งงบ', 'แนะนำให้จดอย่างเดียวสัก 2–4 สัปดาห์ แล้วค่อยตั้งงบจากตัวเลขจริง', `<a class="btn sm" href="#plan">ไปที่แผน</a>`)
    : `<div class="card rows">${lines.map(l => budRow(l, elapsed)).join('')}</div>`;

  // recent
  const recent = svc.getTransactions({ limit: 6 });
  const recentHtml = recent.length === 0
    ? emptyBox('NO ENTRIES', 'ยังไม่มีรายการ', 'กดปุ่ม + สีเหลืองเพื่อจดรายการแรก', `<button class="btn primary" data-act="add">${ic('plus')}จดรายการ</button>`)
    : `<div class="card rows">${recent.map(t => txRow(t, m)).join('')}</div>`;

  // goals
  const goals = svc.getGoals().slice(0, 3);
  const goalsHtml = goals.length ? `<div class="goals">${goals.map(g => goalCard(g)).join('')}</div>` : '';

  const body = `
  <div class="home-grid">
    <div>
      ${hero}
      ${stats}
      ${notes.join('')}
      <div class="sec">${secH('02 BUDGET', 'งบรอบนี้', 'tag', { href: '#plan', label: 'ทั้งหมด' })}${budHtml}</div>
    </div>
    <div>
      <div class="sec">${secH('03 UPCOMING', 'บิลที่ต้องจ่าย', 'calendar', { href: '#plan-bills', label: 'จัดการ' }, cycleBills.length ? { text: `${s.unpaidBills.length} / ${cycleBills.length}`, sr: `ค้างจ่าย ${s.unpaidBills.length} จาก ${cycleBills.length} บิลในรอบนี้` } : undefined)}${billsHtml}</div>
      <div class="sec">${secH('04 RECENT', 'ล่าสุด', 'list', { href: '#ledger', label: 'ดูทั้งหมด' })}${recentHtml}</div>
      ${goalsHtml ? `<div class="sec">${secH('05 GOALS', 'เป้าหมาย', 'target', { href: '#plan-goals', label: 'จัดการ' })}${goalsHtml}</div>` : ''}
    </div>
  </div>`;
  return [moduleHeader({ crumb: 'HOME', th: 'ภาพรวม', en: 'OVERVIEW', counter: MON_EN[Number(today.slice(5, 7)) - 1] }), body];
}

function heroRunway(todayExp: number) {
  const r = svc.getRunway();
  const short = r.days !== null && r.days < 30;
  const dayLabel = r.days === null ? '—' : r.days > 999 ? '999+' : String(r.days);
  const avg = r.flexiblePerDay;
  const meter = avg ? Math.min(100, (todayExp / avg) * 100) : todayExp ? 100 : 0;
  const over = !!avg && todayExp > avg;
  const chip = r.days === null ? (isNoData() ? statusChip('none', 'NO DATA', 'สถานะ: ยังไม่มีข้อมูล') : '')
    : short ? statusChip('warn', 'SHORT RUNWAY', 'สถานะ: เงินพอใช้น้อยกว่า 30 วัน')
    : statusChip('pos', 'ON TRACK', 'สถานะ: เงินพอใช้เกิน 30 วัน');
  return `
  <section class="hero ${short ? 'near' : ''}" aria-labelledby="rw-l">
    <div class="hero-top"><span class="hl" id="rw-l"><span aria-hidden="true">RUNWAY · </span><span class="th">เงินใช้จ่ายที่มี พอใช้อีกประมาณ</span></span>${chip}</div>
    <div class="hero-amt" aria-live="polite"><span class="n">${dayLabel}</span><span class="cur unit">วัน</span></div>
    <div class="hero-sub">${r.days === null ? 'จดรายจ่ายสักพัก แล้วระบบจะคำนวณให้' : `ถึงประมาณ <b>${U.dMed(r.runOutDate!)}</b> · ใช้เฉลี่ย <b>${baht(r.burnPerDay)}</b>/วัน`} · เฉลี่ยจาก ${r.daysObserved} วันล่าสุด</div>
    ${r.lowData && r.days !== null ? `<div class="notice">${ic('alert')}<span>ข้อมูลยังน้อย (${r.daysObserved} วัน) ตัวเลขจะนิ่งขึ้นเมื่อจดครบ 2 สัปดาห์</span></div>` : ''}
    <div class="rows hero-kv">
      <div class="kv"><span class="k">เงินใช้จ่ายตอนนี้</span><span class="v">${baht(r.spendable)}</span></div>
      <div class="kv"><span class="k">ใช้ทั่วไปเฉลี่ย / วัน</span><span class="v">${baht(r.flexiblePerDay)}</span></div>
      <div class="kv"><span class="k">บิลประจำ / วัน</span><span class="v">${baht(r.billsPerDay)}</span></div>
      ${r.withSavings !== r.spendable ? `<div class="kv"><span class="k">ถ้ารวมเงินออม (${baht(r.withSavings)})</span><span class="v">${r.daysWithSavings === null ? '—' : r.daysWithSavings + ' วัน'}</span></div>` : ''}
      ${r.incomeInWindow ? `<div class="kv"><span class="k">ได้รับเข้ามาใน ${r.daysObserved} วัน</span><span class="v pos">${baht(r.incomeInWindow, { sign: true })}</span></div>` : ''}
    </div>
    <div class="today">
      <div class="t-top"><span class="hl"><span aria-hidden="true">TODAY · </span><span class="th">วันนี้ใช้ไป</span></span><span class="t-val ${over ? 'over' : ''}">${numCur(todayExp)}</span></div>
      <div class="t-bar" aria-hidden="true"><i class="${over ? 'over' : ''}" style="width:${meter}%"></i></div>
      <div class="t-foot"><span>เทียบค่าเฉลี่ย</span><span>${baht(avg)}/วัน</span></div>
    </div>
  </section>`;
}

/** Decision 10: unpaid bills first by due date, then paid ones (by due date). */
const billOrder = <T extends { paid: boolean; due: string }>(xs: T[]) =>
  [...xs].sort((a, b) => Number(a.paid) - Number(b.paid) || a.due.localeCompare(b.due));

/** Set by payBill() so the next render plays the pending → paid flip on that plate once. */
let justPaid: string | null = null;

/** Bill plate (spec 4.5): light body + angled side with amount and pay button.
 *  Paid (Decision 10): dark body, calm grey side with yellow check and PAID mark; flips through yellow once after paying. */
function billRow(b: { billId: string; name: string; amount: number; due: string; paid: boolean }, today: string) {
  const p = parseDate(b.due);
  const n = daysBetween(today, b.due);
  const dd = `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}`;
  const soon = !b.paid && n <= 1;
  const amt = U.bahtParts(b.amount);
  return `<div class="plate ${b.paid ? 'paid' : ''} ${b.paid && justPaid === b.billId ? 'flip' : ''}">
    <div class="pl-body"><span class="pl-n">${esc(b.name)}</span>
      <span class="pl-d"><span aria-hidden="true">${b.paid ? 'PAID' : 'DUE'} · </span>${b.paid ? 'จ่ายแล้ว' : esc(U.relDays(n))} · ${dd}</span></div>
    <div class="pl-side">${b.paid ? '<span class="pl-wm" aria-hidden="true">PAID</span>' : ''}
      <span class="pl-amt">${amt.int}${amt.dec ? `<small>${amt.dec}</small>` : ''}<span class="sr"> บาท</span></span>
      ${b.paid ? `<span class="pl-ok" role="img" aria-label="จ่ายแล้ว"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9l5-6"/></svg></span>`
        : `<button class="pl-pay" data-pay="${b.billId}" aria-label="บันทึกว่าจ่าย ${esc(b.name)} แล้ว">จ่าย</button>`}
    </div>
    ${soon ? '<i class="pl-dia" aria-hidden="true"></i><span class="sr">ใกล้ครบกำหนด</span>' : ''}
  </div>`;
}

const GOAL_STATUS: Record<string, { en: string; th: string; cls: 'pos' | 'warn' | '' }> = {
  done: { en: 'DONE', th: 'สำเร็จ', cls: 'pos' },
  ahead: { en: 'AHEAD', th: 'เร็วกว่าแผน', cls: 'pos' },
  on_track: { en: 'ON TRACK', th: 'ตามแผน', cls: 'pos' },
  behind: { en: 'BEHIND', th: 'ช้ากว่าแผน', cls: 'warn' },
  no_plan: { en: 'NO PLAN', th: 'ยังไม่ตั้งยอดออม', cls: '' },
};
/** Goal card (spec 4.6): L corner, name + saved / target, 4px bar, mono ETA from calculateGoals. `full` adds Plan's details. */
function goalCard(g: ReturnType<typeof svc.getGoals>[number], full = false) {
  const raw = svc.snapshot().goals.find(x => x.id === g.goalId)!;
  const st = GOAL_STATUS[g.status]!;
  const eta = g.status === 'done' ? 'DONE' : g.projectedDate ? `ETA · ${U.dMed(g.projectedDate)}` : 'ETA · —';
  const inner = `<i class="gc-l" aria-hidden="true"></i>
    <div class="gc-top"><span class="gc-n">${esc(g.name)}</span><span class="gc-v">${numCur(g.saved)}<span class="gc-t"> / ${baht(g.target)}</span></span></div>
    <div class="gc-bar" role="img" aria-label="ออมแล้ว ${g.percent}%"><i style="width:${g.percent}%"></i></div>
    <div class="gc-eta"><span>${eta}${raw.monthlyContribution && g.status !== 'done' ? ` ถ้าเก็บเดือนละ ${baht(raw.monthlyContribution)}` : ''}</span><span>${g.percent}% · ${st.th}</span></div>`;
  if (!full) return `<a class="goalc" href="#plan-goals">${inner}</a>`;
  return `<div class="goalc">${inner}
    ${st.cls ? `<span class="schip ${st.cls} gc-chip" aria-hidden="true">${st.en}</span>` : ''}
    ${g.neededPerMonth && g.status === 'behind' ? `<div class="gc-eta"><span class="warn">ต้องออมเดือนละ ${baht(g.neededPerMonth)} ถึงจะทัน ${U.dMed(raw.targetDate!)}</span></div>` : ''}
    <div class="acts"><button class="btn primary sm" data-contrib="${g.goalId}" style="flex:1">${ic('plus')}ออมเพิ่ม</button><button class="btn sm" data-goal="${g.goalId}">แก้ไข</button></div>
  </div>`;
}

function budRow(l: { categoryId: string; name: string; plan: number; spent: number; remaining: number; percentUsed: number; over: boolean }, elapsed: number) {
  const cls = l.over ? 'over' : l.percentUsed > elapsed * 100 + 10 ? 'warn' : '';
  return `<button class="bud" data-plan="${l.categoryId}">
    <div class="top"><span class="n">${esc(l.name)}</span><span class="v">${baht(l.spent)} <span>/ ${baht(l.plan)}</span></span></div>
    <div class="seg" role="img" aria-label="ใช้ไป ${Math.round(l.percentUsed)}%"><i class="${cls}" style="width:${Math.min(100, l.percentUsed)}%"></i></div>
    <div class="bot"><span class="${cls === 'over' ? 'neg' : cls === 'warn' ? 'warn' : ''}">${l.over ? `เกินงบ ${baht(-l.remaining)}` : `เหลือ ${baht(l.remaining)}`}</span><span>${Math.round(l.percentUsed)}%${cls === 'warn' ? ' · ใช้เร็วกว่าแผน' : ''}</span></div></button>`;
}

// ------------------------------------------------------------------ LEDGER
function viewLedger(): [string, string] {
  const L = st.ledger;
  const cyc = cycleAt(L.offset);
  const all = svc.getTransactions({ from: cyc.from, to: cyc.to });
  const inc = all.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const exp = all.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const body = `
  <div class="sec" style="margin-top:16px">
    <div style="display:flex;align-items:center;gap:6px">
      <button class="icon-btn" data-cyc="-1" aria-label="รอบก่อนหน้า">${ic('back')}</button>
      <div style="flex:1;text-align:center"><div class="micro" aria-hidden="true">CYCLE ${L.offset === 0 ? 'NOW' : (L.offset > 0 ? '+' : '') + L.offset}</div><div style="font-weight:600">${esc(cycleLabel(cyc))}</div></div>
      <button class="icon-btn" data-cyc="1" aria-label="รอบถัดไป" ${L.offset >= 0 ? 'disabled style="opacity:.3"' : ''}><span style="display:block;transform:scaleX(-1)">${ic('back')}</span></button>
    </div>
    <div class="tiles" style="margin-top:8px">
      <div class="tile"><div class="l">รายรับ</div><div class="v pos">${baht(inc)}</div></div>
      <div class="tile"><div class="l">รายจ่าย</div><div class="v">${baht(exp)}</div></div>
      <div class="tile"><div class="l">คงเหลือ</div><div class="v ${inc - exp < 0 ? 'neg' : ''}">${inc - exp < 0 ? '−' + baht(exp - inc) : baht(inc - exp)}</div></div>
    </div>
  </div>
  <div class="sec">${secH('CASH FLOW', 'กระแสเงิน 6 เดือน', 'arrowDR')}<div class="card chart" id="chart" style="position:relative"></div></div>
  <div class="sec">
    ${secH('LEDGER', 'รายการในรอบ', 'list')}
    <div class="search"><span aria-hidden="true">${ic('search')}</span><input id="q" type="search" placeholder="ค้นหาโน้ตหรือหมวด" value="${esc(L.q)}" aria-label="ค้นหารายการ" autocomplete="off"></div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
      <div class="segctl" style="flex:1;min-width:240px" role="group" aria-label="ประเภท">
        ${(['all', 'expense', 'income', 'transfer'] as const).map(k => `<button data-ltype="${k}" aria-pressed="${L.type === k}">${{ all: 'ทั้งหมด', expense: 'จ่าย', income: 'รับ', transfer: 'โอน' }[k]}</button>`).join('')}
      </div>
      <label class="check" style="font-size:13px"><input type="checkbox" id="showv" ${L.voided ? 'checked' : ''}>แสดงที่ยกเลิก</label>
    </div>
    <div id="ledger-list" style="margin-top:8px"></div>
  </div>`;
  return [moduleHeader({ crumb: 'LEDGER', th: 'รายการ', en: 'TRANSACTIONS' }), body];
}

function renderLedgerList() {
  const L = st.ledger;
  const cyc = cycleAt(L.offset);
  const txs = svc.getTransactions({ from: cyc.from, to: cyc.to, includeVoided: L.voided, type: L.type === 'all' ? undefined : L.type, text: L.q || undefined });
  const el = $('#ledger-list');
  if (!el) return;
  if (!txs.length) { el.innerHTML = L.q ? emptyBox('NO MATCH', 'ไม่พบรายการ', 'ลองคำอื่น') : emptyBox('NO ENTRIES', 'ยังไม่มีรายการในรอบนี้'); return; }
  const m = maps();
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) { const g = groups.get(t.date) ?? []; g.push(t); groups.set(t.date, g); }
  el.innerHTML = [...groups].map(([d, ts]) => {
    const out = ts.filter(t => t.type === 'expense' && !t.voided).reduce((a, t) => a + t.amount, 0);
    return `<div class="day-h"><b>${esc(U.dHeader(d, svc.today()))}</b><span>${out ? 'จ่าย ' + baht(out) : ''}</span></div><div class="card rows">${ts.map(t => txRow(t, m)).join('')}</div>`;
  }).join('');
}

function renderChart() {
  const el = $('#chart');
  if (!el) return;
  const data = svc.getCashFlow(6);
  const W = 600, H = 170, padL = 44, padB = 22, padT = 8;
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense]));
  const nice = (() => { const b = max / 100; const p = Math.pow(10, Math.floor(Math.log10(b))); const n = [1, 2, 2.5, 5, 10].find(x => x * p >= b)! * p; return n * 100; })();
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const slot = (W - padL) / data.length, bw = Math.min(22, slot / 2 - 6);
  const bar = (x: number, v: number, color: string) => {
    if (v <= 0) return '';
    const top = y(v), base = y(0), r = Math.min(4, (base - top) / 2);
    return `<path d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z" fill="${color}"/>`;
  };
  const grid = [0, .5, 1].map(f => `<line x1="${padL}" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}" stroke="var(--line)" ${f ? 'stroke-dasharray="2 4"' : ''}/><text x="${padL - 6}" y="${y(nice * f) + 4}" text-anchor="end" font-size="11" fill="var(--ink-2)" font-family="var(--f-mono)">${U.bahtCompact(nice * f)}</text>`).join('');
  const bars = data.map((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const mo = Number(d.month.slice(5));
    return `${bar(cx - bw - 1, d.income, 'var(--chart-in)')}${bar(cx + 1, d.expense, 'var(--chart-out)')}
      <text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="11.5" fill="var(--ink-2)">${U.MON[mo - 1]}</text>
      <rect x="${padL + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent" data-i="${i}" style="cursor:pointer"/>`;
  }).join('');
  el.innerHTML = `<div class="chart-legend"><span><i style="background:var(--chart-in)"></i>รายรับ</span><span><i style="background:var(--chart-out)"></i>รายจ่าย</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="รายรับและรายจ่ายรายเดือน 6 เดือนล่าสุด">${grid}${bars}</svg>
    <table class="sr"><caption>กระแสเงินรายเดือน</caption><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th></tr>${data.map(d => `<tr><td>${d.month}</td><td>${baht(d.income)}</td><td>${baht(d.expense)}</td></tr>`).join('')}</table>
    <div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip') as HTMLElement;
  const svg = el.querySelector('svg')!;
  const show = (i: number) => {
    const d = data[i]!; const mo = Number(d.month.slice(5)); const yr = Number(d.month.slice(0, 4));
    const r = svg.getBoundingClientRect(), er = el.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = `<div style="color:var(--block-ink-2)">${U.MON[mo - 1]} ${U.be(yr)}</div>รับ <b>${baht(d.income)}</b><br>จ่าย <b>${baht(d.expense)}</b><br>สุทธิ <b>${d.net < 0 ? '−' + baht(-d.net) : baht(d.net)}</b>`;
    const x = r.left - er.left + ((padL + slot * i + slot / 2) / W) * r.width;
    tip.style.left = `${Math.min(Math.max(x, 70), er.width - 70)}px`;
    tip.style.top = `${r.top - er.top + 30}px`;
  };
  svg.querySelectorAll('rect[data-i]').forEach(rc => {
    rc.addEventListener('mouseenter', () => show(Number(rc.getAttribute('data-i'))));
    rc.addEventListener('click', () => show(Number(rc.getAttribute('data-i'))));
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; });
}

// ------------------------------------------------------------------ PLAN
function viewPlan(sub = 'budget'): [string, string] {
  const tab = ['budget', 'bills', 'goals'].includes(sub) ? sub : 'budget';
  const tabs = `<div class="segctl" role="tablist" style="margin-top:16px">
    ${[['budget', 'งบ'], ['bills', 'บิลประจำ'], ['goals', 'เป้าหมาย']].map(([k, l]) => `<button role="tab" data-href="#plan-${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>`;
  let body = '';
  const today = svc.today();
  if (tab === 'budget') {
    const bud = svc.getBudgets();
    const s = svc.getSafeToSpend();
    const elapsed = (daysBetween(s.cycle.from, today) + 1) / daysBetween(s.cycle.from, s.cycle.to);
    const planned = bud.lines.reduce((a, l) => a + l.plan, 0), spent = bud.lines.reduce((a, l) => a + l.spent, 0);
    const unplanned = svc.getCategories().filter(c => c.kind === 'expense' && !c.monthlyPlan);
    const prevIncome = (() => { const c = cycleAt(-1); return svc.getTransactions({ from: c.from, to: c.to, type: 'income' }).reduce((a, t) => a + t.amount, 0); })();
    body = `${tabs}
      <div class="tiles" style="margin-top:12px">
        <div class="tile"><div class="l">งบรวม</div><div class="v">${baht(planned)}</div></div>
        <div class="tile"><div class="l">ใช้ไป</div><div class="v">${baht(spent)}</div></div>
        <div class="tile"><div class="l">นอกงบ</div><div class="v">${baht(bud.unplannedSpent)}</div></div>
      </div>
      ${prevIncome ? `<p class="fine" style="margin-top:8px">รายรับรอบก่อน ${baht(prevIncome)} · งบรวม + บิลประจำ = ${baht(planned + monthlyBills())} (${Math.round(((planned + monthlyBills()) / prevIncome) * 100)}% ของรายรับ)</p>` : ''}
      <div class="sec">${secH('PLANNED', 'หมวดที่ตั้งงบ', 'tag')}
        ${bud.lines.length ? `<div class="card rows">${bud.lines.map(l => budRow(l, elapsed)).join('')}</div>` : emptyBox('NO BUDGET', 'ยังไม่มีหมวดที่ตั้งงบ', 'แตะหมวดด้านล่างเพื่อตั้งงบต่อเดือน')}
      </div>
      ${unplanned.length ? `<div class="sec">${secH('UNPLANNED', 'ยังไม่ตั้งงบ', 'plus')}<div class="card rows">${unplanned.map(c => {
        const sp = svc.getTransactions({ from: s.cycle.from, to: s.cycle.to, categoryId: c.id, type: 'expense' }).reduce((a, t) => a + t.amount, 0);
        return `<button class="row" data-plan="${c.id}"><span class="ic">${ic(catIcon(c))}</span><span class="mid"><span class="n">${esc(c.name)}</span><span class="s">รอบนี้ใช้ไป ${baht(sp)}</span></span><span class="muted" style="font-size:13px">ตั้งงบ</span></button>`;
      }).join('')}</div></div>` : ''}
      <p class="fine" style="margin-top:12px">แถบสีส้ม = ใช้เร็วกว่าเวลาที่ผ่านไปของรอบ (ตอนนี้ผ่านไป ${Math.round(elapsed * 100)}%)</p>`;
  } else if (tab === 'bills') {
    const items = svc.getUpcomingBills();
    const all = svc.getBills();
    const subs = all.filter(b => b.active && b.isSubscription);
    body = `${tabs}
      <div class="tiles" style="margin-top:12px;grid-template-columns:1fr 1fr">
        <div class="tile"><div class="l">บิลประจำ / เดือน</div><div class="v">${baht(monthlyBills())}</div></div>
        <div class="tile"><div class="l">Subscription (${subs.length})</div><div class="v">${baht(subs.reduce((a, b) => a + (b.cadence === 'yearly' ? Math.round(b.amount / 12) : b.amount), 0))}</div></div>
      </div>
      <div class="sec">${secH('THIS CYCLE', 'รอบนี้', 'calendar')}
        ${items.length ? `<div class="plates">${billOrder(items).map(b => billRow(b, today)).join('')}</div>` : emptyBox('NO BILLS', 'ไม่มีบิลในรอบนี้')}</div>
      <div class="sec">${secH('ALL BILLS', 'บิลทั้งหมด', 'list')}
        ${all.length ? `<div class="card rows">${all.map(b => `<button class="row" data-bill="${b.id}" ${b.active ? '' : 'style="opacity:.55"'}>
          <span class="ic">${ic(b.isSubscription ? 'subs' : 'calendar')}</span>
          <span class="mid"><span class="n">${esc(b.name)}</span><span class="s">${b.cadence === 'monthly' ? `ทุกวันที่ ${b.dueDay}` : `ทุกปี ${b.dueDay} ${U.MON[(b.dueMonth ?? 1) - 1]}`}${b.active ? '' : ' · ปิดอยู่'}</span></span>
          <span class="amt">${baht(b.amount)}</span></button>`).join('')}</div>` : emptyBox('NO BILLS', 'ยังไม่มีบิล', 'เพิ่มค่าห้อง ค่าเน็ต Subscription เพื่อให้ "ใช้ได้" แม่นขึ้น')}
        <button class="btn block" data-act="new-bill" style="margin-top:10px">${ic('plus')}เพิ่มบิลประจำ</button></div>`;
  } else {
    const gs = svc.getGoals();
    body = `${tabs}
      <div class="sec" style="margin-top:16px"><div class="goals-grid">${gs.map(g => goalCard(g, true)).join('')}</div>
      ${gs.length ? '' : emptyBox('NO GOALS', 'ยังไม่มีเป้าหมาย', 'เช่น เงินสำรองฉุกเฉิน 3–6 เดือนของค่าใช้จ่าย')}
      <button class="btn block" data-act="new-goal" style="margin-top:10px">${ic('plus')}เพิ่มเป้าหมาย</button>
      <p class="fine" style="margin-top:10px">"ออมเพิ่ม" = โอนจากบัญชีใช้จ่ายไปบัญชีเงินออม · ยอดออมรายเดือนถูกกันไว้ใน "ใช้ได้" จนกว่าจะโอนจริง</p></div>`;
  }
  return [moduleHeader({ crumb: 'PLAN', th: 'แผน', en: 'PLAN', counter: `${['budget', 'bills', 'goals'].indexOf(tab) + 1} / 3` }), body];
}
const monthlyBills = () => svc.getBills().filter(b => b.active).reduce((a, b) => a + (b.cadence === 'yearly' ? Math.round(b.amount / 12) : b.amount), 0);

// ------------------------------------------------------------------ MORE
function viewMore(sub?: string): [string, string] {
  if (sub === 'tax') return viewTax();
  if (sub === 'accounts') return viewAccounts();
  if (sub === 'categories') return viewCategories();
  if (sub === 'settings') return viewSettings();
  if (sub === 'backup') return viewBackup();
  const item = (href: string, icon: string, n: string, s: string) => `<a class="row" href="${href}" style="text-decoration:none;color:inherit"><span class="ic">${ic(icon)}</span><span class="mid"><span class="n">${n}</span><span class="s">${s}</span></span><span class="chev">${ic('chevron')}</span></a>`;
  const total = svc.getAccounts().reduce((a, x) => a + x.balance, 0);
  const body = `<div class="sec" style="margin-top:16px"><div class="card rows menu">
    ${item('#more-accounts', 'bank', 'บัญชีและยอดเงิน', `รวม ${baht(total)}`)}
    ${item('#more-tax', 'tax', 'ภาษี', 'ประมาณการ ภ.ง.ด.90/91')}
    ${item('#more-categories', 'tag', 'หมวดหมู่', 'เพิ่ม แก้ชื่อ เปลี่ยนไอคอน')}
    ${item('#more-settings', 'settings', 'ตั้งค่า', 'รอบเงินเดือน ธีม กันเงินภาษี')}
    ${item('#more-backup', 'backup', 'สำรอง / กู้คืนข้อมูล', prefs.lastBackup ? `ล่าสุด ${U.dMed(prefs.lastBackup)}` : 'ยังไม่เคยสำรอง')}
  </div></div>
  <div class="sec">${secH('ABOUT', 'เกี่ยวกับ NEXUS', 'phone')}<div class="card pad"><p class="mono" style="font-size:11px;color:var(--ink-3)">NEXUS · PERSONAL FINANCE OS · v${APP_VERSION}</p><p class="fine" style="margin-top:6px">ข้อมูลทั้งหมดเก็บในเบราว์เซอร์ของเครื่องนี้เท่านั้น ไม่มีเซิร์ฟเวอร์ ไม่มีบัญชีผู้ใช้ ไฟล์สำรองใช้ร่วมกับ NEXUS CLI ได้</p><div class="tri" aria-hidden="true" style="margin-top:12px"></div></div></div>`;
  return [moduleHeader({ crumb: 'MORE', th: 'อื่น ๆ', en: 'SYSTEM' }), body];
}

function viewAccounts(): [string, string] {
  const accs = svc.getAccounts();
  const spend = accs.filter(a => a.spendable).reduce((s, a) => s + a.balance, 0);
  const save = accs.filter(a => !a.spendable).reduce((s, a) => s + a.balance, 0);
  const body = `
    <div class="tiles" style="margin-top:16px">
      <div class="tile"><div class="l">ใช้จ่ายได้</div><div class="v">${baht(spend)}</div></div>
      <div class="tile"><div class="l">เงินออม</div><div class="v">${baht(save)}</div></div>
      <div class="tile"><div class="l">รวม</div><div class="v">${baht(spend + save)}</div></div>
    </div>
    <div class="sec"><div class="card rows">${accs.map(a => `<button class="row" data-acc="${a.id}"><span class="ic">${ic(accIcon(a.kind))}</span><span class="mid"><span class="n">${esc(a.name)}</span><span class="s">${{ bank: 'บัญชีธนาคาร', wallet: 'e-Wallet', cash: 'เงินสด' }[a.kind]}${a.spendable ? '' : ' · เงินออม (ไม่นับใน "ใช้ได้")'}</span></span><span class="amt ${a.balance < 0 ? 'neg' : ''}">${a.balance < 0 ? '−' + baht(-a.balance) : baht(a.balance)}</span></button>`).join('')}</div>
    <button class="btn block" data-act="new-acc" style="margin-top:10px">${ic('plus')}เพิ่มบัญชี</button>
    <p class="fine" style="margin-top:10px">ยอดไม่ตรงกับแอปธนาคาร? แตะบัญชีแล้วใส่ "ยอดจริงตอนนี้" — แนะนำให้เทียบยอดสัปดาห์ละครั้ง</p></div>`;
  return [moduleHeader({ crumb: 'MORE / ACCOUNTS', th: 'บัญชีและยอดเงิน', en: 'ACCOUNTS', back: '#more' }), body];
}

function viewCategories(): [string, string] {
  const k = st.catTab;
  const cats = svc.getCategories(true).filter(c => c.kind === k);
  const body = `<div class="segctl" style="margin-top:16px">${(['expense', 'income'] as const).map(x => `<button data-cattab="${x}" aria-pressed="${k === x}">${x === 'expense' ? 'รายจ่าย' : 'รายรับ'}</button>`).join('')}</div>
    <div class="sec"><div class="card rows">${cats.map(c => `<button class="row" data-cat="${c.id}" ${c.archived ? 'style="opacity:.5"' : ''}><span class="ic">${ic(catIcon(c))}</span><span class="mid"><span class="n">${esc(c.name)}</span><span class="s">${[c.monthlyPlan ? 'งบ ' + baht(c.monthlyPlan) : '', c.taxSection ? 'นับภาษี ' + c.taxSection : '', c.archived ? 'ซ่อนอยู่' : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></span><span class="chev" style="width:18px;color:var(--ink-3)">${ic('chevron')}</span></button>`).join('')}</div>
    <button class="btn block" data-act="new-cat" style="margin-top:10px">${ic('plus')}เพิ่มหมวด${k === 'expense' ? 'รายจ่าย' : 'รายรับ'}</button>
    ${k === 'income' ? '<p class="fine" style="margin-top:10px">ตั้ง "ประเภทเงินได้" ให้หมวดที่ต้องเสียภาษี เช่น เงินเดือน = 40(1), ฟรีแลนซ์/ค่าจ้างรายงาน = 40(2), ขายของ = 40(8) เพื่อให้หน้าภาษีคำนวณได้</p>' : '<p class="fine" style="margin-top:10px">หมวดที่ใช้แล้วลบไม่ได้ (ประวัติจะหาย) แต่ซ่อนได้</p>'}</div>`;
  return [moduleHeader({ crumb: 'MORE / CATEGORIES', th: 'หมวดหมู่', en: 'CATEGORIES', back: '#more' }), body];
}

function viewSettings(): [string, string] {
  const s = svc.getSettings();
  const body = `<div class="sec" style="margin-top:16px">
    <div class="field"><span>รายได้</span><div class="segctl">${([['regular', 'มีรายได้ประจำ'], ['none', 'ไม่มีรายได้ประจำ']] as const).map(([k, l]) => `<button data-income="${k}" aria-pressed="${(s.incomeMode ?? 'regular') === k}">${l}</button>`).join('')}</div>
      <div class="hint">ไม่มีรายได้ประจำ = หน้าหลักบอกว่าเงินที่มีพอใช้อีกกี่วัน (คิดจากค่าใช้จ่ายจริง 30 วันล่าสุด) · มีงานแล้วค่อยสลับกลับ</div></div>
    <label class="field"><span>รอบเงินเดือนเริ่มวันที่</span>
      <select id="set-cycle">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${s.cycleStartDay === i + 1 ? 'selected' : ''}>วันที่ ${i + 1}</option>`).join('')}</select>
      <div class="hint">งบ บิล และ "ใช้ได้" นับตามรอบนี้ เช่น เงินเดือนออกวันที่ 25 ให้เลือก 25</div></label>
    <label class="field"><span>กันเงินไว้จ่ายภาษีต่อเดือน (บาท)</span>
      <input id="set-taxres" inputmode="decimal" value="${s.monthlyTaxReserve ? s.monthlyTaxReserve / 100 : ''}" placeholder="0">
      <div class="hint">ถ้ามีรายได้ที่ไม่ได้ถูกหัก ณ ที่จ่ายพอ ดูยอดแนะนำได้ในหน้าภาษี</div></label>
    <div class="field"><span>ธีม</span><div class="segctl">${([['auto', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']] as const).map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${prefs.theme === k}">${l}</button>`).join('')}</div></div>
    <label class="field"><span>ชื่อที่ใช้ทักทาย (ไม่บังคับ)</span><input id="set-name" value="${esc(prefs.name ?? '')}" maxlength="24" autocomplete="nickname" placeholder="ชื่อเล่น">
      <div class="hint">ใช้ใน Boot Log ตอนเปิดแอปครั้งแรกของวัน · เก็บในเครื่องนี้เท่านั้น</div></label>
    <label class="check"><input type="checkbox" id="set-boot" ${prefs.bootLog !== false ? 'checked' : ''}>แสดง Boot Log ตอนเปิดแอปครั้งแรกของวัน</label>
    <p class="fine" style="margin:-4px 0 6px">ไม่แสดงในโหมดตัวอย่าง หรือเมื่อเครื่องตั้งค่าให้ลดการเคลื่อนไหว</p>
    <label class="check"><input type="checkbox" id="set-hap" ${prefs.haptics ? 'checked' : ''}>สั่นเบา ๆ เมื่อบันทึก (Android)</label>
    ${installEvt ? `<button class="btn block dark" data-act="install" style="margin-top:12px">${ic('phone')}ติดตั้งเป็นแอป</button>` : ''}
  </div>`;
  return [moduleHeader({ crumb: 'MORE / SETTINGS', th: 'ตั้งค่า', en: 'SETTINGS', back: '#more' }), body];
}

function viewBackup(): [string, string] {
  const n = svc.snapshot().transactions.length;
  const body = `<div class="sec" style="margin-top:16px">
    <div class="notice">${ic('alert')}<span>ข้อมูลอยู่ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์หรือทำเครื่องหาย ข้อมูลจะหาย — ดาวน์โหลดไฟล์สำรองเก็บไว้ใน Google Drive เป็นประจำ</span></div>
  </div>
  <div class="sec">${secH('BACKUP', 'สำรองข้อมูล', 'backup')}
    <div class="card pad">
      <p style="margin:0 0 12px">สำรองล่าสุด: <b>${prefs.lastBackup ? U.dMed(prefs.lastBackup) : 'ยังไม่เคย'}</b> · <span class="muted">${n} รายการ</span></p>
      <div class="btn-row"><button class="btn primary" data-act="export-json">${ic('backup')}ดาวน์โหลดไฟล์สำรอง (.json)</button>
      <button class="btn" data-act="export-csv">ส่งออก CSV (Excel)</button></div>
    </div>
  </div>
  <div class="sec">${secH('RESTORE', 'กู้คืนข้อมูล', 'backup')}
    <div class="card pad">
      <p class="fine" style="margin:0 0 12px">กู้คืนจากไฟล์ .json ที่สำรองไว้ (ใช้ไฟล์ nexus.json จาก NEXUS CLI ได้ด้วย) — ข้อมูลในเครื่องนี้จะถูกแทนที่ทั้งหมด</p>
      <label class="btn" style="cursor:pointer">เลือกไฟล์สำรอง<input type="file" id="restore" accept=".json,application/json" class="sr"></label>
    </div>
  </div>
  <div class="sec">${secH('DANGER ZONE', 'ล้างข้อมูล', 'alert')}
    <div class="card pad">
      <p class="fine" style="margin:0 0 12px">ลบข้อมูลทั้งหมดในเครื่องนี้แล้วเริ่มใหม่</p>
      <button class="btn danger" data-act="reset">ล้างข้อมูลทั้งหมด</button>
    </div></div>`;
  return [moduleHeader({ crumb: 'MORE / BACKUP', th: 'สำรอง / กู้คืนข้อมูล', en: 'BACKUP', back: '#more' }), body];
}

// ------------------------------------------------------------------ TAX
function viewTax(): [string, string] {
  const year = st.taxYear;
  const { actual, projected } = svc.getTax(year);
  const e = st.taxBasis === 'projected' ? projected : actual;
  const s = svc.getSettings();
  const cats = svc.getCategories().filter(c => c.kind === 'income');
  const taxed = cats.filter(c => c.taxSection);
  const curY = Number(svc.today().slice(0, 4));
  const monthsLeft = year === curY ? 12 - Number(svc.today().slice(5, 7)) + 1 : 0;
  const suggestReserve = e.remaining > 0 && monthsLeft > 0 ? Math.ceil(e.remaining / monthsLeft / 100) * 100 : 0;
  const hitIdx = e.bands.length - 1;
  const body = `
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <div class="segctl" style="flex:1;min-width:200px">${[curY - 1, curY].map(y => `<button data-taxyear="${y}" aria-pressed="${y === year}">ปีภาษี ${U.be(y)}</button>`).join('')}</div>
      <div class="segctl" style="flex:1;min-width:220px">${([['projected', 'ประมาณทั้งปี'], ['actual', 'ถึงวันนี้']] as const).map(([k, l]) => `<button data-taxbasis="${k}" aria-pressed="${st.taxBasis === k}">${l}</button>`).join('')}</div>
    </div>
    ${taxed.length === 0 ? `<div class="notice warn">${noteChip('warn')}<span>ยังไม่มีหมวดรายรับที่ตั้งประเภทเงินได้ — ตั้งที่ หมวดหมู่ › รายรับ</span><a class="act" href="#more-categories">ไปตั้ง</a></div>` : ''}
    <section class="hero" aria-labelledby="tax-l">
      <div class="hero-top"><span class="hl" id="tax-l"><span aria-hidden="true">P.N.D. 90/91 · ${U.be(year)} · </span><span class="th">${e.remaining >= 0 ? 'ภาษีที่อาจต้องจ่ายเพิ่มตอนยื่น' : 'อาจได้เงินคืนประมาณ'}</span></span>${st.taxBasis === 'projected' ? statusChip('info', 'PROJECTION', 'ประมาณทั้งปี') : statusChip('info', 'YEAR TO DATE', 'ถึงวันนี้')}</div>
      <div class="hero-amt ${e.remaining < 0 ? 'pos' : ''}">${numCur(Math.abs(e.remaining))}</div>
      <div class="hero-sub">ภาษีทั้งปี <b>${baht(e.tax)}</b> · ถูกหัก ณ ที่จ่ายแล้ว <b>${baht(e.withheld)}</b>${e.method !== 'progressive' ? ' · ใช้วิธีภาษีขั้นต่ำ 0.5%' : ''}</div>
      ${suggestReserve && st.taxBasis === 'projected' ? `<div class="notice">${ic('savings')}<span>กันไว้เดือนละ <b>${baht(suggestReserve)}</b> อีก ${monthsLeft} เดือนจะพอ${s.monthlyTaxReserve ? ` (ตอนนี้กันไว้ ${baht(s.monthlyTaxReserve)})` : ''}</span><button class="act" data-setreserve="${suggestReserve}">ใช้ยอดนี้</button></div>` : ''}
    </section>
    <div class="two">
      <div class="sec">${secH('CALC', 'ที่มาของตัวเลข', 'tax')}<div class="card">
        <div class="kv"><span class="k">เงินได้พึงประเมิน</span><span class="v">${baht(e.totalGross)}</span></div>
        <div class="kv"><span class="k">หักค่าใช้จ่าย</span><span class="v">−${baht(e.salaryExpense + e.bizExpense)}</span></div>
        <div class="kv"><span class="k">ลดหย่อนรวม</span><span class="v">−${baht(e.allowances)}</span></div>
        <div class="kv total"><span class="k">เงินได้สุทธิ</span><span class="v">${baht(e.netIncome)}</span></div>
        <div class="kv total"><span class="k">ภาษี</span><span class="v">${baht(e.tax)}</span></div>
      </div>
      <div class="sec">${secH('ALLOWANCES', 'ค่าลดหย่อน', 'check')}<div class="card rows">
        <div class="kv"><span class="k">ส่วนตัว (ทุกคนได้)</span><span class="v">${baht(6000000)}</span></div>
        ${s.taxAllowances.map((a, i) => `<button class="kv" style="width:100%" data-allow="${i}"><span class="k">${esc(a.label)}</span><span class="v">${baht(a.amount)}</span></button>`).join('')}
      </div><button class="btn block" data-act="new-allow" style="margin-top:8px">${ic('plus')}เพิ่มค่าลดหย่อน</button>
      <p class="fine" style="margin-top:6px">เช่น ประกันสังคม (สูงสุด 9,000), ประกันชีวิต, กองทุน — ตรวจเพดานแต่ละรายการกับกรมสรรพากร</p></div>
      </div></div>
      <div><div class="sec">${secH('BRACKET', 'อัตราขั้นบันได', 'arrowDR')}<div class="card"><table class="bands"><thead><tr><th>เงินได้สุทธิ</th><th>อัตรา</th><th>ภาษี</th></tr></thead><tbody>
        ${rulesBrackets().map((b, i) => `<tr class="${i === hitIdx && e.netIncome > 0 ? 'hit' : ''}"><td>${b.label}</td><td>${b.rate ? b.rate * 100 + '%' : 'ยกเว้น'}</td><td>${e.bands[i] ? baht(e.bands[i]!.tax) : '—'}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="sec">${secH('INCOME', 'รายได้ที่นับภาษี', 'salary')}<div class="card rows">
        ${taxed.map(c => `<div class="kv"><span class="k">${esc(c.name)} · ${c.taxSection}</span><span class="v">${baht(svc.getTransactions({ from: `${year}-01-01`, to: `${year + 1}-01-01`, categoryId: c.id, type: 'income' }).reduce((a, t) => a + t.amount, 0))}</span></div>`).join('') || emptyBox('NO TAXABLE INCOME', 'ยังไม่มีรายได้ที่นับภาษี', 'ตั้ง "ประเภทเงินได้" ให้หมวดรายรับที่ หมวดหมู่ › รายรับ')}
      </div>
      <label class="field" style="margin-top:12px"><span>อัตราหักค่าใช้จ่าย 40(8) (%)</span><input id="rate408" inputmode="decimal" value="${Math.round(s.section408DeductionRate * 100)}"><div class="hint">ขึ้นกับประเภทธุรกิจ (เหมา 60% ใช้ได้กับหลายประเภท) — ตรวจก่อนยื่น</div></label></div></div>
    </div>
    <div class="sec card pad"><p class="fine"><b>ประมาณการเพื่อวางแผนเท่านั้น</b> ไม่ใช่การยื่นภาษี ยืนยันตัวเลขจริงที่ efiling.rd.go.th · ภ.ง.ด.90/91 ของปีภาษี ${U.be(year)} ยื่นภายใน 31 มี.ค. ${U.be(year + 1)} (ยื่นออนไลน์มักได้ขยายถึงต้นเมษายน — ตรวจประกาศกรมสรรพากรของปีนั้น) · อัตราภาษีตรวจล่าสุด ${U.dMed(e.rules.verifiedAt)}</p>
    <p class="fine" style="margin-top:6px">ประมาณทั้งปี = ยอดจริง + ค่าเฉลี่ยต่อเดือนตั้งแต่เดือนแรกที่บันทึก × เดือนที่เหลือ</p></div>`;
  return [moduleHeader({ crumb: 'MORE / TAX', th: 'ภาษี', en: 'TAX CENTER', back: '#more' }), body];
}
function rulesBrackets() {
  const B = [0, 150000, 300000, 500000, 750000, 1000000, 2000000, 5000000];
  const R = [0, .05, .1, .15, .2, .25, .3, .35];
  return B.map((b, i) => ({ label: i < B.length - 1 ? `${(b ? b + 1 : 0).toLocaleString()} – ${B[i + 1]!.toLocaleString()}` : `${(b + 1).toLocaleString()} ขึ้นไป`, rate: R[i]! }));
}

// ------------------------------------------------------------------ KEYPAD (shared)
function keypadHtml(saveLabel: string) {
  const k = (v: string, label = v, cls = '') => `<button type="button" class="${cls}" data-k="${v}" aria-label="${v === 'bs' ? 'ลบ' : v === '+' ? 'บวก' : label}">${label}</button>`;
  return `<div class="keypad" role="group" aria-label="แป้นตัวเลข">
    ${k('1')}${k('2')}${k('3')}${k('bs', ic('backspace'), 'op')}
    ${k('4')}${k('5')}${k('6')}${k('+', '+', 'op')}
    ${k('7')}${k('8')}${k('9')}<button type="button" class="save" data-k="ok" disabled>${saveLabel}</button>
    ${k('.')}${k('0')}${k('00')}
  </div>`;
}
/** Expression like "60+45.5" → satang, or null if empty/invalid. */
function evalExpr(expr: string): number | null {
  if (!expr) return null;
  const parts = expr.split('+').filter(Boolean);
  try { return parts.reduce((a, p) => a + parseBaht(p), 0); } catch { return null; }
}
function pressKey(expr: string, k: string): string {
  const parts = expr.split('+');
  const cur = parts[parts.length - 1]!;
  if (k === 'bs') return expr.slice(0, -1);
  if (k === '+') return !cur ? expr : expr + '+';
  if (k === '.') return cur.includes('.') ? expr : expr + (cur ? '.' : '0.');
  if (/\.\d{2}$/.test(cur)) return expr;                     // max 2 decimals
  if (cur.replace('.', '').length >= 9) return expr;          // sane max
  if (cur === '0' && k !== '.') return expr.slice(0, -1) + (k === '00' ? '0' : k);
  if (!cur && k === '00') return expr + '0';
  return expr + k;
}
function fmtTyped(part: string) {
  const [i = '', d] = part.split('.');
  return Number(i || '0').toLocaleString('en-US') + (d !== undefined ? '.' + d : '');
}
function amountDisplay(expr: string) {
  const v = evalExpr(expr);
  const plus = expr.includes('+');
  const shown = !expr ? '0' : plus ? (() => { const p = U.bahtParts(v ?? 0); return p.int + p.dec; })() : fmtTyped(expr);
  return {
    html: `<span class="cur">฿</span><span class="v ${expr ? '' : 'ph'}">${shown}</span>`,
    expr: plus ? `${expr.replace(/\+/g, ' + ')} = ${baht(v ?? 0)}` : '',
    value: v,
  };
}
function bindKeypad(root: HTMLElement, get: () => string, set: (s: string) => void, onOk: () => void) {
  root.querySelectorAll<HTMLButtonElement>('[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k!;
    U.buzz(5);
    if (k === 'ok') return onOk();
    set(pressKey(get(), k));
  }));
}

// ------------------------------------------------------------------ QUICK ADD
type QA = { type: Transaction['type']; expr: string; categoryId?: string; accountId: string; toAccountId?: string; note: string; date: string; editId?: string };
let qa: QA | null = null;

function frequentCombos(type: Transaction['type']) {
  const since = prevDay(addDaysStr(svc.today(), -60));
  const counts = new Map<string, { n: number; t: Transaction }>();
  for (const t of svc.getTransactions({ from: since, type })) {
    if (t.billId || t.goalId || t.type === 'transfer') continue;
    const k = `${t.categoryId}|${t.accountId}|${t.amount}|${t.note ?? ''}`;
    const c = counts.get(k); if (c) c.n++; else counts.set(k, { n: 1, t });
  }
  return [...counts.values()].filter(c => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6).map(c => c.t);
}
function addDaysStr(d: string, n: number) { const p = parseDate(d); return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10); }
function catOrder(kind: Category['kind']) {
  const since = addDaysStr(svc.today(), -60);
  const freq = new Map<string, number>();
  for (const t of svc.getTransactions({ from: since, type: kind })) if (t.categoryId) freq.set(t.categoryId, (freq.get(t.categoryId) ?? 0) + 1);
  return svc.getCategories().filter(c => c.kind === kind).sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0));
}

function openQuickAdd(init: Partial<QA> = {}) {
  const accs = svc.getAccounts();
  const def = accs.find(a => a.id === prefs.lastAccount && a.spendable) ?? accs.find(a => a.spendable) ?? accs[0]!;
  qa = { type: 'expense', expr: '', accountId: def.id, note: '', date: svc.today(), ...init };
  const editing = !!qa.editId;
  const el = U.openSheet({
    label: editing ? 'แก้ไขรายการ' : 'จดรายการ',
    head: `<div class="segctl" style="flex:1" role="group" aria-label="ประเภทรายการ">${(['expense', 'income', 'transfer'] as const).map(t => `<button data-qtype="${t}" aria-pressed="${qa!.type === t}">${{ expense: 'จ่าย', income: 'รับ', transfer: 'โอน' }[t]}</button>`).join('')}</div>`,
    body: `<div id="qa-body"></div>`,
    keypad: keypadHtml(''),
    cls: 'qa',
    onClose: () => { qa = null; },
  });
  el.querySelectorAll<HTMLButtonElement>('[data-qtype]').forEach(b => b.addEventListener('click', () => {
    qa!.type = b.dataset.qtype as QA['type'];
    if (qa!.type === 'transfer') { qa!.categoryId = undefined; qa!.toAccountId = accs.find(a => a.id !== qa!.accountId && !a.spendable)?.id ?? accs.find(a => a.id !== qa!.accountId)?.id; }
    else { const c = qa!.categoryId ? svc.getCategories().find(x => x.id === qa!.categoryId) : undefined; if (c && c.kind !== qa!.type) qa!.categoryId = undefined; }
    el.querySelectorAll('[data-qtype]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    drawQA();
  }));
  bindKeypad(el, () => qa!.expr, s => { qa!.expr = s; drawAmount(); }, saveQA);
  drawQA();
}

function drawAmount() {
  const el = U.sheetEl(); if (!el || !qa) return;
  const d = amountDisplay(qa.expr);
  $('#qa-amt', el)!.innerHTML = d.html;
  $('#qa-expr', el)!.textContent = d.expr;
  const ok = !!d.value && d.value > 0 && (qa.type === 'transfer' ? !!qa.toAccountId && qa.toAccountId !== qa.accountId : !!qa.categoryId);
  const btn = $('[data-k="ok"]', el) as HTMLButtonElement;
  btn.disabled = !ok;
  btn.innerHTML = `${qa.editId ? 'บันทึก' : 'บันทึก'}${d.value ? `<small>${baht(d.value)}</small>` : ''}`;
  const hint = !d.value ? 'ใส่จำนวนเงิน' : qa.type === 'transfer' ? (ok ? '' : 'เลือกบัญชีปลายทาง') : (qa.categoryId ? '' : 'เลือกหมวด');
  $('#qa-hint', el)!.textContent = hint;
}

function drawQA() {
  const el = U.sheetEl(); if (!el || !qa) return;
  const accs = svc.getAccounts();
  const combos = !qa.editId && qa.type !== 'transfer' ? frequentCombos(qa.type) : [];
  const m = maps();
  const today = svc.today(), yest = prevDay(today);
  const accChips = (sel: string | undefined, attr: string, exclude?: string) => `<div class="chips">${accs.filter(a => a.id !== exclude).map(a => `<button class="chip" ${attr}="${a.id}" aria-pressed="${sel === a.id}">${ic(accIcon(a.kind))}${esc(a.name)}</button>`).join('')}</div>`;
  $('#qa-body', el)!.innerHTML = `
    <div class="qa-amt" id="qa-amt" aria-live="polite"></div><div class="qa-expr" id="qa-expr"></div>
    ${combos.length ? `<div class="qa-lab"><span>ใช้บ่อย — แตะเพื่อกรอกให้</span></div><div class="chips">${combos.map((t, i) => `<button class="chip" data-combo="${i}">${ic(catIcon(m.cats.get(t.categoryId!) ?? { id: '', name: '', kind: t.type }))}${esc(t.note || m.cats.get(t.categoryId!)?.name || '')} <span class="num">${baht(t.amount)}</span></button>`).join('')}</div>` : ''}
    ${qa.type === 'transfer'
      ? `<div class="qa-lab"><span>จากบัญชี</span></div>${accChips(qa.accountId, 'data-qacc')}<div class="qa-lab"><span>ไปบัญชี</span></div>${accChips(qa.toAccountId, 'data-qto', qa.accountId)}`
      : `<div class="qa-lab"><span>หมวด</span><a href="#more-categories" data-close-link style="color:var(--ink-2)">จัดการหมวด</a></div>
         <div class="cat-grid">${catOrder(qa.type as Category['kind']).map(c => `<button class="cat" data-qcat="${c.id}" aria-pressed="${qa!.categoryId === c.id}">${ic(catIcon(c))}<span>${esc(c.name)}</span></button>`).join('')}</div>
         <div class="qa-lab"><span>${qa.type === 'income' ? 'เข้าบัญชี' : 'จ่ายจาก'}</span></div>${accChips(qa.accountId, 'data-qacc')}`}
    <div class="qa-lab"><span>วันที่</span></div>
    <div class="chips"><button class="chip" data-qdate="${today}" aria-pressed="${qa.date === today}">วันนี้</button><button class="chip" data-qdate="${yest}" aria-pressed="${qa.date === yest}">เมื่อวาน</button>
      <label class="chip" aria-pressed="${qa.date !== today && qa.date !== yest}" style="position:relative">${ic('calendar')}${qa.date !== today && qa.date !== yest ? U.dMed(qa.date) : 'เลือกวัน'}<input type="date" id="qa-date" value="${qa.date}" max="${today}" style="position:absolute;inset:0;opacity:0"></label></div>
    <label class="field" style="margin:12px 0 0"><span class="sr">โน้ต</span><input id="qa-note" value="${esc(qa.note)}" placeholder="โน้ต (ไม่บังคับ) เช่น ข้าวมันไก่" maxlength="80" enterkeyhint="done" autocomplete="off"></label>
    ${qa.editId ? `<button class="btn danger block" data-qvoid style="margin-top:12px">ยกเลิกรายการนี้</button>` : ''}
    <div class="qa-hint" id="qa-hint"></div><div class="kbd-hint">พิมพ์ตัวเลขได้เลย · Enter = บันทึก · Esc = ปิด</div>`;
  const b = $('#qa-body', el)!;
  b.querySelectorAll<HTMLButtonElement>('[data-qcat]').forEach(x => x.addEventListener('click', () => { qa!.categoryId = x.dataset.qcat; b.querySelectorAll('[data-qcat]').forEach(y => y.setAttribute('aria-pressed', String(y === x))); drawAmount(); }));
  b.querySelectorAll<HTMLButtonElement>('[data-qacc]').forEach(x => x.addEventListener('click', () => { qa!.accountId = x.dataset.qacc!; if (qa!.toAccountId === qa!.accountId) qa!.toAccountId = undefined; drawQA(); }));
  b.querySelectorAll<HTMLButtonElement>('[data-qto]').forEach(x => x.addEventListener('click', () => { qa!.toAccountId = x.dataset.qto; drawQA(); }));
  b.querySelectorAll<HTMLButtonElement>('[data-qdate]').forEach(x => x.addEventListener('click', () => { qa!.date = x.dataset.qdate!; drawQA(); }));
  b.querySelectorAll<HTMLButtonElement>('[data-combo]').forEach(x => x.addEventListener('click', () => {
    const t = combos[Number(x.dataset.combo)]!;
    Object.assign(qa!, { expr: String(t.amount / 100), categoryId: t.categoryId, accountId: t.accountId, note: t.note ?? '' });
    U.buzz(8); drawQA();
  }));
  $('#qa-date', b)?.addEventListener('change', e => { const v = (e.target as HTMLInputElement).value; if (v) { qa!.date = v; drawQA(); } });
  $('#qa-note', b)!.addEventListener('input', e => { qa!.note = (e.target as HTMLInputElement).value; });
  $('#qa-note', b)!.addEventListener('keydown', e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } });
  b.querySelector('[data-close-link]')?.addEventListener('click', () => U.closeSheet());
  b.querySelector('[data-qvoid]')?.addEventListener('click', () => { const id = qa!.editId!; U.closeSheet(); voidTx(id); });
  drawAmount();
}

function saveQA() {
  if (!qa) return;
  const amount = evalExpr(qa.expr);
  if (!amount) return;
  const input = { type: qa.type, amount, accountId: qa.accountId, toAccountId: qa.type === 'transfer' ? qa.toAccountId : undefined, categoryId: qa.type === 'transfer' ? undefined : qa.categoryId, note: qa.note.trim() || undefined, date: qa.date };
  const editId = qa.editId;
  const t = guard(() => editId
    ? svc.updateTransaction(editId, { ...input, toAccountId: input.toAccountId ?? (null as any), categoryId: input.categoryId ?? (null as any), note: input.note ?? (null as any) })
    : svc.addTransaction(input));
  if (!t) return;
  setPrefs({ lastAccount: qa.accountId });
  U.buzz(15);
  U.closeSheet();
  const c = t.categoryId ? svc.getCategories(true).find(x => x.id === t.categoryId) : undefined;
  const sign = t.type === 'expense' ? '−' : t.type === 'income' ? '+' : '';
  render();
  if (editId) U.toast('แก้ไขแล้ว');
  else U.toast(`บันทึก ${sign}${baht(t.amount)}${c ? ' · ' + c.name : ''}`, { undo: () => { svc.voidTransaction(t.id, 'undo'); render(); U.toast('เลิกทำแล้ว'); } });
}

function voidTx(id: string) {
  if (!tryDo(() => svc.voidTransaction(id))) return;
  render();
  U.toast('ยกเลิกรายการแล้ว', { undo: () => { svc.unvoidTransaction(id); render(); } });
}

function openEditTx(id: string) {
  const t = svc.getTransactions({ includeVoided: true }).find(x => x.id === id);
  if (!t) return;
  if (t.voided) {
    U.confirmSheet({ title: 'รายการที่ยกเลิกแล้ว', body: `${esc(t.note ?? '')} ${baht(t.amount)} — นำกลับมาใช้?`, ok: 'นำกลับมา', onOk: () => { svc.unvoidTransaction(id); render(); U.toast('นำกลับมาแล้ว'); } });
    return;
  }
  openQuickAdd({ type: t.type, expr: String(t.amount / 100), categoryId: t.categoryId, accountId: t.accountId, toAccountId: t.toAccountId, note: t.note ?? '', date: t.date, editId: t.id });
}

// ------------------------------------------------------------------ AMOUNT PROMPT (keypad sheet)
function amountSheet(o: { title: string; initial?: number; sub?: string; extra?: string; saveLabel?: string; allowZero?: boolean; onSave: (v: number, el: HTMLElement) => void }) {
  let expr = o.initial ? String(o.initial / 100) : '';
  const el = U.openSheet({ title: o.title, body: `${o.sub ? `<p class="fine">${o.sub}</p>` : ''}<div class="qa-amt" id="qa-amt"></div><div class="qa-expr" id="qa-expr"></div>${o.extra ?? ''}`, keypad: keypadHtml(o.saveLabel ?? 'บันทึก') });
  const draw = () => {
    const d = amountDisplay(expr);
    $('#qa-amt', el)!.innerHTML = d.html; $('#qa-expr', el)!.textContent = d.expr;
    ($('[data-k="ok"]', el) as HTMLButtonElement).disabled = !(d.value !== null && (o.allowZero ? d.value >= 0 : d.value > 0)) && !(o.allowZero && expr === '');
  };
  bindKeypad(el, () => expr, s => { expr = s; draw(); }, () => { const v = evalExpr(expr) ?? 0; o.onSave(v, el); });
  draw();
  (el as any)._keypad = { get: () => expr, set: (s: string) => { expr = s; draw(); }, ok: () => { const v = evalExpr(expr) ?? 0; o.onSave(v, el); } };
}

function openPlan(catId: string) {
  const c = svc.getCategories(true).find(x => x.id === catId)!;
  const avg = (() => { let sum = 0; for (let i = 1; i <= 3; i++) { const cy = cycleAt(-i); sum += svc.getTransactions({ from: cy.from, to: cy.to, categoryId: catId, type: 'expense' }).reduce((a, t) => a + t.amount, 0); } return Math.round(sum / 3); })();
  amountSheet({
    title: `งบ "${c.name}" ต่อรอบ`, initial: c.monthlyPlan, allowZero: true,
    sub: avg ? `เฉลี่ย 3 รอบที่ผ่านมา ${baht(avg)} · ใส่ 0 เพื่อยกเลิกงบ` : 'ใส่ 0 เพื่อยกเลิกงบ',
    onSave: v => { if (tryDo(() => svc.setPlans({ [catId]: v }))) { U.closeSheet(); render(); U.toast(v ? `ตั้งงบ ${c.name} ${baht(v)}` : `ยกเลิกงบ ${c.name}`); } },
  });
}

function payBill(id: string) {
  const b = svc.getBills().find(x => x.id === id)!;
  const t = guard(() => svc.payBill(id));
  if (!t) return;
  justPaid = id;
  U.buzz(15); render();
  justPaid = null;
  U.toast(`จ่าย ${b.name} ${baht(b.amount)}`, { undo: () => { svc.voidTransaction(t.id, 'undo'); render(); } });
}

function contribute(goalId: string) {
  const g = svc.snapshot().goals.find(x => x.id === goalId)!;
  const accs = svc.getAccounts();
  const from = accs.find(a => a.id === prefs.lastAccount && a.spendable) ?? accs.find(a => a.spendable)!;
  const to = accs.find(a => !a.spendable) ?? accs.find(a => a.id !== from.id)!;
  let fromId = from.id, toId = to.id;
  amountSheet({
    title: `ออมเพิ่ม · ${g.name}`, initial: g.monthlyContribution,
    extra: `<div class="qa-lab"><span>จาก</span></div><div class="chips" id="c-from">${accs.map(a => `<button class="chip" data-f="${a.id}" aria-pressed="${a.id === fromId}">${esc(a.name)}</button>`).join('')}</div>
      <div class="qa-lab"><span>ไปเก็บที่</span></div><div class="chips" id="c-to">${accs.map(a => `<button class="chip" data-t="${a.id}" aria-pressed="${a.id === toId}">${esc(a.name)}</button>`).join('')}</div>`,
    onSave: v => { const t = guard(() => svc.contributeToGoal(goalId, v, fromId, toId)); if (t) { U.closeSheet(); U.buzz(15); render(); U.toast(`ออม ${baht(v)} → ${g.name}`, { undo: () => { svc.voidTransaction(t.id, 'undo'); render(); } }); } },
  });
  const el = U.sheetEl()!;
  el.querySelectorAll<HTMLButtonElement>('[data-f]').forEach(b => b.addEventListener('click', () => { fromId = b.dataset.f!; el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  el.querySelectorAll<HTMLButtonElement>('[data-t]').forEach(b => b.addEventListener('click', () => { toId = b.dataset.t!; el.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
}

// ------------------------------------------------------------------ FORMS
const num = (v: string) => { const s = v.trim(); return s ? parseBaht(s) : 0; };
const opt = (v: string, l: string, sel: boolean) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;

function formSheet(title: string, fields: string, onSave: (f: HTMLFormElement) => void, extraFoot = '') {
  const el = U.openSheet({ title, body: `<form id="f" novalidate>${fields}<button type="submit" class="sr">บันทึก</button></form>`, foot: `${extraFoot}<button class="btn primary" data-save style="flex:1">บันทึก</button>` });
  const f = $('#f', el) as HTMLFormElement;
  const go = (e?: Event) => { e?.preventDefault(); if (tryDo(() => onSave(f))) { U.closeSheet(); render(); } };
  f.addEventListener('submit', go);
  el.querySelector('[data-save]')!.addEventListener('click', () => go());
  return el;
}
const val = (f: HTMLFormElement, n: string) => ((f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '');
const checked = (f: HTMLFormElement, n: string) => !!(f.elements.namedItem(n) as HTMLInputElement | null)?.checked;

function billForm(b?: Bill) {
  const cats = svc.getCategories().filter(c => c.kind === 'expense');
  const accs = svc.getAccounts();
  const el = formSheet(b ? 'แก้ไขบิล' : 'เพิ่มบิลประจำ', `
    <label class="field"><span>ชื่อ</span><input name="name" value="${esc(b?.name ?? '')}" placeholder="เช่น ค่าห้อง, Netflix" required maxlength="40"></label>
    <div class="field-row"><label class="field"><span>จำนวน (บาท)</span><input name="amount" inputmode="decimal" value="${b ? b.amount / 100 : ''}" required></label>
      <label class="field"><span>รอบ</span><select name="cadence">${opt('monthly', 'ทุกเดือน', b?.cadence !== 'yearly')}${opt('yearly', 'ทุกปี', b?.cadence === 'yearly')}</select></label></div>
    <div class="field-row"><label class="field"><span>วันที่ครบกำหนด</span><select name="day">${Array.from({ length: 31 }, (_, i) => opt(String(i + 1), String(i + 1), (b?.dueDay ?? 1) === i + 1)).join('')}</select></label>
      <label class="field"><span>เดือน (รายปี)</span><select name="month">${U.MON.map((mn, i) => opt(String(i + 1), mn, (b?.dueMonth ?? 1) === i + 1)).join('')}</select></label></div>
    <label class="field"><span>หมวด</span><select name="cat">${cats.map(c => opt(c.id, c.name, (b?.categoryId ?? 'cat_home') === c.id)).join('')}</select></label>
    <label class="field"><span>จ่ายจากบัญชี</span><select name="acc">${accs.map(a => opt(a.id, a.name, (b?.accountId ?? prefs.lastAccount) === a.id)).join('')}</select></label>
    <label class="check"><input type="checkbox" name="sub" ${b?.isSubscription ? 'checked' : ''}>เป็น Subscription</label>
    ${b ? `<label class="check"><input type="checkbox" name="active" ${b.active ? 'checked' : ''}>ใช้งานอยู่ (ปิดเมื่อยกเลิกบริการแล้ว)</label>` : ''}`,
    f => {
      const data = { name: val(f, 'name').trim(), amount: num(val(f, 'amount')), cadence: val(f, 'cadence') as Bill['cadence'], dueDay: Number(val(f, 'day')), dueMonth: val(f, 'cadence') === 'yearly' ? Number(val(f, 'month')) : undefined, categoryId: val(f, 'cat'), accountId: val(f, 'acc'), isSubscription: checked(f, 'sub') };
      if (!data.name) throw new Error('ใส่ชื่อบิล');
      if (!data.amount) throw new Error('ใส่จำนวนเงิน');
      if (b) svc.updateBill(b.id, { ...data, active: checked(f, 'active') }); else svc.addBill(data);
      U.toast(b ? 'บันทึกแล้ว' : `เพิ่มบิล ${data.name}`);
    });
  const sync = () => { const y = val(el.querySelector('form')!, 'cadence') === 'yearly'; (el.querySelector('[name=month]') as HTMLSelectElement).disabled = !y; };
  el.querySelector('[name=cadence]')!.addEventListener('change', sync); sync();
}

function goalForm(g?: Goal) {
  formSheet(g ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมาย', `
    <label class="field"><span>ชื่อเป้าหมาย</span><input name="name" value="${esc(g?.name ?? '')}" placeholder="เช่น เงินสำรองฉุกเฉิน" maxlength="40"></label>
    <div class="field-row"><label class="field"><span>ยอดเป้าหมาย (บาท)</span><input name="target" inputmode="decimal" value="${g ? g.target / 100 : ''}"></label>
    <label class="field"><span>ออมต่อเดือน (บาท)</span><input name="monthly" inputmode="decimal" value="${g ? g.monthlyContribution / 100 : ''}"></label></div>
    <label class="field"><span>อยากถึงภายใน (ไม่บังคับ)</span><input name="date" type="date" value="${g?.targetDate ?? ''}"></label>
    ${g ? `<label class="check"><input type="checkbox" name="arch">ซ่อนเป้าหมายนี้ (เก็บประวัติไว้)</label>` : ''}`,
    f => {
      const d = { name: val(f, 'name').trim(), target: num(val(f, 'target')), monthlyContribution: num(val(f, 'monthly')), targetDate: val(f, 'date') || undefined };
      if (!d.name) throw new Error('ใส่ชื่อเป้าหมาย');
      if (g) svc.updateGoal(g.id, { ...d, archived: checked(f, 'arch') }); else svc.addGoal(d);
    });
}

function accountForm(a?: Account & { balance: number }) {
  formSheet(a ? a.name : 'เพิ่มบัญชี', `
    <label class="field"><span>ชื่อบัญชี</span><input name="name" value="${esc(a?.name ?? '')}" placeholder="เช่น SCB, ShopeePay" maxlength="30"></label>
    <label class="field"><span>ประเภท</span><select name="kind">${opt('bank', 'บัญชีธนาคาร', a?.kind === 'bank' || !a)}${opt('wallet', 'e-Wallet', a?.kind === 'wallet')}${opt('cash', 'เงินสด', a?.kind === 'cash')}</select></label>
    <label class="field"><span>${a ? 'ยอดจริงตอนนี้ (บาท)' : 'ยอดเงินตอนนี้ (บาท)'}</span><input name="bal" inputmode="decimal" value="${a ? a.balance / 100 : ''}" placeholder="0"><div class="hint">${a ? 'ใส่ยอดตามแอปธนาคาร ระบบจะปรับยอดเริ่มต้นให้ตรง โดยไม่แตะรายการเดิม' : ''}</div></label>
    <label class="check"><input type="checkbox" name="spend" ${a ? (a.spendable ? 'checked' : '') : 'checked'}>เงินใช้จ่าย (นับใน "ใช้ได้")</label>
    ${a ? `<label class="check"><input type="checkbox" name="arch">ซ่อนบัญชีนี้</label>` : ''}`,
    f => {
      const name = val(f, 'name').trim(); if (!name) throw new Error('ใส่ชื่อบัญชี');
      const bal = num(val(f, 'bal'));
      if (a) svc.updateAccount(a.id, { name, kind: val(f, 'kind') as Account['kind'], spendable: checked(f, 'spend'), archived: checked(f, 'arch'), openingBalance: a.openingBalance + (bal - a.balance) });
      else svc.addAccount({ name, kind: val(f, 'kind') as Account['kind'], spendable: checked(f, 'spend'), openingBalance: bal });
    });
}

function categoryForm(c?: Category, kind: Category['kind'] = st.catTab) {
  let icon = c ? catIcon(c) : kind === 'income' ? 'income' : 'other';
  const k = c?.kind ?? kind;
  const el = formSheet(c ? 'แก้ไขหมวด' : `หมวด${k === 'expense' ? 'รายจ่าย' : 'รายรับ'}ใหม่`, `
    <label class="field"><span>ชื่อหมวด</span><input name="name" value="${esc(c?.name ?? '')}" maxlength="24"></label>
    <div class="field"><span>ไอคอน</span><div class="cat-grid" id="icons">${ICON_CHOICES.map(i => `<button type="button" class="cat" data-ic="${i}" aria-pressed="${i === icon}" aria-label="${i}">${ic(i)}</button>`).join('')}</div></div>
    ${k === 'income' ? `<label class="field"><span>ประเภทเงินได้ (สำหรับภาษี)</span><select name="tax">${opt('', 'ไม่นับภาษี', !c?.taxSection)}${opt('40(1)', '40(1) เงินเดือน', c?.taxSection === '40(1)')}${opt('40(2)', '40(2) ค่าจ้าง/ฟรีแลนซ์', c?.taxSection === '40(2)')}${opt('40(8)', '40(8) ธุรกิจ/ขายของ', c?.taxSection === '40(8)')}</select></label>` : ''}
    ${c ? `<label class="check"><input type="checkbox" name="arch" ${c.archived ? 'checked' : ''}>ซ่อนหมวดนี้</label>` : ''}`,
    f => {
      const name = val(f, 'name').trim(); if (!name) throw new Error('ใส่ชื่อหมวด');
      const tax = (val(f, 'tax') || undefined) as Category['taxSection'];
      if (c) svc.updateCategory(c.id, { name, icon, taxSection: tax, archived: checked(f, 'arch') });
      else svc.addCategory({ name, kind: k, icon, taxSection: tax });
    });
  el.querySelectorAll<HTMLButtonElement>('[data-ic]').forEach(b => b.addEventListener('click', () => { icon = b.dataset.ic!; el.querySelectorAll('[data-ic]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
}

function allowanceForm(i?: number) {
  const s = svc.getSettings();
  const a = i !== undefined ? s.taxAllowances[i] : undefined;
  formSheet(a ? 'แก้ไขค่าลดหย่อน' : 'เพิ่มค่าลดหย่อน', `
    <label class="field"><span>รายการ</span><input name="label" value="${esc(a?.label ?? '')}" list="allow-list" placeholder="เช่น ประกันสังคม"><datalist id="allow-list"><option>ประกันสังคม</option><option>เบี้ยประกันชีวิต</option><option>เบี้ยประกันสุขภาพ</option><option>กองทุน RMF</option><option>กองทุน ThaiESG</option><option>ค่าลดหย่อนบิดามารดา</option></datalist></label>
    <label class="field"><span>จำนวน (บาท ต่อปี)</span><input name="amount" inputmode="decimal" value="${a ? a.amount / 100 : ''}"></label>`,
    f => {
      const label = val(f, 'label').trim(); const amount = num(val(f, 'amount'));
      if (!label || !amount) throw new Error('ใส่ชื่อและจำนวน');
      const list = [...s.taxAllowances];
      if (i !== undefined) list[i] = { label, amount }; else list.push({ label, amount });
      svc.updateSettings({ taxAllowances: list });
    }, i !== undefined ? `<button class="btn danger" data-del>ลบ</button>` : '');
  U.sheetEl()?.querySelector('[data-del]')?.addEventListener('click', () => { const list = s.taxAllowances.filter((_, j) => j !== i); svc.updateSettings({ taxAllowances: list }); U.closeSheet(); render(); });
}

// ------------------------------------------------------------------ backup
function exportJson() {
  const d = svc.snapshot();
  U.download(`nexus-backup-${svc.today()}.json`, JSON.stringify(d, null, 1), 'application/json');
  setPrefs({ lastBackup: svc.today() });
  U.toast('ดาวน์โหลดไฟล์สำรองแล้ว — เก็บไว้ใน Google Drive');
  render();
}
async function restore(file: File) {
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { U.toast('ไฟล์นี้ไม่ใช่ไฟล์สำรอง NEXUS', { error: true }); return; }
  const n = Array.isArray(data?.transactions) ? data.transactions.length : 0;
  U.confirmSheet({
    title: 'กู้คืนข้อมูล?', danger: true, ok: 'แทนที่ข้อมูล',
    body: `ข้อมูลทั้งหมดในเครื่องนี้ (${svc.snapshot().transactions.length} รายการ) จะถูกแทนที่ด้วยไฟล์ <b>${esc(file.name)}</b> (${n} รายการ) ย้อนกลับไม่ได้ — ถ้าไม่แน่ใจ ให้ดาวน์โหลดไฟล์สำรองของตอนนี้ก่อน`,
    onOk: () => { if (tryDo(() => svc.replaceAll(data))) { setPrefs({ demo: false, onboarded: true }); render(); U.toast('กู้คืนเรียบร้อย'); } },
  });
}

// ------------------------------------------------------------------ onboarding
function onboarding(step = 0, draft: { bal: Record<string, string>; cycle: number; none?: boolean } = { bal: {}, cycle: 1 }) {
  let el = $('#onb') as HTMLElement | null;
  if (!el) { el = document.createElement('div'); el.id = 'onb'; el.className = 'onb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'เริ่มต้นใช้งาน NEXUS'); document.body.append(el); }
  const accs = svc.getAccounts();
  const stepTag = (n: number) => `<div class="steps" aria-hidden="true"><b>${String(n).padStart(2, '0')}</b> / 03</div>`;
  if (step === 0) {
    el.innerHTML = `<div class="tri"></div><div class="onb-top"><div class="micro">// PERSONAL FINANCE OS</div></div>
      <div class="onb-b"><div class="onb-hero">NEX<span>US</span></div>
        <p style="font-size:18px;margin-top:18px;font-weight:500">รู้ทุกวันว่า "ใช้ได้อีกเท่าไหร่" โดยไม่ต้องเดา</p>
        <div class="card rows" style="margin-top:20px">
          <div class="row">${'<span class="ic">' + ic('phone') + '</span>'}<span class="mid"><span class="n">ข้อมูลอยู่ในเครื่องนี้เท่านั้น</span><span class="s">ไม่มีเซิร์ฟเวอร์ ไม่ต้องสมัคร</span></span></div>
          <div class="row"><span class="ic">${ic('plus')}</span><span class="mid"><span class="n">จดได้ในไม่กี่วินาที</span><span class="s">ตัวเลข → หมวด → บันทึก</span></span></div>
          <div class="row"><span class="ic">${ic('check')}</span><span class="mid"><span class="n">ฟรี ใช้ได้ออฟไลน์</span><span class="s">ติดตั้งลงหน้าจอหลักได้</span></span></div>
        </div></div>
      <div class="onb-f"><button class="btn primary block" data-o="start">เริ่มตั้งค่า (1 นาที)</button><button class="btn block" data-o="demo">ลองดูด้วยข้อมูลตัวอย่างก่อน</button>
        <label class="btn block" style="cursor:pointer">กู้คืนจากไฟล์สำรอง<input type="file" id="onb-restore" accept=".json" class="sr"></label></div>`;
  } else if (step === 1) {
    el.innerHTML = `<div class="tri"></div><div class="onb-top">${stepTag(1)}</div>
      <div class="onb-b"><h2 style="font-size:24px">ตอนนี้มีเงินอยู่เท่าไหร่?</h2><p class="muted" style="margin:6px 0 18px">เปิดแอปธนาคาร/วอลเล็ตแล้วใส่ยอดตามจริง ไม่มีใส่ 0 ได้ — เปลี่ยนชื่อหรือเพิ่มบัญชีได้ทีหลัง</p>
      ${accs.map(a => `<label class="field"><span>${ic(accIcon(a.kind)).replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"')}${esc(a.name)}${a.spendable ? '' : ' (เงินออม)'}</span><input data-bal="${a.id}" inputmode="decimal" placeholder="0" value="${esc(draft.bal[a.id] ?? '')}"></label>`).join('')}</div>
      <div class="onb-f"><button class="btn primary block" data-o="next1">ต่อไป</button><button class="btn block" data-o="back0">ย้อนกลับ</button></div>`;
  } else if (step === 2) {
    el.innerHTML = `<div class="tri"></div><div class="onb-top">${stepTag(2)}</div>
      <div class="onb-b"><h2 style="font-size:24px">มีรายได้ประจำไหม?</h2><p class="muted" style="margin:6px 0 18px">ใช้กำหนดว่าหน้าหลักจะบอกอะไร — เปลี่ยนได้ทีหลังในตั้งค่า</p>
      <div class="card rows">
        <button class="row" data-onb-mode="regular" aria-pressed="${!draft.none}" style="${!draft.none ? 'box-shadow:inset 4px 0 0 var(--signal)' : ''}"><span class="ic">${ic('salary')}</span><span class="mid"><span class="n">มีรายได้ประจำ</span><span class="s">บอก "ใช้ได้อีกเท่าไหร่ในรอบนี้" นับตามวันเงินเข้า</span></span>${!draft.none ? ic('check') : ''}</button>
        <button class="row" data-onb-mode="none" aria-pressed="${!!draft.none}" style="${draft.none ? 'box-shadow:inset 4px 0 0 var(--signal)' : ''}"><span class="ic">${ic('savings')}</span><span class="mid"><span class="n">ยังไม่มีรายได้ประจำ</span><span class="s">บอก "เงินที่มีพอใช้อีกกี่วัน" จากค่าใช้จ่ายจริง</span></span>${draft.none ? ic('check') : ''}</button>
      </div>
      ${draft.none ? '' : `<div class="qa-lab" style="margin-top:18px"><span>เงินเข้าวันที่</span></div>
      <div class="chips" style="flex-wrap:wrap">${[1, 15, 25, 28].map(d => `<button class="chip" data-cyc-set="${d}" aria-pressed="${draft.cycle === d}">วันที่ ${d}</button>`).join('')}</div>
      <label class="field" style="margin-top:14px"><span>หรือเลือกวันอื่น</span><select id="onb-cyc">${Array.from({ length: 28 }, (_, i) => opt(String(i + 1), `วันที่ ${i + 1}`, draft.cycle === i + 1)).join('')}</select></label>`}</div>
      <div class="onb-f"><button class="btn primary block" data-o="next2">ต่อไป</button><button class="btn block" data-o="back1">ย้อนกลับ</button></div>`;
  } else {
    el.innerHTML = `<div class="tri"></div><div class="onb-top">${stepTag(3)}</div>
      <div class="onb-b"><h2 style="font-size:24px">พร้อมแล้ว</h2>
      <div class="card rows" style="margin-top:16px">
        <div class="row"><span class="ic" style="background:var(--signal);color:#000;border-color:#000">${ic('plus')}</span><span class="mid"><span class="n">จดทันทีหลังสแกนจ่าย</span><span class="s">ปุ่ม + สีเหลืองตรงกลาง — รายการที่จดบ่อยจะขึ้นให้แตะทีเดียว</span></span></div>
        <div class="row"><span class="ic">${ic('calendar')}</span><span class="mid"><span class="n">ใส่บิลประจำ</span><span class="s">ค่าห้อง ค่าเน็ต Subscription → "ใช้ได้" จะแม่นขึ้นทันที</span></span></div>
        <div class="row"><span class="ic">${ic('tag')}</span><span class="mid"><span class="n">ยังไม่ต้องตั้งงบ</span><span class="s">จดสัก 2–4 สัปดาห์ แล้วตั้งงบจากตัวเลขจริง</span></span></div>
        <div class="row"><span class="ic">${ic('backup')}</span><span class="mid"><span class="n">สำรองข้อมูลสัปดาห์ละครั้ง</span><span class="s">เมนู เพิ่มเติม › สำรองข้อมูล</span></span></div>
      </div></div>
      <div class="onb-f"><button class="btn primary block" data-o="finish">เริ่มใช้ NEXUS</button><button class="btn block" data-o="bills">เพิ่มบิลประจำเลย</button></div>`;
  }
  const on = (k: string, fn: () => void) => el!.querySelector(`[data-o="${k}"]`)?.addEventListener('click', fn);
  const keepBal = () => el!.querySelectorAll<HTMLInputElement>('[data-bal]').forEach(i => { draft.bal[i.dataset.bal!] = i.value; });
  on('start', () => onboarding(1, draft));
  on('demo', () => { loadDemo(svc); setPrefs({ demo: true, onboarded: true }); el!.remove(); render(); U.toast('โหมดตัวอย่าง — ลองกดได้ทุกอย่าง'); });
  on('back0', () => { keepBal(); onboarding(0, draft); });
  on('next1', () => {
    keepBal();
    try { for (const [id, v] of Object.entries(draft.bal)) if (v.trim()) parseBaht(v); } catch { U.toast('ยอดเงินไม่ถูกต้อง', { error: true }); return; }
    onboarding(2, draft);
  });
  el.querySelectorAll<HTMLButtonElement>('[data-onb-mode]').forEach(b => b.addEventListener('click', () => { draft.none = b.dataset.onbMode === 'none'; if (draft.none) draft.cycle = 1; onboarding(2, draft); }));
  el.querySelectorAll<HTMLButtonElement>('[data-cyc-set]').forEach(b => b.addEventListener('click', () => { draft.cycle = Number(b.dataset.cycSet); onboarding(2, draft); }));
  el.querySelector('#onb-cyc')?.addEventListener('change', e => { draft.cycle = Number((e.target as HTMLSelectElement).value); onboarding(2, draft); });
  on('back1', () => onboarding(1, draft));
  on('next2', () => {
    for (const [id, v] of Object.entries(draft.bal)) if (v.trim()) svc.updateAccount(id, { openingBalance: parseBaht(v) });
    svc.updateSettings({ cycleStartDay: draft.cycle, incomeMode: draft.none ? 'none' : 'regular' });
    onboarding(3, draft);
  });
  const finish = (to?: string) => { setPrefs({ onboarded: true, demo: false, lastBoot: svc.today() }); el!.remove(); if (to) location.hash = to; render(); };
  on('finish', () => finish('#home'));
  on('bills', () => { finish('#plan-bills'); setTimeout(() => billForm(), 250); });
  el.querySelector('#onb-restore')?.addEventListener('change', async e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { el!.remove(); await restore(f); } });
  el.scrollTop = 0;
  (el.querySelector('input,button') as HTMLElement | null)?.focus();
}

// ------------------------------------------------------------------ DAILY BOOT LOG (spec 6)
/** First open of the Bangkok day, after onboarding; never in demo, when switched off, or under reduced motion. */
function shouldBoot() {
  if (firstRun || !prefs.onboarded || prefs.demo || prefs.bootLog === false) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return prefs.lastBoot !== svc.today();
}

/** Terminal lines. Labels are English (it is a terminal); names are the user's own. A line with nothing to say is left out. */
function bootLines(): string {
  const today = svc.today();
  let i = 0;
  const line = (html: string, cls = '') => `<div class="bl ${cls}" style="--i:${i++}">${html}</div>`;
  const row = (label: string, value: string, cls: string) =>
    line(`<span aria-hidden="true">&gt; </span>${esc(label)} <span aria-hidden="true">${'.'.repeat(Math.max(3, 20 - label.length))}</span> <span class="${cls}">${value}</span>`);
  const out: string[] = [];
  out.push(line(`<span aria-hidden="true">&gt; </span>BOOT SEQUENCE  <span class="b-dim">${today.replace(/-/g, '.')} ${bkkTime()}</span>`));
  out.push(row('SYNC LEDGER', 'OK', 'b-pos'));

  const accs = svc.getAccounts();
  const bal = accs.reduce((a, x) => a + x.balance, 0);
  if (bal || svc.snapshot().transactions.length) out.push(row('BALANCE', baht(bal), 'b-sig'));

  let shortfall = false;
  if (svc.getSettings().incomeMode === 'none') {
    const r = svc.getRunway();
    if (r.days !== null) out.push(row('RUNWAY', `${r.days > 999 ? '999+' : r.days} DAYS`, r.days < 30 ? 'b-warn' : 'b-sig'));
  } else {
    const st = svc.getSafeToSpend();
    if (st.shortfall > 0) { shortfall = true; out.push(row('SHORTFALL', baht(st.shortfall), 'b-neg')); }
    else if (st.safeToSpend > 0) out.push(row('SAFE TO SPEND', `${baht(st.safeToSpend)}<span class="b-dim"> · ${U.bahtParts(st.perDay).int}/D</span>`, 'b-sig'));
  }

  const bud = svc.getBudgets();
  const plan = bud.lines.reduce((a, l) => a + l.plan, 0), spent = bud.lines.reduce((a, l) => a + l.spent, 0);
  if (plan > 0) {
    const cyc = svc.getSafeToSpend().cycle;
    const elapsed = (daysBetween(cyc.from, today) + 1) / daysBetween(cyc.from, cyc.to);
    const pct = Math.round((spent / plan) * 100);
    out.push(row('MONTH BUDGET', `${pct}% <span class="b-dim">USED</span>`, pct > elapsed * 100 + 10 ? 'b-warn' : 'b-pos'));
  }

  const cycBills = svc.getUpcomingBills();
  const unpaid = cycBills.filter(b => !b.paid).sort((a, b) => a.due.localeCompare(b.due));
  if (unpaid.length) {
    out.push(row('BILLS DUE', `${unpaid.length} PENDING`, 'b-warn'));
    for (const b of unpaid.slice(0, 3)) out.push(line(`· ${esc(b.name)} ${baht(b.amount)} — ${esc(U.relDays(daysBetween(today, b.due)))}`, 'sub'));
  } else if (cycBills.length) out.push(row('BILLS DUE', 'ALL PAID', 'b-pos'));

  const raw = new Map(svc.snapshot().goals.map(g => [g.id, g]));
  const goal = svc.getGoals().filter(g => g.status !== 'done' && raw.get(g.goalId)?.targetDate)
    .sort((a, b) => raw.get(a.goalId)!.targetDate!.localeCompare(raw.get(b.goalId)!.targetDate!))[0];
  if (goal) out.push(row(`GOAL / ${goal.name}`, `${goal.percent}%`, 'b-info'));

  const year = Number(today.slice(0, 4));
  if (svc.getTax(year).projected.totalGross > 0) out.push(row('TAX P.N.D.90', `READY ${year + 1}.03`, 'b-info'));

  const name = prefs.name?.trim();
  out.push(line(shortfall
    ? `<span class="b-warn">WARNING: SHORTFALL</span><i class="boot-cur" aria-hidden="true"></i>`
    : `<span class="b-pos">ALL SYSTEMS ONLINE.</span> WELCOME BACK${name ? `, ${esc(name.toUpperCase())}` : '.'}<i class="boot-cur" aria-hidden="true"></i>`, 'end'));
  return out.join('');
}

/** Full-screen daily summary. All text is in the DOM from the start (animation only hides it visually). */
function showBootLog() {
  setPrefs({ lastBoot: svc.today() });
  const el = document.createElement('div');
  el.id = 'boot';
  el.className = 'boot';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'สรุปประจำวัน');
  el.innerHTML = `<div class="boot-scan" aria-hidden="true"></div>
    <div class="boot-in">
      <div class="boot-head"><i class="tri-v boot-tri" aria-hidden="true"></i>
        <div><b class="boot-logo">NEXUS</b><span class="boot-ver">PERSONAL FINANCE OS · v${APP_VERSION}</span></div>
        <i class="boot-cross" aria-hidden="true"></i></div>
      <section class="boot-term">
        <div class="boot-th" aria-hidden="true"><span>// DAILY BOOT LOG</span><span>TTY-01</span></div>
        ${bootLines()}
        <i class="boot-hatch" aria-hidden="true"></i>
      </section>
      <button type="button" class="btn primary boot-enter">ENTER NEXUS<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4"/></svg></button>
      <p class="boot-hint">แสดงครั้งแรกของวัน · แตะที่ไหนก็ได้เพื่อข้าม</p>
    </div>`;
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  let done = false;
  const close = (e?: Event) => {
    e?.preventDefault(); e?.stopPropagation();
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey, true);
    el.classList.add('out');
    setTimeout(() => { el.remove(); document.body.style.overflow = ''; ($('.mh h1') as HTMLElement | null)?.focus(); }, 300);
  };
  const onKey = (e: KeyboardEvent) => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) close(e); };
  el.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  ($('.boot-enter', el) as HTMLElement).focus();
}

// ------------------------------------------------------------------ events (delegated)
function afterRender(r: Route) {
  if (r.page === 'ledger') {
    renderChart(); renderLedgerList();
    const q = $('#q') as HTMLInputElement | null;
    q?.addEventListener('input', () => { st.ledger.q = q.value; renderLedgerList(); });
    $('#showv')?.addEventListener('change', e => { st.ledger.voided = (e.target as HTMLInputElement).checked; renderLedgerList(); });
  }
  if (r.page === 'more' && r.sub === 'settings') {
    $('#set-cycle')?.addEventListener('change', e => { if (tryDo(() => svc.updateSettings({ cycleStartDay: Number((e.target as HTMLSelectElement).value) }))) U.toast('บันทึกแล้ว'); });
    $('#set-taxres')?.addEventListener('change', e => { const v = (e.target as HTMLInputElement).value; if (tryDo(() => svc.updateSettings({ monthlyTaxReserve: v.trim() ? parseBaht(v) : 0 }))) U.toast('บันทึกแล้ว'); });
    $('#set-hap')?.addEventListener('change', e => { const on = (e.target as HTMLInputElement).checked; setPrefs({ haptics: on }); U.setHaptics(on); });
    $('#set-name')?.addEventListener('change', e => { setPrefs({ name: (e.target as HTMLInputElement).value.trim() || undefined }); U.toast('บันทึกแล้ว'); });
    $('#set-boot')?.addEventListener('change', e => { setPrefs({ bootLog: (e.target as HTMLInputElement).checked }); });
  }
  if (r.page === 'more' && r.sub === 'backup') $('#restore')?.addEventListener('change', e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) restore(f); (e.target as HTMLInputElement).value = ''; });
  if (r.page === 'more' && r.sub === 'tax') $('#rate408')?.addEventListener('change', e => { const v = Number((e.target as HTMLInputElement).value); if (tryDo(() => svc.updateSettings({ section408DeductionRate: v / 100 }))) render(); });
}

document.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tx],[data-pay],[data-plan],[data-bill],[data-goal],[data-contrib],[data-acc],[data-cat],[data-cattab],[data-ltype],[data-cyc],[data-href],[data-theme-set],[data-taxyear],[data-taxbasis],[data-allow],[data-setreserve],[data-income]');
  if (!t || t.closest('.sheet') && !t.matches('[data-href]')) return;
  const d = t.dataset;
  if (d.act) {
    const a = d.act;
    if (a === 'add') openQuickAdd();
    else if (a === 'new-bill') billForm();
    else if (a === 'new-goal') goalForm();
    else if (a === 'new-acc') accountForm();
    else if (a === 'new-cat') categoryForm();
    else if (a === 'new-allow') allowanceForm();
    else if (a === 'export-json') exportJson();
    else if (a === 'export-csv') { U.download(`nexus-${svc.today()}.csv`, svc.exportCsv(), 'text/csv;charset=utf-8'); }
    else if (a === 'reset') U.confirmSheet({ title: 'ล้างข้อมูลทั้งหมด?', danger: true, ok: 'ล้างข้อมูล', body: 'รายการ บัญชี บิล และเป้าหมายทั้งหมดในเครื่องนี้จะถูกลบ ย้อนกลับไม่ได้ ถ้ายังไม่ได้สำรอง ให้กดยกเลิกแล้วดาวน์โหลดไฟล์สำรองก่อน', onOk: () => { svc.replaceAll(defaultData()); setPrefs({ onboarded: false, demo: false, lastBackup: undefined }); location.hash = '#home'; render(); onboarding(); } });
    else if (a === 'end-demo') U.confirmSheet({ title: 'เริ่มใช้จริง?', ok: 'ล้างข้อมูลตัวอย่าง', body: 'ข้อมูลตัวอย่างทั้งหมดจะถูกล้าง แล้วเริ่มตั้งค่าบัญชีของคุณ', onOk: () => { svc.replaceAll(defaultData()); setPrefs({ demo: false, onboarded: false }); location.hash = '#home'; render(); onboarding(1); } });
    else if (a === 'install' && installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; setPrefs({ dismissInstall: true }); render(); }); }
    return;
  }
  if (d.tx) return openEditTx(d.tx);
  if (d.pay) return payBill(d.pay);
  if (d.plan) return openPlan(d.plan);
  if (d.bill) return billForm(svc.getBills().find(b => b.id === d.bill));
  if (d.goal) return goalForm(svc.snapshot().goals.find(g => g.id === d.goal));
  if (d.contrib) return contribute(d.contrib);
  if (d.acc) return accountForm(svc.getAccounts(true).find(a => a.id === d.acc));
  if (d.cat) return categoryForm(svc.getCategories(true).find(c => c.id === d.cat));
  if (d.allow !== undefined) return allowanceForm(Number(d.allow));
  if (d.cattab) { st.catTab = d.cattab as Category['kind']; return render(); }
  if (d.ltype) { st.ledger.type = d.ltype as any; $$('[data-ltype]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); return renderLedgerList(); }
  if (d.cyc) { st.ledger.offset = Math.min(0, st.ledger.offset + Number(d.cyc)); return render(); }
  if (d.href) { location.hash = d.href; return; }
  if (d.themeSet) { setPrefs({ theme: d.themeSet as U.Prefs['theme'] }); U.applyTheme(prefs); return render(); }
  if (d.income) { if (tryDo(() => svc.updateSettings({ incomeMode: d.income as 'regular' | 'none' }))) { U.toast(d.income === 'none' ? 'หน้าหลักจะแสดงว่าเงินพอใช้อีกกี่วัน' : 'กลับเป็นโหมดรอบเงินเดือน'); render(); } return; }
  if (d.taxyear) { st.taxYear = Number(d.taxyear); return render(); }
  if (d.taxbasis) { st.taxBasis = d.taxbasis as any; return render(); }
  if (d.setreserve) { svc.updateSettings({ monthlyTaxReserve: Number(d.setreserve) }); U.toast(`กันเงินภาษีเดือนละ ${baht(Number(d.setreserve))}`); return render(); }
});

// keyboard: N = new, digits into open keypad, Enter = save, Esc = close
document.addEventListener('keydown', e => {
  const tag = (e.target as HTMLElement).tagName;
  const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (e.key === 'Escape' && U.sheetOpen()) { U.closeSheet(); return; }
  const el = U.sheetEl();
  if (el && !typing && el.querySelector('.keypad')) {
    const map: Record<string, string> = { Backspace: 'bs', '+': '+', '.': '.', Enter: 'ok' };
    const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
    if (k) { e.preventDefault(); const btn = el.querySelector<HTMLButtonElement>(`[data-k="${k}"]`); if (btn && !btn.disabled) btn.click(); }
    return;
  }
  if (!U.sheetOpen() && !typing && !$('#onb') && (e.key === 'n' || e.key === 'N' || e.key === '+')) { e.preventDefault(); openQuickAdd(); }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
window.addEventListener('storage', e => { if (e.key === 'nexus.rev' && !U.sheetOpen()) render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !U.sheetOpen()) render(); }); // new day / other tab
window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); installEvt = e; if (route().page === 'home') render(); });

// ------------------------------------------------------------------ start
shell();
render();
if (firstRun || !prefs.onboarded) onboarding();
else {
  const q = new URLSearchParams(location.search);
  const add = q.get('add');
  if (add === 'expense' || add === 'income' || add === 'transfer') { openQuickAdd({ type: add }); history.replaceState(null, '', location.pathname + location.hash); }
  else if (shouldBoot()) showBootLog();
}
try { (navigator as any).storage?.persist?.(); } catch { /* ignore */ }
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic/.test(location.hostname)) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) U.toast('มี NEXUS เวอร์ชันใหม่', { action: { label: 'รีโหลด', run: () => location.reload() } }); });
    });
  }).catch(() => { /* offline-capable only when hosted */ });
}
(window as any).__nexus = { svc, render, version: APP_VERSION };
