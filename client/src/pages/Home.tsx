import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ApiError, apiRequest } from "../lib/queryClient";
import { SESSION_QUERY_KEY, type SessionUser } from "../lib/session";

type Diagnostics = {
  node: string;
  env: string;
  hasOpenAI: boolean;
  hasSes: boolean;
  hasGoogle: boolean;
  region: string;
  documentsBucket: string;
};

export default function Home({ user }: { user: SessionUser }) {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const logout = useMutation({
    mutationFn: () => apiRequest<{ ok: true }>("POST", "/api/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(SESSION_QUERY_KEY, null);
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      navigate("/login");
    },
  });

  useEffect(() => {
    apiRequest<Diagnostics>("GET", "/api/diagnostics")
      .then(setDiag)
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 401) setError("Not authenticated");
        else setError(e.message);
      });
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "48px auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>EliteTC</h1>
          <p style={{ color: "#555", marginTop: 0 }}>Transaction Coordinator platform</p>
        </div>
        <div style={{ textAlign: "right", fontSize: 13, color: "#555" }}>
          <div>{user.name || user.email}</div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            style={{
              marginTop: 6,
              background: "none",
              border: "1px solid #ccc",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            {logout.isPending ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Service status</h2>
        {error && <p style={{ color: "crimson" }}>Error loading diagnostics: {error}</p>}
        {diag && (
          <ul style={{ lineHeight: 1.8 }}>
            <li>Node: {diag.node}</li>
            <li>Env: {diag.env}</li>
            <li>Region: {diag.region}</li>
            <li>Documents bucket: {diag.documentsBucket}</li>
            <li>OpenAI configured: {diag.hasOpenAI ? "yes" : "no"}</li>
            <li>SES configured: {diag.hasSes ? "yes" : "no"}</li>
            <li>Google sign-in configured: {diag.hasGoogle ? "yes" : "no"}</li>
          </ul>
        )}
      </section>
    </div>
  );
}
