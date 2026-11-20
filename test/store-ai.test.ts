import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonFileStore, MemoryStore } from '../src/store.js';
import { NexusService } from '../src/service.js';
import { nexusTools, runNexusToolSafe } from '../src/ai-tools.js';

test('JSON store persists across restarts and makes a daily backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-'));
  const a = new NexusService(new JsonFileStore(dir));
  a.addTransaction({ type: 'income', amount: 100_00, accountId: 'acc_bank', categoryId: 'cat_other_in' });
  a.addTransaction({ type: 'expense', amount: 40_00, accountId: 'acc_bank', categoryId: 'cat_food' });
  const b = new NexusService(new JsonFileStore(dir));
  assert.equal(b.getTransactions().length, 2);
  assert.equal(b.getAccounts().find(x => x.id === 'acc_bank')!.balance, 60_00);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 1);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), []);
});

test('failed save leaves memory state unchanged', () => {
  const store = new MemoryStore();
  const svc = new NexusService(store);
  store.save = () => { throw new Error('disk full'); };
  assert.throws(() => svc.addTransaction({ type: 'expense', amount: 100, accountId: 'acc_bank', categoryId: 'cat_food' }), /disk full/);
  assert.equal(svc.getTransactions().length, 0);
});

test('newer schema file is refused, not silently downgraded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-'));
  fs.writeFileSync(path.join(dir, 'nexus.json'), JSON.stringify({ schemaVersion: 99 }));
  assert.throws(() => new JsonFileStore(dir).load(), /schema v99/);
});

test('AI can read in baht and only draft writes; there is no confirm tool', async () => {
  const svc = new NexusService(new MemoryStore(), () => '2026-11-20');
  svc.updateAccount('acc_bank', { openingBalance: 5_000_00 });
  const sts = await runNexusToolSafe(svc, 'nexus_get_safe_to_spend');
  assert.equal((sts as any).result.safeToSpend, 5000);

  const r: any = await runNexusToolSafe(svc, 'nexus_propose_transaction', { type: 'expense', amount: 59.5, accountId: 'acc_tmw', categoryId: 'cat_food', note: 'ชาไทย' });
  assert.equal(r.ok, true);
  assert.equal(svc.getTransactions().length, 0, 'nothing saved before human confirms');
  assert.ok(!nexusTools.some(t => /confirm/.test(t.name)));

  const t = svc.confirmDraft(r.result.draftId);   // this is what the UI button calls
  assert.equal(t.amount, 59_50);
  assert.equal(t.source, 'ai');
  assert.throws(() => svc.confirmDraft(r.result.draftId), /No pending draft/);

  const bad: any = await runNexusToolSafe(svc, 'nexus_propose_transaction', { type: 'expense', amount: 10, accountId: 'acc_tmw', categoryId: 'cat_salary' });
  assert.equal(bad.ok, false);
});

test('every tool has a valid schema and runs', async () => {
  const svc = new NexusService(new MemoryStore(), () => '2026-11-20');
  for (const t of nexusTools) {
    assert.equal((t.input_schema as any).type, 'object');
    if (t.name === 'nexus_propose_transaction') continue;
    const r: any = await runNexusToolSafe(svc, t.name, {});
    assert.equal(r.ok, true, `${t.name}: ${r.error}`);
  }
});

test('two processes on one file do not overwrite each other', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-'));
  const roomie = new NexusService(new JsonFileStore(dir));
  const cli = new NexusService(new JsonFileStore(dir));
  cli.addTransaction({ type: 'expense', amount: 1_00, accountId: 'acc_bank', categoryId: 'cat_food', note: 'from cli' });
  roomie.addTransaction({ type: 'expense', amount: 2_00, accountId: 'acc_bank', categoryId: 'cat_food', note: 'from roomie' });
  const fresh = new NexusService(new JsonFileStore(dir));
  assert.deepEqual(fresh.getTransactions().map(t => t.note).sort(), ['from cli', 'from roomie']);
});
