// Only so this package typechecks without installing Electron. Roomie uses the real types.
declare module 'electron' {
  export const contextBridge: { exposeInMainWorld(key: string, api: unknown): void };
  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, fn: (...a: unknown[]) => void): void;
    removeListener(channel: string, fn: (...a: unknown[]) => void): void;
  };
}
