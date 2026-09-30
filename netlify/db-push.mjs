// Netlify build step: create/update the estimator tables in the provisioned
// database (drizzle-kit push). Runs after the SPA build.
//
// - DATABASE_URL set explicitly → used as-is.
// - Otherwise NETLIFY_DATABASE_URL[_UNPOOLED] — injected by Netlify DB (the
//   Neon extension). The unpooled URL is preferred for DDL (drizzle.config.ts).
// - Neither present → the database has not been provisioned yet. Skip with a
//   clear message instead of failing the build: the Neon extension provisions
//   on a build where @netlify/database is installed, and the variable is saved
//   to the site's environment for the builds after it.
import { spawnSync } from "node:child_process";

const url =
  process.env.DATABASE_URL ??
  process.env.NETLIFY_DATABASE_URL_UNPOOLED ??
  process.env.NETLIFY_DATABASE_URL;

if (!url) {
  console.log(
    "[db-push] No DATABASE_URL / NETLIFY_DATABASE_URL in this build — skipping the schema push. " +
      "If Netlify DB was just provisioned, the next build applies the schema.",
  );
  process.exit(0);
}

console.log("[db-push] Applying the drizzle schema to the database…");
const result = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
