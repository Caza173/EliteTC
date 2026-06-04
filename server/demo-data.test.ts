import test from "node:test";
import assert from "node:assert/strict";
import { isDemoRowDeletable, summarizeDemoCounts } from "./demo-data.ts";

type Row = { id: string; ownerId: string; isDemo: boolean };

const OWNER = "owner-1";
const OTHER = "owner-2";

// Mirrors the WHERE clause of deleteDemoData: only demo rows owned by the
// requester are deleted. Real rows and other owners' rows survive.
function simulateDelete(rows: Row[], requesterId: string): Row[] {
  return rows.filter((r) => !isDemoRowDeletable(r, requesterId));
}

test("deletes only demo rows owned by the requester", () => {
  const rows: Row[] = [
    { id: "real-1", ownerId: OWNER, isDemo: false },
    { id: "demo-1", ownerId: OWNER, isDemo: true },
    { id: "demo-2", ownerId: OWNER, isDemo: true },
    { id: "real-2", ownerId: OWNER, isDemo: false },
  ];
  const remaining = simulateDelete(rows, OWNER);
  const ids = remaining.map((r) => r.id).sort();
  assert.deepEqual(ids, ["real-1", "real-2"]);
});

test("never deletes real (non-demo) user-created rows", () => {
  const rows: Row[] = [
    { id: "real-1", ownerId: OWNER, isDemo: false },
    { id: "real-2", ownerId: OWNER, isDemo: false },
  ];
  const remaining = simulateDelete(rows, OWNER);
  assert.equal(remaining.length, 2, "no real rows should be removed");
});

test("preserves owner isolation: another user's demo rows are untouched", () => {
  const rows: Row[] = [
    { id: "mine-demo", ownerId: OWNER, isDemo: true },
    { id: "theirs-demo", ownerId: OTHER, isDemo: true },
    { id: "theirs-real", ownerId: OTHER, isDemo: false },
  ];
  const remaining = simulateDelete(rows, OWNER);
  const ids = remaining.map((r) => r.id).sort();
  assert.deepEqual(ids, ["theirs-demo", "theirs-real"]);
});

test("isDemoRowDeletable requires both demo flag and owner match", () => {
  assert.equal(isDemoRowDeletable({ ownerId: OWNER, isDemo: true }, OWNER), true);
  assert.equal(isDemoRowDeletable({ ownerId: OWNER, isDemo: false }, OWNER), false);
  assert.equal(isDemoRowDeletable({ ownerId: OTHER, isDemo: true }, OWNER), false);
  assert.equal(isDemoRowDeletable({ ownerId: OTHER, isDemo: false }, OWNER), false);
});

test("summarizeDemoCounts sums every entity type", () => {
  assert.equal(
    summarizeDemoCounts({ transactions: 2, contacts: 3, documents: 1, tasks: 4, deadlines: 5 }),
    15,
  );
  assert.equal(
    summarizeDemoCounts({ transactions: 0, contacts: 0, documents: 0, tasks: 0, deadlines: 0 }),
    0,
    "no demo data => total 0 => Settings action disabled",
  );
});
