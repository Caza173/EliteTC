import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { SESSION_QUERY_KEY, type SessionUser } from "../lib/session";
import { loadGoogleIdentityScript, type CredentialResponse } from "../lib/google";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const ALLOW_DEV_LOGIN = import.meta.env.VITE_ALLOW_DEV_LOGIN === "true";

const section: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 20,
  marginTop: 24,
  background: "white",
};
const label: React.CSSProperties = { display: "block", fontSize: 13, color: "#555", marginBottom: 6 };
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
};
const button: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #1a1a1a",
  background: "#1a1a1a",
  color: "white",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#0a58ca",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 13,
};

export default function Login() {
  const qc = useQueryClient();
  const googleHostRef = useRef<HTMLDivElement | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const googleMutation = useMutation({
    mutationFn: (idToken: string) =>
      apiRequest<{ user: SessionUser }>("POST", "/api/auth/google", { idToken }),
    onSuccess: (data) => {
      qc.setQueryData(SESSION_QUERY_KEY, data.user);
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleHostRef.current) return;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !googleHostRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: CredentialResponse) => {
            if (resp?.credential) googleMutation.mutate(resp.credential);
          },
          ux_mode: "popup",
        });
        window.google.accounts.id.renderButton(googleHostRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
        });
      })
      .catch((err: Error) => setGoogleError(err.message));
    return () => {
      cancelled = true;
    };
    // googleMutation is stable across renders for this purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "48px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Sign in to EliteTC</h1>
      <p style={{ color: "#555", marginTop: 4 }}>Transaction Coordinator platform</p>

      <section style={section}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Continue with Google</h2>
        {!GOOGLE_CLIENT_ID && (
          <p style={{ color: "#888", fontSize: 13 }}>
            Google Sign-In is not configured for this build. Set <code>VITE_GOOGLE_CLIENT_ID</code>.
          </p>
        )}
        <div ref={googleHostRef} style={{ minHeight: 44 }} />
        {googleError && <p style={{ color: "crimson", fontSize: 13 }}>{googleError}</p>}
        {googleMutation.isError && (
          <p style={{ color: "crimson", fontSize: 13 }}>{(googleMutation.error as Error).message}</p>
        )}
      </section>

      <MagicLinkForm />

      {ALLOW_DEV_LOGIN && <DevLoginForm />}
    </div>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const qc = useQueryClient();

  const request = useMutation({
    mutationFn: (e: string) =>
      apiRequest<{ ok: true }>("POST", "/api/auth/magic-link/request", { email: e }),
    onSuccess: () => setStep("verify"),
  });

  const verify = useMutation({
    mutationFn: (vars: { email: string; code: string }) =>
      apiRequest<{ user: SessionUser }>("POST", "/api/auth/verify", vars),
    onSuccess: (data) => {
      qc.setQueryData(SESSION_QUERY_KEY, data.user);
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });

  return (
    <section style={section}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Sign in with email</h2>
      <p style={{ color: "#555", fontSize: 13, marginTop: 0 }}>
        We'll email you a one-time login code, valid for 15 minutes.
      </p>

      {step === "request" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) request.mutate(email.trim().toLowerCase());
          }}
        >
          <label style={label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            style={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <div style={{ marginTop: 12 }}>
            <button type="submit" style={button} disabled={request.isPending}>
              {request.isPending ? "Sending..." : "Send login code"}
            </button>
          </div>
          {request.isError && (
            <p style={{ color: "crimson", fontSize: 13 }}>{(request.error as Error).message}</p>
          )}
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) verify.mutate({ email: email.trim().toLowerCase(), code: code.trim() });
          }}
        >
          <p style={{ fontSize: 13, color: "#555" }}>
            Sent to <strong>{email}</strong>. Enter the code from the email, or open the link directly.
          </p>
          <label style={label} htmlFor="code">
            Login code
          </label>
          <input
            id="code"
            type="text"
            required
            autoComplete="one-time-code"
            style={input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste code from email"
          />
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <button type="submit" style={button} disabled={verify.isPending}>
              {verify.isPending ? "Verifying..." : "Verify and sign in"}
            </button>
            <button
              type="button"
              style={linkBtn}
              onClick={() => {
                setStep("request");
                setCode("");
                verify.reset();
              }}
            >
              Use a different email
            </button>
          </div>
          {verify.isError && (
            <p style={{ color: "crimson", fontSize: 13 }}>{(verify.error as Error).message}</p>
          )}
        </form>
      )}
    </section>
  );
}

function DevLoginForm() {
  const [email, setEmail] = useState("");
  const qc = useQueryClient();
  const dev = useMutation({
    mutationFn: (e: string) =>
      apiRequest<{ user: SessionUser }>("POST", "/api/auth/dev-login", { email: e }),
    onSuccess: (data) => {
      qc.setQueryData(SESSION_QUERY_KEY, data.user);
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
  return (
    <section style={{ ...section, borderStyle: "dashed", background: "#fafafa" }}>
      <h2 style={{ fontSize: 14, marginTop: 0, color: "#666" }}>Dev login (non-production)</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) dev.mutate(email.trim().toLowerCase());
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="email"
          required
          style={{ ...input, flex: 1 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dev@example.com"
        />
        <button type="submit" style={{ ...button, background: "#444", borderColor: "#444" }}>
          Dev sign in
        </button>
      </form>
      {dev.isError && (
        <p style={{ color: "crimson", fontSize: 13 }}>{(dev.error as Error).message}</p>
      )}
    </section>
  );
}
