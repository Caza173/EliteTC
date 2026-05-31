import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../lib/queryClient";
import type { SessionUser } from "../lib/session";
import { page, section } from "../lib/ui";

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

  useEffect(() => {
    apiRequest<Diagnostics>("GET", "/api/diagnostics")
      .then(setDiag)
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 401) setError("Not authenticated");
        else setError(e.message);
      });
  }, []);

  return (
    <div style={page}>
      <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Welcome back, {user.name || user.email}.</p>

      <section style={section}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Service status</h2>
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
