import type { DealStage } from "@shared/deal-stage";

export type Transaction = {
  id: string;
  propertyAddress: string;
  propertyCity: string | null;
  propertyState: string | null;
  side: string;
  status: string;
  dealStage: DealStage;
  updatedAt: string;
};

export const transactionsKey = ["transactions"] as const;
export const transactionKey = (id: string) => ["transaction", id] as const;
