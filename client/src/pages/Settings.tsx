import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "../lib/queryClient";
import type { SessionUser } from "../lib/session";

type DemoDataCounts = {
  transactions: number;
  contacts: number;
  documents: number;
  tasks: number;
  deadlines: number;
  total: number;
};

const DEMO_DATA_QUERY_KEY = ["settings", "demo-data"] as const;

type Toast = { kind: "success" | "error"; message: string };

export default function Settings({ user }: { user: SessionUser }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const demoData = useQuery<DemoDataCounts>({
    queryKey: DEMO_DATA_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest<{ counts: DemoDataCounts }>("GET", "/api/settings/demo-data");
      return res.counts;
    },
  });

  const deleteDemo = useMutation({
    mutationFn: () =>
      apiRequest<{ deleted: DemoDataCounts }>("POST", "/api/settings/demo-data/delete"),
    onSuccess: (res) => {
      setConfirmOpen(false);
      const n = res.deleted.total;
      setToast({
        kind: "success",
        message:
          n > 0
            ? `Removed ${n} demo record${n === 1 ? "" : "s"}.`
            : "No demo data to remove.",
      });
      // Refresh demo counts plus anything that may have listed those records.
      qc.invalidateQueries({ queryKey: DEMO_DATA_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      setToast({ kind: "error", message: err.message || "Failed to delete demo data." });
    },
  });

  const total = demoData.data?.total ?? 0;
  const hasDemo = total > 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "48px auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Settings</h1>
          <p style={{ color: "#555", marginTop: 0 }}>{user.name || user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{
            marginTop: 6,
            background: "none",
            border: "1px solid #ccc",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Back
        </button>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            marginTop: 24,
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 14,
            color: toast.kind === "success" ? "#0a5" : "crimson",
            background: toast.kind === "success" ? "#eafbf2" : "#fdeaea",
            border: `1px solid ${toast.kind === "success" ? "#bfe8d2" : "#f3c6c6"}`,
          }}
        >
          {toast.message}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Demo data</h2>
        <p style={{ color: "#555", lineHeight: 1.6 }}>
          Removes only seeded sample records from your account. Your real
          transactions, documents, and contacts are never affected.
        </p>

        {demoData.isLoading && <p style={{ color: "#777" }}>Checking for demo data…</p>}
        {demoData.isError && (
          <p style={{ color: "crimson" }}>Could not load demo data status.</p>
        )}
        {demoData.data && (
          <p style={{ color: "#555", fontSize: 14 }}>
            {hasDemo
              ? `Found ${total} demo record${total === 1 ? "" : "s"} (` +
                `${demoData.data.transactions} transactions, ` +
                `${demoData.data.documents} documents, ` +
                `${demoData.data.contacts} contacts, ` +
                `${demoData.data.tasks} tasks, ` +
                `${demoData.data.deadlines} deadlines).`
              : "No demo data found on your account."}
          </p>
        )}

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!hasDemo || deleteDemo.isPending || demoData.isLoading}
          style={{
            marginTop: 12,
            background: hasDemo ? "#fff" : "#f5f5f5",
            border: "1px solid #d99",
            color: hasDemo ? "#c00" : "#aaa",
            borderRadius: 6,
            padding: "8px 14px",
            cursor: hasDemo ? "pointer" : "not-allowed",
            fontSize: 14,
          }}
        >
          Delete demo data
        </button>
      </section>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete demo data"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 24,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Delete demo data?</h3>
            <p style={{ color: "#555", lineHeight: 1.6 }}>
              This permanently removes {total} seeded demo record
              {total === 1 ? "" : "s"} from your account. Real transactions and
              documents you created will not be deleted. This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleteDemo.isPending}
                style={{
                  background: "none",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteDemo.mutate()}
                disabled={deleteDemo.isPending}
                style={{
                  background: "#c00",
                  border: "1px solid #c00",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                {deleteDemo.isPending ? "Deleting…" : "Delete demo data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
