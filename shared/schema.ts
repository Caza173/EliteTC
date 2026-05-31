import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    googleSub: text("google_sub").unique(),
    role: text("role").notNull().default("agent"),
    brokerageId: uuid("brokerage_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  }),
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginCodes = pgTable("login_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brokerages = pgTable("brokerages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  state: text("state"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionStatuses = [
  "intake",
  "under_contract",
  "pending",
  "closed",
  "cancelled",
] as const;

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    brokerageId: uuid("brokerage_id").references(() => brokerages.id),
    propertyAddress: text("property_address").notNull(),
    propertyCity: text("property_city"),
    propertyState: text("property_state"),
    propertyZip: text("property_zip"),
    mlsNumber: text("mls_number"),
    side: text("side").notNull().default("buy"),
    status: text("status").notNull().default("intake"),
    contractDate: timestamp("contract_date", { withTimezone: true }),
    closingDate: timestamp("closing_date", { withTimezone: true }),
    salePriceCents: integer("sale_price_cents"),
    commissionBps: integer("commission_bps"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("transactions_owner_idx").on(t.ownerId),
    statusIdx: index("transactions_status_idx").on(t.status),
  }),
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    role: text("role").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    txIdx: index("contacts_tx_idx").on(t.transactionId),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    s3Bucket: text("s3_bucket"),
    s3Key: text("s3_key"),
    sha256: text("sha256"),
    docType: text("doc_type"),
    ocrStatus: text("ocr_status").notNull().default("pending"),
    ocrText: text("ocr_text"),
    parseStatus: text("parse_status").notNull().default("pending"),
    parsed: jsonb("parsed"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    txIdx: index("documents_tx_idx").on(t.transactionId),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    priority: text("priority").notNull().default("normal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    txIdx: index("tasks_tx_idx").on(t.transactionId),
  }),
);

export const deadlines = pgTable(
  "deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    isComplete: boolean("is_complete").notNull().default(false),
    sourceClause: text("source_clause"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    txIdx: index("deadlines_tx_idx").on(t.transactionId),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    txIdx: index("audit_log_tx_idx").on(t.transactionId),
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Deadline = typeof deadlines.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactions);
export const insertContactSchema = createInsertSchema(contacts);
export const insertTaskSchema = createInsertSchema(tasks);
export const insertDeadlineSchema = createInsertSchema(deadlines);
