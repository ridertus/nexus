// Drop into Roomie's main process:
//   import { app, ipcMain, BrowserWindow } from 'electron';
//   import { setupNexus } from 'nexus-finance/dist/electron/main-ipc.js';
//   const nexus = setupNexus({ ipcMain, dataDir: path.join(app.getPath('userData'), 'nexus'),
//     broadcast: () => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('nexus:changed')) });
//   // and give nexus.tools / nexus.run to the LLM brain (M3).
import { NexusService } from '../service.js';
import { JsonFileStore } from '../store.js';
import { nexusTools, runNexusToolSafe } from '../ai-tools.js';

interface IpcMainLike { handle(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void }

import { NEXUS_IPC_METHODS } from './ipc-methods.js';
export { NEXUS_IPC_METHODS };

export function setupNexus(opts: { ipcMain: IpcMainLike; dataDir: string; broadcast?: () => void }) {
  const svc = new NexusService(new JsonFileStore(opts.dataDir));
  if (opts.broadcast) svc.onChange(opts.broadcast);
  for (const m of NEXUS_IPC_METHODS) {
    opts.ipcMain.handle(`nexus:${m}`, async (_e, ...args) => {
      try { return { ok: true, data: await (svc as any)[m](...args) }; }
      catch (err) { return { ok: false, error: (err as Error).message }; }
    });
  }
  return {
    service: svc,
    tools: nexusTools,
    run: (name: string, input?: unknown) => runNexusToolSafe(svc, name, input),
  };
}
