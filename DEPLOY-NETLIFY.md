# Hosting the external estimator on Netlify (from GitHub)

The workspace deploys as a Vite SPA (`artifacts/deck-estimate`) plus the whole Express API
(`artifacts/api-server`) behind one Netlify Function (`netlify/functions/api.ts`); `netlify.toml`
holds the build, publish and `/api/*` redirect settings. The Replit deployment keeps working
unchanged: with `PRIVATE_OBJECT_DIR` set it still uses Replit object storage, without it (Netlify)
private PDFs are stored in the estimator's own Postgres (`estimator_private_pdfs`).

## 1. One-time: put the repo on GitHub

From `hbuild-external-estimator/General Quick Estimator` in PowerShell or a shell with your GitHub
login (create an empty private repo first, e.g. `Modder67/hbuild-external-estimator`):

    git remote add origin https://github.com/Modder67/hbuild-external-estimator.git
    git push -u origin main

## 2. Provision the estimator's own database (NOT the mesh database)

Any hosted Postgres (Neon, or a separate Supabase project's connection string). Create the tables
with drizzle from this workspace:

    cd lib/db
    DATABASE_URL="<the estimator database url>" pnpm run push

This creates/updates `estimator_drafts`, `estimator_issued_quotes`, `estimator_quote_deliveries`,
`estimator_intake_connections` and the new `estimator_private_pdfs`. Do not point this at the
HBUILD mesh database: the estimator is external and owns its own records.

## 3. Netlify site

Add new site → Import from GitHub → pick the repo. Build settings come from `netlify.toml`
(publish `artifacts/deck-estimate/dist/public`, functions in `netlify/functions`). Then set
environment variables (values are yours; never put them in the repo):

Build-time:
- `NODE_VERSION` = `22`
- `PORT` = `5173` and `BASE_PATH` = `/`  (the Vite config requires both; PORT is unused at build)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — the Supabase project whose Auth signs staff in

Function runtime (Site settings → Environment variables, all scopes):
- `DATABASE_URL` — the estimator database from step 2
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — same Auth project as the VITE_ pair
- `ESTIMATOR_STAFF_USER_IDS` — comma-separated Supabase Auth user UUIDs allowed to author estimates
- Leave `PRIVATE_OBJECT_DIR` UNSET (that selects the database PDF store)
- Leave `H_LEDGER_INTAKE_ENABLED` UNSET — estimator → H LEDGER synchronization stays disabled
  (owner decision, `skills/hbuild-external-estimator/SKILL.md`); the sender needs
  `H_LEDGER_BASE_URL`, `H_LEDGER_KEY_ID`, `H_LEDGER_SECRET`, `H_LEDGER_INTAKE_STAFF_USER_IDS`
  only when that is deliberately restored
- `PLATFORM_GATEWAY_URL`, `PLATFORM_APP_CREDENTIAL`, `HBUILD_ORG_ID` — only for the mesh project
  lookup, and only after `deck-estimate` is registered in the platform (activation package, owner-
  gated). Unset, `/api/mesh/status` reports `configured: false` honestly and everything standalone works.

## 4. Verify after the first deploy

- `https://<site>/api/healthz` → `{"status":"ok"}`
- `https://<site>/api/intake/status` → `{"configured":false}` (correct while sync is disabled)
- Sign in, build a draft, issue it, download both PDFs.

## Host limits to know

Netlify synchronous functions cap request/response bodies around 6 MB and run time at 26 s
(set the function timeout to the max in site settings). The app's own PDF ceiling is 8 MiB, but the
PDFs it renders are text-only and a few KB; if multi-MB PDFs ever become real, revisit hosting for
`/api/intake/documents`. The signed Ledger sender's 45 s fetch timeout also exceeds the function
cap — irrelevant while sync is disabled; revisit at restoration time.
