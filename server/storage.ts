import { db, pool } from "./db";
import {
  users,
  transactions,
  contacts,
  documents,
  tasks,
  deadlines,
  auditLog,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  Transaction,
  InsertTransaction,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

// Bootstrap creates the schema if missing. Idempotent — safe to run on every
// container start. Drizzle migrations are the long-term plan; this gives us
// a single-shot path for first deploy without a separate migration job.
export async function bootstrap(): Promise<void> {
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      name text,
      google_sub text UNIQUE,
      role text NOT NULL DEFAULT 'agent',
      brokerage_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

    CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS login_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS brokerages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      state text,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES users(id),
      brokerage_id uuid REFERENCES brokerages(id),
      property_address text NOT NULL,
      property_city text,
      property_state text,
      property_zip text,
      mls_number text,
      side text NOT NULL DEFAULT 'buy',
      status text NOT NULL DEFAULT 'intake',
      contract_date timestamptz,
      closing_date timestamptz,
      sale_price_cents integer,
      commission_bps integer,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS transactions_owner_idx ON transactions(owner_id);
    CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);

    CREATE TABLE IF NOT EXISTS contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL,
      name text NOT NULL,
      email text,
      phone text,
      company text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS contacts_tx_idx ON contacts(transaction_id);

    CREATE TABLE IF NOT EXISTS documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES users(id),
      filename text NOT NULL,
      content_type text,
      size_bytes integer,
      s3_bucket text,
      s3_key text,
      sha256 text,
      doc_type text,
      ocr_status text NOT NULL DEFAULT 'pending',
      ocr_text text,
      parse_status text NOT NULL DEFAULT 'pending',
      parsed jsonb,
      uploaded_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS documents_tx_idx ON documents(transaction_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES users(id),
      title text NOT NULL,
      description text,
      due_date timestamptz,
      completed_at timestamptz,
      priority text NOT NULL DEFAULT 'normal',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tasks_tx_idx ON tasks(transaction_id);

    CREATE TABLE IF NOT EXISTS deadlines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      name text NOT NULL,
      due_date timestamptz NOT NULL,
      is_complete boolean NOT NULL DEFAULT false,
      source_clause text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS deadlines_tx_idx ON deadlines(transaction_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid REFERENCES users(id),
      transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
      action text NOT NULL,
      entity text NOT NULL,
      entity_id text,
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_log_tx_idx ON audit_log(transaction_id);
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);
  `;
  await pool.query(ddl);
}

export const storage = {
  // ----- users -----
  async getUserByEmail(email: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0];
  },
  async getUserById(id: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  },
  async upsertUser(u: InsertUser): Promise<User> {
    const existing = await this.getUserByEmail(u.email);
    if (existing) return existing;
    const [row] = await db.insert(users).values(u).returning();
    return row;
  },

  // ----- transactions -----
  async listTransactions(ownerId: string) {
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.ownerId, ownerId))
      .orderBy(desc(transactions.updatedAt));
  },
  async getTransaction(id: string, ownerId: string): Promise<Transaction | undefined> {
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId)))
      .limit(1);
    return rows[0];
  },
  async createTransaction(t: InsertTransaction): Promise<Transaction> {
    const [row] = await db.insert(transactions).values(t).returning();
    return row;
  },

  // ----- contacts / documents / tasks / deadlines -----
  async listContacts(transactionId: string) {
    return db.select().from(contacts).where(eq(contacts.transactionId, transactionId));
  },
  async listDocuments(transactionId: string) {
    return db.select().from(documents).where(eq(documents.transactionId, transactionId));
  },
  async listTasks(transactionId: string) {
    return db.select().from(tasks).where(eq(tasks.transactionId, transactionId));
  },
  async listDeadlines(transactionId: string) {
    return db.select().from(deadlines).where(eq(deadlines.transactionId, transactionId));
  },

  // ----- audit -----
  async writeAudit(entry: {
    actorId?: string | null;
    transactionId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    payload?: any;
  }) {
    await db.insert(auditLog).values({
      actorId: entry.actorId ?? null,
      transactionId: entry.transactionId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      payload: entry.payload ?? null,
    });
  },
};
