import { dealStageLabels, type DealStage } from "@shared/deal-stage";

const COLORS: Record<DealStage, { bg: string; fg: string }> = {
  under_contract: { bg: "#e7f1ff", fg: "#0a58ca" },
  pending: { bg: "#fff3cd", fg: "#8a6d00" },
  withdrawn: { bg: "#eee", fg: "#555" },
  terminated: { bg: "#fde2e1", fg: "#b02a37" },
  expired: { bg: "#fde2e1", fg: "#b02a37" },
  closed: { bg: "#d1e7dd", fg: "#0f5132" },
};

export default function DealStageBadge({ stage }: { stage: DealStage }) {
  const c = COLORS[stage] ?? { bg: "#eee", fg: "#555" };
  return (
    <span
      data-testid={`deal-stage-badge-${stage}`}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {dealStageLabels[stage] ?? stage}
    </span>
  );
}
