import type { NexusData } from './types.js';

export interface Store {
  load(): NexusData;
  save(data: NexusData): void;
  /** True if someone else (e.g. the CLI while Roomie is open) changed the data since our last load/save. */
  isStale?(): boolean;
}
