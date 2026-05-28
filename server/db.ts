import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import fs from "node:fs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Provide a Postgres connection string (e.g. postgres://user:pass@host:5432/dbname?sslmode=require).",
  );
}

// pg-connection-string parses `sslmode=require` out of the URL and applies
// its own SSL semantics that override our explicit `ssl` option. Strip it
// and configure ssl exclusively via the explicit `ssl` object.
function stripSslMode(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    const search = u.searchParams.toString();
    const base = url.split("?")[0];
    return search ? `${base}?${search}` : base;
  } catch {
    return url
      .replace(/([?&])sslmode=[^&]*(&|$)/gi, (_m, sep, end) => (end === "&" ? sep : ""))
      .replace(/[?&]$/, "");
  }
}

const hasSslMode = /[?&]sslmode=/i.test(databaseUrl);
const isManagedPg = /amazonaws\.com|rds\.|neon\.tech|supabase\.com/i.test(databaseUrl);
const cleanedUrl = stripSslMode(databaseUrl);

function buildSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!hasSslMode && !isManagedPg) return false;
  const caPath = process.env.PG_CA_CERT_PATH;
  if (caPath) {
    try {
      const ca = fs.readFileSync(caPath, "utf8");
      console.log(`[db] using CA bundle from ${caPath} (${ca.length} bytes)`);
      return { rejectUnauthorized: true, ca };
    } catch (err) {
      console.warn(
        `[db] PG_CA_CERT_PATH=${caPath} unreadable (${(err as Error).message}); falling back to rejectUnauthorized: false`,
      );
    }
  }
  console.log("[db] SSL enabled with rejectUnauthorized: false (no CA bundle configured)");
  return { rejectUnauthorized: false };
}

const sslConfig = buildSslConfig();

export const pool = new Pool({
  connectionString: cleanedUrl,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[pg pool] unexpected error on idle client", err);
});

export const db = drizzle(pool);
