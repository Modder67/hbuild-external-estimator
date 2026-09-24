import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { DeliverIntakeProjectBody, DeliverIntakeDocumentBody } from "@workspace/api-zod";
import { allowedProjects, gatewayConfig, verifiedUser } from "./mesh";

const router: IRouter = Router();
const MAX_PDF = 8 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jobCodePattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
const instantPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

function intakeConfig() {
  // Explicit rollout switch: a signed account alone does not prove staff/role
  // authorization or that Ledger's local-only intake has been deployed.
  if (process.env.H_LEDGER_INTAKE_ENABLED !== "true") return null;
  const base = process.env.H_LEDGER_BASE_URL?.trim();
  const keyId = process.env.H_LEDGER_KEY_ID?.trim();
  const secret = process.env.H_LEDGER_SECRET?.trim();
  const staffIds = process.env.H_LEDGER_INTAKE_STAFF_USER_IDS?.split(",").map(id => id.trim()) ?? [];
  if (!base?.startsWith("https://") || !keyId || !secret || !gatewayConfig() ||
      !staffIds.length || staffIds.some(id => !uuid.test(id))) return null;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash) return null;
    return { url, keyId, secret, staffIds };
  } catch { return null; }
}

function sourceTime(source: { updatedAt: string }) {
  const t = Date.parse(source.updatedAt);
  return instantPattern.test(source.updatedAt) && Number.isFinite(t) &&
    t <= Date.now() + 5 * 60_000;
}

async function authorized(req: Request) {
  const mesh = gatewayConfig();
  const intake = intakeConfig();
  if (!mesh || !intake) return { status: 503, error: "H Ledger intake is not provisioned yet." } as const;
  const userId = await verifiedUser(req, mesh);
  if (!userId) return { status: 401, error: "Sign in to send this job to HBUILD." } as const;
  if (!intake.staffIds.includes(userId)) return { status: 403, error: "Your account is not approved for H Ledger intake." } as const;
  const grants = await allowedProjects(mesh, userId);
  if ("error" in grants) return { status: grants.status, error: grants.error } as const;
  return { userId, intake } as const;
}

async function deliver(
  config: NonNullable<ReturnType<typeof intakeConfig>>,
  endpoint: "projects" | "documents",
  deliveryId: string,
  payload: object,
) {
  const raw = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  // H Ledger's current convention uses the SHA256 hex *string* as the HMAC key.
  const keyHash = createHash("sha256").update(config.secret).digest("hex");
  const signature = createHmac("sha256", keyHash).update(`${timestamp}.${raw}`).digest("hex");
  const url = new URL(`/api/intake/v1/${endpoint}`, config.url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hbuild-key": config.keyId,
      "x-hbuild-timestamp": timestamp,
      "x-hbuild-signature": signature,
      "Idempotency-Key": deliveryId,
    },
    body: raw,
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json() as { ok?: unknown; data?: { outcome?: unknown }; error?: { code?: string } };
  if (!response.ok || result.ok !== true) {
    const conflict = response.status === 409 || result.error?.code === "conflict";
    return { status: conflict ? 409 : response.status === 401 || response.status === 403 ? response.status :
      response.status === 429 ? 429 : response.status === 400 || response.status === 422 ? 400 : 503,
      error: conflict ? "H Ledger requires review of this mapping or delivery. No new job was created here." :
        response.status === 401 || response.status === 403 ? "H Ledger denied the intake account; ask an administrator to review its grant." :
          response.status === 429 ? "H Ledger is rate-limiting deliveries; retry later with this same saved delivery." :
        response.status === 400 || response.status === 422 ? "H Ledger rejected this snapshot. Check the client and project details." :
          "H Ledger intake is unavailable; this delivery can be retried." };
  }
  if (result.data?.outcome !== "applied" && result.data?.outcome !== "stale") {
    return { status: 503, error: "H Ledger returned an unrecognized receipt; check Ledger before retrying." };
  }
  if (result.data.outcome === "stale")
    return { status: 409, error: "H Ledger reports an older source snapshot. Review the existing mapping/version before retrying." };
  return { outcome: result.data.outcome };
}

