/**
 * Netlify hosting for the estimator's Express API: the whole app behind one
 * function. The `/api/*` redirect in netlify.toml points here and the original
 * path reaches Express unchanged, so routes, auth, intake pause and the signed
 * Ledger sender behave exactly as on any other host.
 *
 * Host limits to know (documented in DEPLOY-NETLIFY.md): synchronous function
 * request/response bodies are capped around 6 MB and run time at 26 s, so a
 * PDF delivery near the app's own 8 MiB ceiling would need a different host —
 * the PDFs this app renders are text-only and a few KB.
 */
import serverless from "serverless-http";
import app from "../../artifacts/api-server/src/app";

const wrapped = serverless(app);

export const handler = async (event: unknown, context: unknown) =>
  wrapped(event as never, context as never);
