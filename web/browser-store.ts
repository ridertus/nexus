// Browser persistence: localStorage (synchronous, ~5 MB — years of personal data).
// Same JSON shape as the CLI's nexus.json, so backups move freely between them.
import type { Store } from '../src/store-types.js';
import type { NexusData } from '../src/types.js';
import { defaultData, migrate } from '../src/seed.js';

const KEY = 'nexus.data';
const REV = 'nexus.rev';

/** localStorage, or an in-memory stand-in when the browser blocks it (data then lasts only this session). */
export function safeStorage(): { ls: Storage; persistent: boolean } {
  try { const t = '__nx'; localStorage.setItem(t, t); localStorage.removeItem(t); return { ls: localStorage, persistent: true }; }
  catch {
    const m = new Map<string, string>();
    const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
    return { ls, persistent: false };
  }
}

export class LocalStorageStore implements Store {
  private seenRev = '';
  constructor(private ls: Storage = safeStorage().ls) {}

  exists() { return this.ls.getItem(KEY) !== null; }

  load(): NexusData {
    const text = this.ls.getItem(KEY);
    this.seenRev = this.ls.getItem(REV) ?? '';
    if (!text) return defaultData();
    return migrate(JSON.parse(text));
  }

  save(data: NexusData): void {
    const text = JSON.stringify(data);
    try {
      this.ls.setItem(KEY, text);
    } catch (e) {
      throw new Error('พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม — สำรองข้อมูลแล้วล้างรายการเก่า');
    }
    const rev = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    this.ls.setItem(REV, rev);
    this.seenRev = rev;
  }

  /** Another tab/window saved since we last loaded or saved. */
  isStale() { return (this.ls.getItem(REV) ?? '') !== this.seenRev; }
}
