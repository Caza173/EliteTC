// Pure helpers for the Settings "Delete demo data" action. Kept free of any
// database imports so the safety guarantees can be unit-tested in isolation.

export type DemoDataCounts = {
  transactions: number;
  contacts: number;
  documents: number;
  tasks: number;
  deadlines: number;
  total: number;
};

// Sum of the per-entity demo counts. Drives the Settings gating logic
// ("disable the action when no demo data exists").
export function summarizeDemoCounts(c: Omit<DemoDataCounts, "total">): number {
  return c.transactions + c.contacts + c.documents + c.tasks + c.deadlines;
}

// The exact predicate the demo-delete queries use: a row is eligible for
// deletion ONLY when it is explicitly flagged as demo AND owned by the
// requesting user. The DB queries in deleteDemoData mirror this with
// `and(eq(ownerId), eq(isDemo, true))`, so testing this proves real rows and
// other owners' rows are never matched.
export function isDemoRowDeletable(
  row: { ownerId: string; isDemo: boolean },
  requesterId: string,
): boolean {
  return row.isDemo === true && row.ownerId === requesterId;
}
