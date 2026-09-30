import { createHash, createHmac } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { ListMeshProjectsResponse, GetMeshProjectDetailsResponse, DraftHookProjectDetails } from "@workspace/api-zod";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function gatewayConfig() {
  const gatewayUrl = process.env.PLATFORM_GATEWAY_URL?.trim();
  const credential = process.env.PLATFORM_APP_CREDENTIAL?.trim();
  const orgId = process.env.HBUILD_ORG_ID?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!gatewayUrl?.startsWith("https://") || !credential || !uuid.test(orgId ?? "") ||
      !supabaseUrl?.startsWith("https://") || !publicKey) return null;
  return { gatewayUrl, credential, orgId: orgId!, supabaseUrl, publicKey };
}

/** The end user's Supabase access token from the request, if present. */
export function bearerToken(req: Request): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "");
  return match ? match[1] : null;
}

export async function verifiedUser(req: Request, config: NonNullable<ReturnType<typeof gatewayConfig>>) {
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "");
  if (!match) return null;
  const auth = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: config.publicKey, Authorization: `Bearer ${match[1]}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!auth.ok) return null;
  const user = await auth.json() as { id?: unknown };
  return typeof user.id === "string" && uuid.test(user.id) ? user.id : null;
}

export async function allowedProjects(
  config: NonNullable<ReturnType<typeof gatewayConfig>>,
  user: { id: string; accessToken: string },
) {
  let result: Response;
  try {
    result = await fetch(config.gatewayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hbuild-app": "deck-estimate",
        "x-hbuild-app-credential": config.credential,
        "x-hbuild-user": user.id,
        // The gateway authenticates the END USER by their own access token;
        // the app credential above authenticates this estimator. Without the
        // bearer, every call is refused 401 before authorization begins.
        authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ target: "planner", action: "listProjects", orgId: config.orgId, payload: {} }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch (error) {
    console.error("[mesh] gateway unreachable:", error instanceof Error ? error.message : error);
    return { error: "Project gateway is unreachable.", status: 503 } as const;
  }
  let envelope: { ok?: boolean; data?: unknown; error?: { code?: string } } = {};
  try { envelope = await result.json() as typeof envelope; } catch { /* non-JSON body */ }
  if (!result.ok || !envelope.ok) {
    const code = envelope.error?.code;
    console.error(`[mesh] gateway refused planner.listProjects: http ${result.status}${code ? ` code=${code}` : ""}`);
    const denied = code === "not_granted" || code === "not_member";
    return {
      error: denied
        ? "Your account or this estimator does not have permission to list projects."
        : `Project gateway is unavailable (http ${result.status}${code ? `: ${code}` : ""}).`,
      status: denied ? 403 : 503,
    } as const;
  }
  const parsed = ListMeshProjectsResponse.safeParse(envelope.data);
  if (!parsed.success) return { error: "Project lookup returned an invalid response.", status: 503 } as const;
  return { projects: parsed.data } as const;
}

router.get("/mesh/status", (_req, res): void => {
  res.json({ configured: Boolean(gatewayConfig()) });
});

router.get("/mesh/projects", async (req, res): Promise<void> => {
  const config = gatewayConfig();
  if (!config) {
    res.status(503).json({ error: "Project connection is not configured. Local downloads remain available." });
    return;
  }
  try {
    const userId = await verifiedUser(req, config);
    const accessToken = bearerToken(req);
    if (!userId || !accessToken) { res.status(401).json({ error: "Sign in to view projects." }); return; }
    const result = await allowedProjects(config, { id: userId, accessToken });
    if ("error" in result) { res.status(result.status ?? 503).json({ error: result.error }); return; }
    res.json(result.projects);
  } catch (error) {
    req.log.warn({ error }, "Project lookup failed");
    res.status(503).json({ error: "Project connection is unavailable. Local downloads still work." });
  }
});

router.get("/mesh/projects/:id/details", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id || !uuid.test(id)) { res.status(400).json({ error: "Invalid project ID." }); return; }
  const config = gatewayConfig();
  const baseUrl = process.env.H_DRAFT_BASE_URL?.trim();
  const keyId = process.env.H_DRAFT_KEY_ID?.trim();
  const secret = process.env.H_DRAFT_SECRET?.trim();
  if (!config || !baseUrl?.startsWith("https://") || !keyId || !secret) {
    res.status(503).json({ error: "Verified project details are not provisioned yet." });
    return;
  }
  try {
    const userId = await verifiedUser(req, config);
    const accessToken = bearerToken(req);
    if (!userId || !accessToken) { res.status(401).json({ error: "Sign in to view project details." }); return; }
    const allowed = await allowedProjects(config, { id: userId, accessToken });
    if ("error" in allowed) { res.status(allowed.status ?? 503).json({ error: allowed.error }); return; }
    if (!allowed.projects.projects.some(p => p.id === id)) {
      res.status(404).json({ error: "This project is not available to your account." });
      return;
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const keyHash = createHash("sha256").update(secret).digest("hex");
    const signature = createHmac("sha256", keyHash).update(`${timestamp}.`).digest("hex");
    const endpoint = new URL(`/api/hooks/projects/${id}`, baseUrl);
    const result = await fetch(endpoint, {
      headers: { "x-hbuild-key": keyId, "x-hbuild-timestamp": timestamp, "x-hbuild-signature": signature },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (result.status === 404) {
      res.status(404).json({ error: "H Draft has no linked job details for this project." });
      return;
    }
    if (!result.ok) {
      res.status(503).json({ error: "Verified job details are unavailable from H Draft." });
      return;
    }
    const envelope = await result.json() as { ok?: boolean; data?: { data?: unknown } };
    if (!envelope.ok) { res.status(503).json({ error: "Verified job details are unavailable from H Draft." }); return; }
    const parsed = DraftHookProjectDetails.safeParse(envelope.data?.data);
    if (!parsed.success || parsed.data.projectId !== id) {
      req.log.warn("H Draft returned invalid project details");
      res.status(503).json({ error: "H Draft returned invalid project details." });
      return;
    }
    const { client } = parsed.data;
    const address = client && "address" in client ? client.address : null;
    const customerAddress = address ? [address.line1, address.line2,
      [address.city, address.state, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;
    const response = GetMeshProjectDetailsResponse.parse({
      projectId: id,
      jobCode: parsed.data.jobCode,
      customerName: client?.name ?? null,
      customerAddress: customerAddress || null,
      clientSource: address ? "ledger" : client ? "draft-link" : "missing",
    });
    res.json(response);
  } catch (error) {
    req.log.warn({ error }, "H Draft detail lookup failed");
    res.status(503).json({ error: "Verified job details are unavailable. Local downloads still work." });
  }
});

export default router;