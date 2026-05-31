import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "../lib/queryClient";
import { transactionKey, transactionsKey, type Transaction } from "../lib/transactions";
import { dealStages, dealStageLabels, type DealStage } from "@shared/deal-stage";
import DealStageBadge from "../components/DealStageBadge";
import { page, section, label, input, muted } from "../lib/ui";

type DetailResponse = {
  transaction: Transaction;
  contacts: unknown[];
  documents: unknown[];
  tasks: unknown[];
  deadlines: unknown[];
};

// Display-only pipeline retained from the existing transaction visual. It is
// independent of the user-selectable deal stage.
const PIPELINE = ["Lead", "Under Contract", "Inspection", "Appraisal", "Financing", "Clear to Close"];

export default function TransactionDetail({ id }: { id: string }) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: transactionKey(id),
    queryFn: () => apiRequest<DetailResponse>("GET", `/api/transactions/${id}`),
  });

  const updateStage = useMutation({
    mutationFn: (dealStage: DealStage) =>
      apiRequest<{ transaction: Transaction }>("PATCH", `/api/transactions/${id}`, { dealStage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transactionKey(id) });
      qc.invalidateQueries({ queryKey: transactionsKey });
    },
  });

  if (query.isLoading) {
    return (
      <div style={page}>
        <p style={muted}>Loading...</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div style={page}>
        <p style={{ color: "crimson" }}>{(query.error as Error)?.message ?? "Not found"}</p>
        <Link href="/transactions" style={{ color: "#0a58ca" }}>
          Back to transactions
        </Link>
      </div>
    );
  }

  const tx = query.data.transaction;

  return (
    <div style={page} data-testid="transaction-detail-page">
      <Link href="/transactions" style={{ ...muted, color: "#0a58ca", textDecoration: "none" }}>
        ← Transactions
      </Link>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: 8,
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>{tx.propertyAddress}</h1>
          <p style={{ ...muted, marginTop: 0 }}>
            {[tx.propertyCity, tx.propertyState].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
        <div style={{ textAlign: "right" }} data-testid="transaction-header-stage">
          <div style={{ ...muted, marginBottom: 4 }}>Deal stage</div>
          <DealStageBadge stage={tx.dealStage} />
        </div>
      </div>

      <section style={section}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Pipeline</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid="transaction-pipeline">
          {PIPELINE.map((stage) => (
            <span
              key={stage}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                background: "#f3f4f6",
                border: "1px solid #e5e5e5",
                color: "#444",
              }}
            >
              {stage}
            </span>
          ))}
        </div>
      </section>

      <section style={section}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Deal stage</h2>
        <label style={label} htmlFor="deal-stage-select">
          Select the current stage of this deal
        </label>
        <select
          id="deal-stage-select"
          data-testid="deal-stage-select"
          style={{ ...input, maxWidth: 320 }}
          value={tx.dealStage}
          disabled={updateStage.isPending}
          onChange={(e) => updateStage.mutate(e.target.value as DealStage)}
        >
          {dealStages.map((stage) => (
            <option key={stage} value={stage}>
              {dealStageLabels[stage]}
            </option>
          ))}
        </select>
        {updateStage.isPending && <p style={muted}>Saving...</p>}
        {updateStage.isError && (
          <p style={{ color: "crimson", fontSize: 13 }}>
            {(updateStage.error as Error).message}
          </p>
        )}
      </section>
    </div>
  );
}
