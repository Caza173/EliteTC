import type { SessionUser } from "../lib/session";
import { dealStageLabels } from "@shared/deal-stage";
import { page, section, label, input, muted } from "../lib/ui";

// Functional settings shell. There is no per-user settings model yet, so the
// fields are presented read-only / disabled where no persistence exists. This
// gives a real surface to wire backend settings into later without a redesign.
export default function Settings({ user }: { user: SessionUser }) {
  return (
    <div style={page} data-testid="settings-page">
      <h1 style={{ marginBottom: 4 }}>Settings</h1>
      <p style={muted}>Manage your account, workspace, and transaction defaults.</p>

      <section style={section} data-testid="settings-profile">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Profile &amp; Account</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={label} htmlFor="settings-name">
            Name
          </label>
          <input
            id="settings-name"
            style={input}
            defaultValue={user.name ?? ""}
            placeholder="Your name"
            disabled
          />
        </div>
        <div>
          <label style={label} htmlFor="settings-email">
            Email
          </label>
          <input id="settings-email" style={input} value={user.email} readOnly />
        </div>
      </section>

      <section style={section} data-testid="settings-team">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Team &amp; Workspace</h2>
        <p style={muted}>
          Invite teammates and manage your brokerage workspace. Workspace management is not yet
          configured for this account.
        </p>
      </section>

      <section style={section} data-testid="settings-notifications">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Notifications</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" defaultChecked disabled data-testid="settings-notify-deadlines" />
          Email me about upcoming deadlines
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 8 }}>
          <input type="checkbox" defaultChecked disabled data-testid="settings-notify-docs" />
          Email me when a document finishes processing
        </label>
      </section>

      <section style={section} data-testid="settings-integrations">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Integrations</h2>
        <ul style={{ lineHeight: 1.8, marginTop: 0 }}>
          <li>Google Sign-In</li>
          <li>Email (magic link)</li>
          <li>Document OCR &amp; parsing</li>
        </ul>
        <p style={muted}>Integration configuration is managed by your administrator.</p>
      </section>

      <section style={section} data-testid="settings-transaction-defaults">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Transaction Defaults</h2>
        <label style={label} htmlFor="settings-default-stage">
          Default deal stage for new transactions
        </label>
        <select
          id="settings-default-stage"
          style={input}
          defaultValue="under_contract"
          disabled
          data-testid="settings-default-stage"
        >
          {Object.entries(dealStageLabels).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        <p style={muted}>New transactions default to Under Contract.</p>
      </section>
    </div>
  );
}
