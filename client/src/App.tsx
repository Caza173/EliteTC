import { useEffect, useState } from "react";

type Diagnostics = {
  node: string;
  env: string;
  hasOpenAI: boolean;
  hasSes: boolean;
  region: string;
  documentsBucket: string;
};

export default function App() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/diagnostics")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setDiag)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "48px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>EliteTC</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Transaction Coordinator platform</p>

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
          </ul>
        )}
      </section>
    </div>
  );
}
