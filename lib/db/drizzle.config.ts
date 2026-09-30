import { defineConfig } from "drizzle-kit";
import path from "path";

// Prefer the direct (unpooled) URL for schema pushes — DDL through the
// connection pooler is unreliable. Falls back to the pooled URL.
const url =
  process.env.DATABASE_URL ??
  process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
  process.env.NETLIFY_DATABASE_URL;

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
