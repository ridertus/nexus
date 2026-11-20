// Persistence for one user: a single JSON file, written atomically, with daily backups.
// A year of heavy use is a few thousand transactions (~1–2 MB) — no database needed.
// Anything implementing `Store` can replace this later (e.g. SQLite) without touching engines.
import fs from 'node:fs';
import path from 'node:path';
import type { NexusData } from './types.js';
import { defaultData, migrate } from './seed.js';
export { migrate };
import { todayBangkok } from './dates.js';

export type { Store } from './store-types.js';
import type { Store } from './store-types.js';

export class MemoryStore implements Store {
  constructor(private data: NexusData = defaultData()) {}
  load() { return structuredClone(this.data); }
  save(d: NexusData) { this.data = structuredClone(d); }
}

export class JsonFileStore implements Store {
  readonly file: string;
  readonly backupDir: string;
  constructor(dir: string, private keepBackups = 30) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'nexus.json');
    this.backupDir = path.join(dir, 'backups');
  }

  private lastMtime = -1;
  private mtime() { try { return fs.statSync(this.file).mtimeMs; } catch { return -1; } }
  isStale() { return this.mtime() !== this.lastMtime; }

  load(): NexusData {
    if (!fs.existsSync(this.file)) { const d = defaultData(); this.save(d); return d; }
    const text = fs.readFileSync(this.file, 'utf8');
    this.lastMtime = this.mtime();
    try { return migrate(JSON.parse(text)); }
    catch (e) { throw new Error(`Could not read ${this.file}: ${(e as Error).message}. Restore one from ${this.backupDir}.`); }
  }

  save(data: NexusData): void {
    this.backupOncePerDay();
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, JSON.stringify(data, null, 1)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file); // atomic replace: a crash never leaves a half-written file
    this.lastMtime = this.mtime();
  }

  private backupOncePerDay() {
    if (!fs.existsSync(this.file)) return;
    fs.mkdirSync(this.backupDir, { recursive: true });
    const target = path.join(this.backupDir, `nexus-${todayBangkok()}.json`);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(this.file, target);
    const all = fs.readdirSync(this.backupDir).filter(f => /^nexus-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - this.keepBackups))) {
      try { fs.unlinkSync(path.join(this.backupDir, f)); } catch { /* keep going */ }
    }
  }
}
