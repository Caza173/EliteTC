import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "../lib/queryClient";
import { transactionsKey, type Transaction } from "../lib/transactions";
import DealStageBadge from "../components/DealStageBadge";
import { page, section, muted } from "../lib/ui";

export default function Transactions() {
  const query = useQuery({
    queryKey: transactionsKey,
    queryFn: () =>
      apiRequest<{ transactions: Transaction[] }>("GET", "/api/transactions").then(
        (r) => r.transactions,
      ),
  });

  return (
    <div style={page} data-testid="transactions-page">
      <h1 style={{ marginBottom: 4 }}>Transactions</h1>
      <p style={muted}>All transactions you own.</p>

      <section style={section}>
        {query.isLoading && <p style={muted}>Loading...</p>}
        {query.isError && (
          <p style={{ color: "crimson", fontSize: 13 }}>{(query.error as Error).message}</p>
        )}
        {query.data && query.data.length === 0 && (
          <p style={muted} data-testid="transactions-empty">
            No transactions yet.
          </p>
        )}
        {query.data && query.data.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#555", fontSize: 13 }}>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e5e5e5" }}>Property</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e5e5e5" }}>Side</th>
                <th style={{ padding: "8px 6px", borderBottom: "1px solid #e5e5e5" }}>Deal stage</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((tx) => (
                <tr key={tx.id} data-testid={`transaction-row-${tx.id}`}>
                  <td style={{ padding: "10px 6px", borderBottom: "1px solid #f0f0f0" }}>
                    <Link
                      href={`/transactions/${tx.id}`}
                      style={{ color: "#0a58ca", textDecoration: "none" }}
                    >
                      {tx.propertyAddress}
                      {tx.propertyCity ? `, ${tx.propertyCity}` : ""}
                      {tx.propertyState ? `, ${tx.propertyState}` : ""}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 6px", borderBottom: "1px solid #f0f0f0" }}>
                    {tx.side}
                  </td>
                  <td style={{ padding: "10px 6px", borderBottom: "1px solid #f0f0f0" }}>
                    <DealStageBadge stage={tx.dealStage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
