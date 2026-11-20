// Small UI toolkit: escaping, formatting, Thai dates, sheet, toast, haptics.
import { formatBaht } from '../src/money.js';
import { parseDate, todayBangkok } from '../src/dates.js';
import { ICONS } from './icons.js';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]!);
export const ic = (name: string) => ICONS[name] ?? ICONS.other!;

/** ฿1,234 (decimals only when non-zero). Uses a real minus sign. */
export const baht = (s: number, o: { sign?: boolean; dec?: boolean } = {}) =>
  formatBaht(s, { decimals: o.dec, sign: o.sign }).replace('-', '−');
/** Split for big displays: { int: "41,676", dec: ".50" | "" } */
export function bahtParts(s: number) {
  const abs = Math.abs(s);
  const int = Math.floor(abs / 100).toLocaleString('en-US');
  const st = abs % 100;
  return { neg: s < 0, int, dec: st ? '.' + String(st).padStart(2, '0') : '' };
}
/** Compact axis label: ฿12k, ฿1.2M */
export function bahtCompact(s: number) {
  const b = s / 100;
  if (Math.abs(b) >= 1e6) return '฿' + (b / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(b) >= 1e3) return '฿' + (b / 1e3).toFixed(b >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return '฿' + Math.round(b);
}

const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const DOW_LONG = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
export const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const be = (y: number) => y + 543;
const dow = (d: string) => { const p = parseDate(d); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); };

/** "20 พ.ย." */
export function dShort(d: string) { const p = parseDate(d); return `${p.d} ${MON[p.m - 1]}`; }
/** "20 พ.ย. 69" */
export function dMed(d: string) { const p = parseDate(d); return `${p.d} ${MON[p.m - 1]} ${String(be(p.y)).slice(2)}`; }
/** Day header: "วันนี้", "เมื่อวาน", or "วันพฤหัสบดี 20 พ.ย." */
export function dHeader(d: string, today = todayBangkok()) {
  if (d === today) return 'วันนี้';
  const t = parseDate(today);
  const y = new Date(Date.UTC(t.y, t.m - 1, t.d - 1)).toISOString().slice(0, 10);
  if (d === y) return 'เมื่อวาน';
  const p = parseDate(d);
  return `${DOW_LONG[dow(d)]} ${p.d} ${MON[p.m - 1]}${p.y !== t.y ? ' ' + be(p.y) : ''}`;
}
export const dowShort = (d: string) => DOW[dow(d)]!;
export function relDays(n: number) {
  if (n === 0) return 'วันนี้';
  if (n === 1) return 'พรุ่งนี้';
  if (n === -1) return 'เมื่อวาน';
  return n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`;
}

// ---------------- prefs ----------------
export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  haptics: boolean;
  lastAccount?: string;
  lastBackup?: string;           // ISO date
  demo?: boolean;
  onboarded?: boolean;
  dismissInstall?: boolean;
}
const PREF_KEY = 'nexus.prefs';
export function loadPrefs(): Prefs {
  try { return { theme: 'auto', haptics: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { theme: 'auto', haptics: true }; }
}
export function savePrefs(p: Prefs) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export function applyTheme(p: Prefs) {
  const dark = p.theme === 'dark' || (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d0d0e' : '#f2f2f2');
}

let hapticsOn = true;
export const setHaptics = (on: boolean) => { hapticsOn = on; };
export const buzz = (ms = 10) => { if (hapticsOn) try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

// ---------------- toast ----------------
let toastTimer = 0;
export function toast(msg: string, opts: { undo?: () => void; error?: boolean; action?: { label: string; run: () => void } } = {}) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.append(el); }
  el.classList.toggle('err', !!opts.error);
  const act = opts.undo ? { label: 'เลิกทำ', run: opts.undo, icon: ic('undo') } : opts.action ? { ...opts.action, icon: '' } : null;
  el.innerHTML = `<span>${esc(msg)}</span>${act ? `<button type="button">${act.icon}${esc(act.label)}</button>` : ''}`;
  if (act) el.querySelector('button')!.onclick = () => { el!.classList.remove('on'); act.run(); };
  requestAnimationFrame(() => el!.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('on'), act ? 5000 : 2600);
}

// ---------------- sheet (bottom sheet on phone, dialog on desktop) ----------------
let current: { el: HTMLElement; scrim: HTMLElement; onClose?: () => void; prevFocus: Element | null } | null = null;

export interface SheetOpts { title?: string; head?: string; body: string; foot?: string; keypad?: string; cls?: string; onClose?: () => void; label?: string }
export function openSheet(o: SheetOpts): HTMLElement {
  closeSheet(true);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = 'sheet ' + (o.cls ?? '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', o.label ?? o.title ?? 'NEXUS');
  el.innerHTML = `<div class="grab" aria-hidden="true"></div>
    <div class="sheet-h">${o.head ?? `<h3>${esc(o.title ?? '')}</h3>`}<button class="icon-btn" data-close aria-label="ปิด">${ic('close')}</button></div>
    <div class="sheet-b">${o.body}</div>
    ${o.foot ? `<div class="sheet-f">${o.foot}</div>` : ''}${o.keypad ?? ''}`;
  document.body.append(scrim, el);
  scrim.onclick = () => closeSheet();
  el.querySelector('[data-close]')!.addEventListener('click', () => closeSheet());
  current = { el, scrim, onClose: o.onClose, prevFocus: document.activeElement };
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); });
  // swipe down to close (phone)
  let y0 = 0, dy = 0;
  const grabZone = el.querySelector('.sheet-h') as HTMLElement;
  grabZone.addEventListener('touchstart', e => { y0 = e.touches[0]!.clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
  grabZone.addEventListener('touchmove', e => { dy = Math.max(0, e.touches[0]!.clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
  grabZone.addEventListener('touchend', () => { el.style.transition = ''; el.style.transform = ''; if (dy > 90) closeSheet(); });
  return el;
}
export function closeSheet(silent = false) {
  if (!current) return;
  const { el, scrim, onClose, prevFocus } = current;
  current = null;
  el.classList.remove('on'); scrim.classList.remove('on');
  document.body.style.overflow = '';
  setTimeout(() => { el.remove(); scrim.remove(); }, 220);
  if (!silent) { onClose?.(); (prevFocus as HTMLElement | null)?.focus?.(); }
}
export const sheetOpen = () => current !== null;
export const sheetEl = () => current?.el ?? null;

/** Confirm dialog for destructive or irreversible actions. */
export function confirmSheet(o: { title: string; body: string; ok: string; danger?: boolean; onOk: () => void }) {
  const el = openSheet({
    title: o.title, body: `<p style="font-size:15px">${o.body}</p>`,
    foot: `<button class="btn" data-no style="flex:1">ยกเลิก</button><button class="btn ${o.danger ? 'danger' : 'primary'}" data-ok style="flex:1">${esc(o.ok)}</button>`,
  });
  el.querySelector('[data-no]')!.addEventListener('click', () => closeSheet());
  el.querySelector('[data-ok]')!.addEventListener('click', () => { closeSheet(true); o.onOk(); });
}

export function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
