import type { DateStr } from './types.js';

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateStr = (y: number, m: number, d: number): DateStr => `${y}-${pad(m)}-${pad(d)}`;

export function parseDate(s: DateStr): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date "${s}" (expected YYYY-MM-DD)`);
  const r = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (r.m < 1 || r.m > 12 || r.d < 1 || r.d > daysInMonth(r.y, r.m)) throw new Error(`Invalid date "${s}"`);
  return r;
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Today in Asia/Bangkok, regardless of the machine's timezone. */
export function todayBangkok(now = new Date()): DateStr {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

const clampDay = (y: number, m: number, d: number) => Math.min(d, daysInMonth(y, m));

export interface DateRange { from: DateStr; to: DateStr } // [from, to) — `to` exclusive

/** The pay cycle containing `date`. */
export function cycleFor(date: DateStr, startDay: number): DateRange {
  const { y, m, d } = parseDate(date);
  let start = { y, m };
  if (d < clampDay(y, m, startDay)) start = addMonths(y, m, -1);
  const next = addMonths(start.y, start.m, 1);
  return {
    from: toDateStr(start.y, start.m, clampDay(start.y, start.m, startDay)),
    to: toDateStr(next.y, next.m, clampDay(next.y, next.m, startDay)),
  };
}

export const inRange = (d: DateStr, r: DateRange) => d >= r.from && d < r.to;

export function daysBetween(a: DateStr, b: DateStr): number {
  const pa = parseDate(a), pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Every date in [r.from, r.to) that falls on `day` of a month (clamped), optionally only in `month`. */
export function occurrencesIn(r: DateRange, day: number, month?: number): DateStr[] {
  const out: DateStr[] = [];
  const s = parseDate(r.from);
  let cur = { y: s.y, m: s.m };
  for (let i = 0; i < 400; i++) {
    const ds = toDateStr(cur.y, cur.m, clampDay(cur.y, cur.m, day));
    if (ds >= r.to) break;
    if (ds >= r.from && (month === undefined || month === cur.m)) out.push(ds);
    cur = addMonths(cur.y, cur.m, 1);
  }
  return out;
}
