// Shared inline-style primitives so new pages match the existing
// system-ui / bordered-card aesthetic used by Login and Home.
import type { CSSProperties } from "react";

export const page: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: 860,
  margin: "0 auto",
  padding: 24,
};

export const section: CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 20,
  marginTop: 24,
  background: "white",
};

export const label: CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#555",
  marginBottom: 6,
};

export const input: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
};

export const button: CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #1a1a1a",
  background: "#1a1a1a",
  color: "white",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};

export const muted: CSSProperties = { color: "#555", fontSize: 13 };
