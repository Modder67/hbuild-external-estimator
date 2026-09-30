import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// DATABASE_URL (explicit) or NETLIFY_DATABASE_URL (injected by Netlify DB /
// the Neon extension). The pooled URL is right for runtime connections.
// The value is often pasted from a console snippet, so extract the URL from
// any surrounding text (quotes, a `psql` prefix, a `DATABASE_URL=` prefix).
function extractUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = /postgres(?:ql)?:\/\/[^\s"']+/.exec(raw);
  return match ? match[0] : raw.trim() || undefined;
}

const connectionString =
  extractUrl(process.env.DATABASE_URL) ?? extractUrl(process.env.NETLIFY_DATABASE_URL);

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
