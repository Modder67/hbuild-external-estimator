import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { DeliverIntakeProjectBody, DeliverIntakeDocumentBody } from "@workspace/api-zod";
import { db, estimateDeliveriesTable, estimateDraftsTable, issuedQuotesTable } from "@workspace/db";
import {
  claimIntakePauseGate,
  clearIntakePause,
  persistIntakePause,
  readIntakePauseStatus,
} from "../lib/intakePause";
import {
  DEFAULT_PAUSE_RETRY_AFTER_SECONDS,
  deliverSignedIntake,
  type SignedIntakeResult,
} from "../lib/signedIntake";
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
  const mesh = gatewayConfig();
  if (!base?.startsWith("https://") || !keyId || !secret || !mesh ||
      !staffIds.length || staffIds.some(id => !uuid.test(id))) return null;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash) return null;
    return { url, keyId, secret, staffIds, orgId: mesh.orgId };
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
  return { userId, orgId: mesh.orgId, intake } as const;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

async function issuedDeliverySnapshots(orgId: string, sourceId: string) {
  return db.select({
    identityJson: estimateDeliveriesTable.identityJson,
    proposalJson: estimateDeliveriesTable.proposalJson,
    takeoffJson: estimateDeliveriesTable.takeoffJson,
    proposalSha256: estimateDeliveriesTable.proposalSha256,
    takeoffSha256: estimateDeliveriesTable.takeoffSha256,
  }).from(estimateDraftsTable)
    .innerJoin(issuedQuotesTable, eq(issuedQuotesTable.draftId, estimateDraftsTable.id))
    .innerJoin(estimateDeliveriesTable, eq(estimateDeliveriesTable.quoteId, issuedQuotesTable.id))
    .where(and(
      eq(estimateDraftsTable.orgId, orgId),
      eq(estimateDraftsTable.sourceId, sourceId),
    ));
}

function matchesFrozenIdentity(identityJson: unknown, request: unknown) {
  return stableJson(identityJson) === stableJson(request);
}

function matchesFrozenDocument(
  rows: Awaited<ReturnType<typeof issuedDeliverySnapshots>>,
  type: "proposal" | "takeoff",
  request: unknown,
) {
  const document = (request as { document?: { sha256?: unknown } } | null)?.document;
  if (!document || typeof document.sha256 !== "string") return false;
  return rows.some(row => {
    const envelope = type === "proposal" ? row.proposalJson : row.takeoffJson;
    const expectedHash = type === "proposal" ? row.proposalSha256 : row.takeoffSha256;
    return expectedHash === document.sha256 &&
      matchesFrozenIdentity(envelope, request);
  });
}

function sendDeliveryError(res: Response, result: Extract<SignedIntakeResult, { status: number }>) {
  if (result.retryAfterSeconds !== undefined)
    res.set("Retry-After", String(result.retryAfterSeconds));
  res.status(result.status).json({
    error: result.error,
    ...(result.paused ? { paused: true } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: result.retryAfterSeconds }),
  });
}

async function deliverForOrg(
  orgId: string,
  config: NonNullable<ReturnType<typeof intakeConfig>>,
  endpoint: "projects" | "documents",
  deliveryId: string,
  payload: object,
  logStateError: (error: unknown) => void,
): Promise<SignedIntakeResult> {
  const gate = await claimIntakePauseGate(orgId);
  if (gate.kind === "paused") {
    return {
      status: 503,
      error: "H Ledger synchronization is paused by the office. Keep this delivery and retry after synchronization resumes.",
      paused: true,
      reason: "estimator_sync_disabled",
      retryAfterSeconds: gate.retryAfterSeconds,
    };
  }
  if (gate.kind === "unavailable") {
    return {
      status: 503,
      error: "Estimator intake state is unavailable; this delivery was not sent. Retry later.",
    };
  }

  const result = await deliverSignedIntake(config, endpoint, deliveryId, payload);
  if ("error" in result && result.paused) {
    try {
      await persistIntakePause(
        orgId,
        result.retryAfterSeconds ?? DEFAULT_PAUSE_RETRY_AFTER_SECONDS,
      );
    } catch (error) {
      logStateError(error);
      return {
        status: 503,
        error: "H Ledger synchronization is paused, but this server could not save the organization pause state. Keep the delivery and retry later.",
      };
    }
  } else if (gate.probe && !("error" in result)) {
    try {
      await clearIntakePause(orgId);
    } catch (error) {
      logStateError(error);
      return {
        status: 503,
        error: "H Ledger returned a receipt, but this server could not clear its local pause state. Keep the delivery and retry later.",
      };
    }
  }
  return result;
}

router.get("/status", async (req, res): Promise<void> => {
  const config = intakeConfig();
  if (!config) {
    res.json({ configured: false });
    return;
  }
  try {
    const pause = await readIntakePauseStatus(config.orgId);
    res.json({ configured: true, ...(pause ?? {}) });
  } catch (error) {
    req.log.warn({ error }, "Unable to read estimator intake pause status");
    res.status(503).json({
      configured: true,
      error: "Estimator intake pause status is unavailable.",
    });
  }
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
    const snapshots = await issuedDeliverySnapshots(auth.orgId, sourceId);
    if (!snapshots.some(row => matchesFrozenIdentity(row.identityJson, req.body))) {
      res.status(409).json({ error: "Only the exact identity snapshot from an immutable issued estimate can be delivered." }); return;
    }
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
    const result = await deliverForOrg(auth.orgId, auth.intake, "projects", deliveryId, payload,
      error => req.log.warn({ error }, "Unable to update estimator intake pause state"));
    if ("error" in result) { sendDeliveryError(res, result); return; }
    if (result.replayed) res.set("Idempotent-Replayed", "true");
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
    const snapshots = await issuedDeliverySnapshots(auth.orgId, sourceId);
    const documentMetadata = { ...req.body.document };
    delete documentMetadata.contentBase64;
    const frozenRequest = { ...req.body, document: documentMetadata };
    if (!matchesFrozenDocument(snapshots, document.type, frozenRequest)) {
      res.status(409).json({ error: "Only the exact PDF from an immutable issued estimate can be delivered." }); return;
    }
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
    const result = await deliverForOrg(auth.orgId, auth.intake, "documents", deliveryId, payload,
      error => req.log.warn({ error }, "Unable to update estimator intake pause state"));
    if ("error" in result) { sendDeliveryError(res, result); return; }
    if (result.replayed) res.set("Idempotent-Replayed", "true");
    res.json({ ...result, detail: "H Ledger accepted the document receipt. Verify its stored file and version in H Docs before release." });
  } catch (error) {
    req.log.warn({ error }, "Ledger document delivery failed");
    res.status(503).json({ error: "H Ledger document intake is unavailable; retry the same delivery." });
  }
});

export default router;