router.get("/status", (_req, res) => {
  res.json({ configured: Boolean(intakeConfig()) });
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = DeliverIntakeProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a client first and last name and a project name." }); return; }
  const { sourceId, clientSourceId, deliveryId, source, client, project, expectedDocuments } = parsed.data;
  if (!sourceTime(source) || !client.firstName.trim() || !client.lastName.trim() ||
      !project.name.trim() || !project.projectType.trim() ||
      (project.jobCode && !jobCodePattern.test(project.jobCode)) ||
      (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email))) {
    res.status(400).json({ error: "Invalid job details or source update time." }); return;
  }
  try {
    const auth = await authorized(req);
    if ("error" in auth) { res.status(auth.status ?? 503).json({ error: auth.error }); return; }
    const payload = {
      source,
      client: {
        externalId: `deck-estimate:client:${clientSourceId}`,
        firstName: client.firstName.trim(),
        lastName: client.lastName.trim(),
        ...(client.phone ? { phone: client.phone } : {}),
        ...(client.email ? { email: client.email } : {}),
        ...(client.address ? { address: client.address } : {}),
      },
      project: {
        externalId: `deck-estimate:project:${sourceId}`,
        projectType: project.projectType.trim(),
        name: project.name.trim(),
        ...(project.jobCode ? { jobCode: project.jobCode } : {}),
      },
      expectedDocuments: expectedDocuments ?? ["proposal", "takeoff"],
    };
    const result = await deliver(auth.intake, "projects", deliveryId, payload);
    if ("error" in result) { res.status(result.status ?? 503).json({ error: result.error }); return; }
    res.json({ ...result, detail: "Identity receipt accepted by H Ledger. Confirm the imported project in Ledger." });
  } catch (error) {
    req.log.warn({ error }, "Ledger identity delivery failed");
    res.status(503).json({ error: "H Ledger intake is unavailable; this delivery can be retried." });
  }
});

router.post("/documents", async (req, res): Promise<void> => {
  const parsed = DeliverIntakeDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid PDF delivery." }); return; }
  const { sourceId, deliveryId, source, document } = parsed.data;
  const encoded = document.contentBase64;
  if (!sourceTime(source) || encoded.length > Math.ceil(MAX_PDF / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) ||
      document.originalName.length > 180 || !/^[^/\\]+\.pdf$/i.test(document.originalName) ||
      !/^[a-f0-9]{64}$/.test(document.sha256)) {
    res.status(400).json({ error: "Invalid PDF size, filename, encoding, or hash." }); return;
  }
  const bytes = Buffer.from(encoded, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const expected = Buffer.from(document.sha256, "hex");
  if (bytes.length < 5 || bytes.length > MAX_PDF || bytes.subarray(0, 5).toString() !== "%PDF-" ||
      !timingSafeEqual(Buffer.from(hash, "hex"), expected)) {
    res.status(400).json({ error: "PDF integrity check failed or file exceeds 8 MiB." }); return;
  }
  try {
    const auth = await authorized(req);
    if ("error" in auth) { res.status(auth.status ?? 503).json({ error: auth.error }); return; }
    const payload = {
      source,
      project: { externalId: `deck-estimate:project:${sourceId}` },
      document: {
        externalId: `deck-estimate:project:${sourceId}:${document.type}`,
        type: document.type,
        originalName: document.originalName,
        mime: "application/pdf",
        sha256: hash,
        contentBase64: encoded,
      },
    };
    const result = await deliver(auth.intake, "documents", deliveryId, payload);
    if ("error" in result) { res.status(result.status ?? 503).json({ error: result.error }); return; }
    res.json({ ...result, detail: "H Ledger accepted the document receipt. Verify its stored file and version in H Docs before release." });
  } catch (error) {
    req.log.warn({ error }, "Ledger document delivery failed");
    res.status(503).json({ error: "H Ledger document intake is unavailable; retry the same delivery." });
  }
});

export default router;