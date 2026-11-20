// Drop into Roomie's preload script (contextIsolation: true). Exposes window.nexus to the renderer.
// If the window uses sandbox: true, the preload must be bundled (Vite/esbuild) because sandboxed
// preloads can only require 'electron'. This file imports nothing that touches Node.
import { contextBridge, ipcRenderer } from 'electron';
import { NEXUS_IPC_METHODS } from './ipc-methods.js';

const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
for (const m of NEXUS_IPC_METHODS) {
  api[m] = async (...args) => {
    const r = await ipcRenderer.invoke(`nexus:${m}`, ...args) as { ok: boolean; data?: unknown; error?: string };
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
}
(api as any).onChange = (fn: () => void) => {
  const h = () => fn();
  ipcRenderer.on('nexus:changed', h);
  return () => ipcRenderer.removeListener('nexus:changed', h);
};
contextBridge.exposeInMainWorld('nexus', api);
