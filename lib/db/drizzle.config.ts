import { defineConfig } from "drizzle-kit";
import path from "path";

// Prefer the direct (unpooled) URL for schema pushes — DDL through the
// connection pooler is unreliable. Falls back to the pooled URL. The value
// is often pasted from a console snippet, so extract the URL from any
// surrounding text (quotes, a `psql` prefix, a `DATABASE_URL=` prefix).
function extractUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = /postgres(?:ql)?:\/\/[^\s"']+/.exec(raw);
  return match ? match[0] : raw.trim() || undefined;
}

const url =
  extractUrl(process.env.DATABASE_URL) ??
  extractUrl(process.env.NETLIFY_DATABASE_URL_UNPOOLED) ??
  extractUrl(process.env.NETLIFY_DATABASE_URL);

if (!url) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
