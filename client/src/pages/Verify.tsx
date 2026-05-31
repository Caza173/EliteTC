import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { SESSION_QUERY_KEY, type SessionUser } from "../lib/session";

type State = { status: "verifying" } | { status: "ok" } | { status: "error"; message: string };

export default function Verify() {
  const [state, setState] = useState<State>({ status: "verifying" });
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const code = params.get("code");
    if (!email || !code) {
      setState({ status: "error", message: "Missing email or code in URL." });
      return;
    }
    apiRequest<{ user: SessionUser }>("POST", "/api/auth/verify", { email, code })
      .then((data) => {
        qc.setQueryData(SESSION_QUERY_KEY, data.user);
        qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
        setState({ status: "ok" });
        setTimeout(() => navigate("/"), 500);
      })
      .catch((err: Error) => setState({ status: "error", message: err.message }));
  }, [navigate, qc]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "48px auto", padding: 24 }}>
      <h1>Signing you in...</h1>
      {state.status === "verifying" && <p>Verifying your login link...</p>}
      {state.status === "ok" && <p>Signed in. Redirecting...</p>}
      {state.status === "error" && (
        <>
          <p style={{ color: "crimson" }}>{state.message}</p>
          <p>
            <a href="/login">Back to sign-in</a>
          </p>
        </>
      )}
    </div>
  );
}
