import { Router, type IRouter } from "express";
import { ListMeshProjectsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/mesh/status", (_req, res): void => {
  res.json({
    configured: Boolean(
      process.env.PLATFORM_GATEWAY_URL?.startsWith("https://") &&
      process.env.PLATFORM_APP_CREDENTIAL &&
      process.env.HBUILD_ORG_ID &&
      process.env.SUPABASE_URL?.startsWith("https://") &&
      process.env.SUPABASE_PUBLISHABLE_KEY,
    ),
  });
});

router.get("/mesh/projects", async (req, res): Promise<void> => {
  const gatewayUrl = process.env.PLATFORM_GATEWAY_URL?.trim();
  const credential = process.env.PLATFORM_APP_CREDENTIAL?.trim();
  const orgId = process.env.HBUILD_ORG_ID?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!gatewayUrl || !credential || !orgId || !supabaseUrl || !publicKey) {
    res.status(503).json({ error: "Project connection is not configured. Local downloads remain available." });
    return;
  }
  if (!gatewayUrl.startsWith("https://") || !supabaseUrl.startsWith("https://")) {
    res.status(503).json({ error: "Project connection has invalid server configuration." });
    return;
  }
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? "");
  if (!match) {
    res.status(401).json({ error: "Sign in to view projects." });
    return;
  }
  try {
    // Never trust a browser-provided user ID. Validate the user's live access
    // token before forwarding only its verified subject to the mesh gateway.
    const auth = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: `Bearer ${match[1]}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!auth.ok) {
      res.status(401).json({ error: "Your session has expired. Sign in again." });
      return;
    }
    const user = await auth.json() as { id?: unknown };
    if (typeof user.id !== "string" || !user.id) {
      res.status(401).json({ error: "Invalid user session." });
      return;
    }
    const result = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hbuild-app": "deck-estimate",
        "x-hbuild-app-credential": credential,
        "x-hbuild-user": user.id,
      },
      body: JSON.stringify({ target: "planner", action: "listProjects", orgId, payload: {} }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!result.ok) {
      res.status(503).json({ error: "Project gateway is unavailable." });
      return;
    }
    const envelope = await result.json() as {
      ok?: boolean;
      data?: unknown;
      error?: { code?: string; message?: string };
    };
    if (!envelope.ok) {
      const denied = envelope.error?.code === "not_granted" || envelope.error?.code === "not_member";
      res.status(denied ? 403 : 503).json({
        error: denied ? "Your account or this estimator does not have permission to list projects." : "Project lookup is unavailable.",
      });
      return;
    }
    const parsed = ListMeshProjectsResponse.safeParse(envelope.data);
    if (!parsed.success) {
      req.log.warn("Planner returned an unexpected project response");
      res.status(503).json({ error: "Project lookup returned an invalid response." });
      return;
    }
    res.json(parsed.data);
  } catch (error) {
    req.log.warn({ error }, "Project lookup failed");
    res.status(503).json({ error: "Project connection is unavailable. Local downloads still work." });
  }
});

export default router;