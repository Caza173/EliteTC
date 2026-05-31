import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { SESSION_QUERY_KEY, type SessionUser } from "../lib/session";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  const [location, navigate] = useLocation();
  const qc = useQueryClient();

  const logout = useMutation({
    mutationFn: () => apiRequest<{ ok: true }>("POST", "/api/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(SESSION_QUERY_KEY, null);
      qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      navigate("/login");
    },
  });

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          borderRight: "1px solid #e5e5e5",
          background: "#fafafa",
          padding: 20,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
        data-testid="app-sidebar"
      >
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 24 }}>EliteTC</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.label.toLowerCase()}`}
              style={{
                display: "block",
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 14,
                textDecoration: "none",
                color: isActive(item.href) ? "#1a1a1a" : "#555",
                background: isActive(item.href) ? "#ececec" : "transparent",
                fontWeight: isActive(item.href) ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: "auto", fontSize: 13, color: "#555" }}>
          <div style={{ marginBottom: 6 }}>{user.name || user.email}</div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            data-testid="logout-button"
            style={{
              background: "none",
              border: "1px solid #ccc",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {logout.isPending ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: "24px 0", overflowX: "auto" }}>{children}</main>
    </div>
  );
}
