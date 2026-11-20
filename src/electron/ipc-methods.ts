// No imports on purpose: safe to bundle into a sandboxed preload.
/** Whitelisted methods the renderer may call. Anything not listed is unreachable from the UI. */
export const NEXUS_IPC_METHODS = [
  'getDashboard', 'getSettings', 'getAccounts', 'getCategories', 'getBills', 'getTransactions',
  'getSafeToSpend', 'getBudgets', 'getGoals', 'getCashFlow', 'getTax', 'getUpcomingBills',
  'addTransaction', 'updateTransaction', 'voidTransaction',
  'addAccount', 'updateAccount', 'addCategory', 'updateCategory', 'setPlans',
  'addBill', 'updateBill', 'payBill', 'addGoal', 'updateGoal', 'contributeToGoal',
  'updateSettings', 'exportCsv',
  'listDrafts', 'confirmDraft', 'discardDraft', // human-only: the AI has no tool for these
] as const;
export type NexusIpcMethod = typeof NEXUS_IPC_METHODS[number];
