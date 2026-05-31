// Deal-stage constants kept free of drizzle imports so the client can use them
// without bundling the database schema.
export const dealStages = [
  "under_contract",
  "pending",
  "withdrawn",
  "terminated",
  "expired",
  "closed",
] as const;

export type DealStage = (typeof dealStages)[number];

export const dealStageLabels: Record<DealStage, string> = {
  under_contract: "Under Contract",
  pending: "Pending",
  withdrawn: "Withdrawn",
  terminated: "Terminated",
  expired: "Expired",
  closed: "Closed",
};
