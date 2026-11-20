// Line icons, 24px grid, stroke = currentColor. Original drawings.
const s = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS: Record<string, string> = {
  food: s('<path d="M4 3v7a3 3 0 003 3v8M7 3v6M10 3v7a3 3 0 01-3 3"/><path d="M17 21V3c-2 1-3 3.5-3 7v3h3"/>'),
  transport: s('<rect x="5" y="3" width="14" height="14" rx="2"/><path d="M5 11h14M8 21l1.5-4M16 21l-1.5-4"/><circle cx="8.5" cy="14" r=".6" fill="currentColor"/><circle cx="15.5" cy="14" r=".6" fill="currentColor"/>'),
  home: s('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10M10 20v-5h4v5"/>'),
  shopping: s('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 016 0v2"/>'),
  subs: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/><path d="M17 13l1.5 1.5L17 16"/>'),
  fun: s('<rect x="2.5" y="7" width="19" height="10" rx="4"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="11" r=".7" fill="currentColor"/><circle cx="18" cy="13" r=".7" fill="currentColor"/>'),
  health: s('<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/><path d="M9 11h6M12 8v6"/>'),
  other: s('<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'),
  salary: s('<rect x="3" y="6" width="18" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/>'),
  freelance: s('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 7l3 3"/>'),
  income: s('<path d="M12 3v14M6 11l6 6 6-6"/><path d="M4 21h16"/>'),
  gift: s('<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"/>'),
  transfer: s('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  savings: s('<path d="M5 11a7 6 0 0113 0v4l2 1v3h-3l-1-1.5a8 8 0 01-8 0L7 19H4l1-3.5A6 6 0 015 11z"/><path d="M10 6.5h4"/>'),
  bank: s('<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  wallet: s('<path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H4z"/><path d="M4 7l11-3v3M16 13.5h2"/>'),
  cash: s('<rect x="2.5" y="6" width="19" height="12" rx="1"/><circle cx="12" cy="12" r="2.5"/><path d="M6 6v12M18 6v12"/>'),
  edu: s('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>'),
  phone: s('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
  pet: s('<circle cx="6" cy="10" r="1.6"/><circle cx="10" cy="6" r="1.6"/><circle cx="14" cy="6" r="1.6"/><circle cx="18" cy="10" r="1.6"/><path d="M12 11c-3 0-5 4-5 6s2 3 5 2 5 0 5-2-2-6-5-6z"/>'),
  coffee: s('<path d="M4 9h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 010 5H16M8 3v3M12 3v3"/>'),
  // UI
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  homeNav: s('<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>'),
  list: s('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  plan: s('<rect x="3" y="4" width="18" height="17" rx="1.5"/><path d="M3 9h18M8 2.5v3M16 2.5v3M7 13h4M7 17h7"/>'),
  more: s('<rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  backspace: s('<path d="M8 5h12v14H8l-6-7z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  arrowDR: s('<path d="M7 7l10 10M17 9v8H9"/>'),
  chevron: s('<path d="M9 5l7 7-7 7"/>'),
  tax: s('<path d="M6 2.5h9l4 4V21.5H6z"/><path d="M15 2.5v4h4M9 12l6 6M9.5 17.5h.01M14.5 12.5h.01"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  backup: s('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>'),
  tag: s('<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.3"/>'),
  bell: s('<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  target: s('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
  alert: s('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>'),
  undo: s('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/>'),
  calendar: s('<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: s('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
};

/** Default icon for a category (by seed id, then by name keywords). */
export function catIcon(c: { id: string; name: string; kind: string; icon?: string }): string {
  if (c.icon && ICONS[c.icon]) return c.icon;
  const byId: Record<string, string> = {
    cat_salary: 'salary', cat_freelance: 'freelance', cat_other_in: 'income', cat_food: 'food',
    cat_transport: 'transport', cat_home: 'home', cat_shopping: 'shopping', cat_subs: 'subs',
    cat_fun: 'fun', cat_health: 'health', cat_other_out: 'other',
  };
  if (byId[c.id]) return byId[c.id]!;
  const n = c.name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/อาหาร|ข้าว|food|กิน/, 'food'], [/กาแฟ|coffee|ชา/, 'coffee'], [/เดินทาง|รถ|bts|mrt|น้ำมัน|grab/, 'transport'],
    [/บ้าน|ห้อง|ค่าน้ำ|ค่าไฟ|rent/, 'home'], [/ช้อป|shop|ของใช้/, 'shopping'], [/sub|netflix|spotify|youtube/, 'subs'],
    [/เกม|game|หนัง|บันเทิง/, 'fun'], [/สุขภาพ|ยา|หมอ|health|gym|ฟิต/, 'health'], [/เรียน|หนังสือ|course|edu/, 'edu'],
    [/โทรศัพท์|เน็ต|มือถือ|phone|internet/, 'phone'], [/แมว|หมา|สัตว์|pet/, 'pet'], [/ของขวัญ|gift|ให้/, 'gift'],
    [/เงินเดือน|salary/, 'salary'], [/ฟรีแลนซ์|freelance|งาน/, 'freelance'],
  ];
  for (const [re, ic] of rules) if (re.test(n)) return ic;
  return c.kind === 'income' ? 'income' : 'other';
}

export const ICON_CHOICES = ['food', 'coffee', 'transport', 'home', 'shopping', 'subs', 'fun', 'health', 'edu', 'phone', 'pet', 'gift', 'salary', 'freelance', 'income', 'other'];

export const accIcon = (kind: string) => (kind === 'wallet' ? 'wallet' : kind === 'cash' ? 'cash' : 'bank');
