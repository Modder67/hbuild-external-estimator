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

const wrapped = serverless(app, {
  // serverless-http pre-sets req.body to the raw Buffer of the event body.
  // Express 5's json middleware skips parsing when a body is already present
  // (Express 4 used to overwrite it), so every JSON route saw a Buffer and
  // rejected the request ("slug: Required"). Parse the JSON here instead;
  // invalid JSON keeps the buffer and fails route validation as before.
  request(request: { body?: unknown; headers?: Record<string, string | string[] | undefined> }) {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return;
    const type = request.headers?.["content-type"];
    const value = Array.isArray(type) ? type[0] : type;
    if (!value?.toLowerCase().includes("application/json")) return;
    try {
      request.body = JSON.parse(request.body.toString("utf8")) as unknown;
    } catch {
      /* leave the raw buffer; the route's validation rejects it */
    }
  },
});

export const handler = async (event: unknown, context: unknown) =>
  wrapped(event as never, context as never);
