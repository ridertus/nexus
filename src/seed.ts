import type { NexusData, Category } from './types.js';

export const SCHEMA_VERSION = 1;

const cat = (id: string, name: string, kind: Category['kind'], extra: Partial<Category> = {}): Category =>
  ({ id, name, kind, archived: false, ...extra });

/** A fresh file: common Thai categories, one wallet + one bank + cash. Rename freely. */
export function defaultData(): NexusData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { cycleStartDay: 1, monthlyTaxReserve: 0, taxAllowances: [], section408DeductionRate: 0.6 },
    accounts: [
      { id: 'acc_bank', name: 'Krungthai NEXT', kind: 'bank', openingBalance: 0, spendable: true, archived: false },
      { id: 'acc_tmw', name: 'TrueMoney', kind: 'wallet', openingBalance: 0, spendable: true, archived: false },
      { id: 'acc_cash', name: 'เงินสด', kind: 'cash', openingBalance: 0, spendable: true, archived: false },
      { id: 'acc_savings', name: 'บัญชีเงินออม', kind: 'bank', openingBalance: 0, spendable: false, archived: false },
    ],
    categories: [
      cat('cat_salary', 'เงินเดือน', 'income', { taxSection: '40(1)' }),
      cat('cat_freelance', 'ฟรีแลนซ์', 'income', { taxSection: '40(2)' }),
      cat('cat_other_in', 'รายรับอื่น', 'income'),
      cat('cat_food', 'อาหาร', 'expense'),
      cat('cat_transport', 'เดินทาง', 'expense'),
      cat('cat_home', 'ที่พัก/ค่าน้ำไฟ', 'expense'),
      cat('cat_shopping', 'ช้อปปิ้ง', 'expense'),
      cat('cat_subs', 'Subscription', 'expense'),
      cat('cat_fun', 'เกม/บันเทิง', 'expense'),
      cat('cat_health', 'สุขภาพ', 'expense'),
      cat('cat_other_out', 'อื่น ๆ', 'expense'),
    ],
    transactions: [],
    bills: [],
    goals: [],
  };
}

type Migration = (d: any) => any;
/** migrations[n] upgrades schema n → n+1. Append only. */
const migrations: Record<number, Migration> = {
  // 1: d => { d.newField = ...; return d; },
};

export function migrate(raw: any): NexusData {
  let d = raw;
  let v: number = d.schemaVersion ?? 1;
  if (v > SCHEMA_VERSION) throw new Error(`Data file is schema v${v}, this NEXUS only knows v${SCHEMA_VERSION}. Update NEXUS.`);
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from schema v${v}`);
    d = m(d); v++; d.schemaVersion = v;
  }
  return d as NexusData;
}

