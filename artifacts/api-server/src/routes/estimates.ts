import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  CreateEstimateBody,
  GetEstimateResponse,
  GetEstimateDeliveryResponse,
  GetEstimateRevisionResponse,
  GetEstimateRevisionsResponse,
  IssueEstimateBody,
  IssueEstimateResponse,
  ListEstimatesResponse,
  UpdateEstimateBody,
  UpdateEstimateResponse,
} from "@workspace/api-zod";
import { db, estimateDeliveriesTable, estimateDraftsTable, issuedQuotesTable } from "@workspace/db";
import {
  calculateForSlug,
  POLICY,
  RATE_BOOK_VERSION,
  totals as calculateTotals,
  uniqueLines,
  type Calculation,
} from "@workspace/estimator-core";
import { allowedProjects, gatewayConfig, verifiedUser } from "./mesh";
import { proposalRows, readPrivatePdf, renderPdf, savePrivatePdf, sha256, takeoffRows } from "../lib/estimateDelivery";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugs = new Set(["flooring", "bathroom", "basement"]);
const MAX_PROJECT_BYTES = 96 * 1024;

type Authorized = { userId: string; orgId: string };
type AuthorizationFailure = { error: string; status: number };

async function authorize(req: Request): Promise<Authorized | AuthorizationFailure> {
  const config = gatewayConfig();
  const staffIds = process.env.H_LEDGER_INTAKE_STAFF_USER_IDS?.split(",").map(id => id.trim()).filter(id => uuid.test(id)) ?? [];
  if (!config || !staffIds.length) {
    return { error: "Estimator persistence is not provisioned for approved staff.", status: 503 };
  }
  const userId = await verifiedUser(req, config);
  if (!userId) return { error: "Sign in to access estimator drafts.", status: 401 };
  if (!staffIds.includes(userId)) return { error: "Your account is not approved for estimator persistence.", status: 403 };
  const result = await allowedProjects(config, userId);
  if ("error" in result) return { error: result.error ?? "Project gateway is unavailable.", status: result.status ?? 503 };
  // The gateway result establishes organization membership/app grant. Estimator
  // source IDs are locally generated and intentionally need not be planner IDs.
  return { userId, orgId: config.orgId };
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const raw = JSON.stringify(value);
    return !!raw && Buffer.byteLength(raw) <= MAX_PROJECT_BYTES;
  } catch { return false; }
}

function validateProject(project: unknown): project is Record<string, unknown> & {
  sourceId: string; clientSourceId: string; firstName: string; lastName: string;
  projectName: string; scope: Record<string, unknown>;
} {
  if (!jsonObject(project) || typeof project.sourceId !== "string" ||
      typeof project.clientSourceId !== "string" || !uuid.test(project.sourceId) ||
      !uuid.test(project.clientSourceId) ||
      project.sourceId.toLowerCase() === project.clientSourceId.toLowerCase() ||
      typeof project.firstName !== "string" ||
      typeof project.lastName !== "string" ||
      typeof project.projectName !== "string" || project.projectName.length > 150 ||
      !jsonObject(project.scope)) return false;
  const fields = new Set([
    "sourceId", "clientSourceId", "firstName", "lastName", "phone", "email",
    "addressLine1", "addressLine2", "city", "region", "postalCode", "jobCode",
    "projectName", "salesperson", "scope",
  ]);
  if (Object.keys(project).some(key => !fields.has(key))) return false;
  for (const key of ["phone", "email", "addressLine1", "addressLine2", "city", "region", "postalCode", "jobCode", "salesperson"]) {
    if (project[key] !== undefined && typeof project[key] !== "string") return false;
  }
  if (typeof project.email === "string" && project.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(project.email.trim())) return false;
  if (typeof project.jobCode === "string" && project.jobCode.trim() &&
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(project.jobCode.trim())) return false;
  for (const key of ["addressLine1", "addressLine2", "city", "region", "postalCode"]) {
    if (typeof project[key] === "string" && project[key].length > 500) return false;
  }
  return true;
}

function draftEntity(row: typeof estimateDraftsTable.$inferSelect) {
  return {
    id: row.id, slug: row.slug, version: row.version, project: row.project,
    calculation: row.calculation, totals: row.totals, policyVersion: row.policyVersion,
    rateBookVersion: row.rateBookVersion, updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

function quoteEntity(row: typeof issuedQuotesTable.$inferSelect) {
  return {
    id: row.id, draftId: row.draftId, revision: row.revision, draftVersion: row.draftVersion,
    project: row.project, calculation: row.calculation, totals: row.totals,
    policyVersion: row.policyVersion, rateBookVersion: row.rateBookVersion,
    issuedAt: row.issuedAt, issuedBy: row.issuedBy,
  };
}

function computed(slug: string, project: Record<string, unknown>) {
  const calculation = uniqueLines(calculateForSlug(slug, project.scope)) as Calculation;
  return {
    calculation,
    totals: calculateTotals(calculation),
    policyVersion: POLICY.version,
    rateBookVersion: RATE_BOOK_VERSION,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function documentName(projectName: unknown, slug: string, type: "proposal" | "takeoff") {
  const name = typeof projectName === "string"
    ? projectName.trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "")
    : "";
  return `${name || "estimate"}-${slug}-${type}.pdf`;
}

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

async function getDraft(id: string, auth: Authorized) {
  if (!uuid.test(id)) return null;
  const [row] = await db.select().from(estimateDraftsTable)
    .where(and(eq(estimateDraftsTable.id, id), eq(estimateDraftsTable.orgId, auth.orgId))).limit(1);
  return row;
}

router.get("/estimates", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const drafts = await db.select().from(estimateDraftsTable)
      .where(eq(estimateDraftsTable.orgId, auth.orgId)).orderBy(desc(estimateDraftsTable.updatedAt));
    res.json(ListEstimatesResponse.parse({ drafts: drafts.map(draftEntity) }));
  } catch (error) {
    req.log.warn({ error }, "Estimate draft listing failed");
    res.status(503).json({ error: "Estimate drafts are temporarily unavailable." });
  }
});

router.post("/estimates", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const parsed = CreateEstimateBody.safeParse(req.body);
    if (!parsed.success || !slugs.has(parsed.data.slug) || !validateProject(parsed.data.project)) {
      res.status(400).json({ error: "Provide a supported estimator slug and a valid project snapshot." }); return;
    }
    const computedEstimate = computed(parsed.data.slug, parsed.data.project);
    const now = new Date();
    const [row] = await db.insert(estimateDraftsTable).values({
      orgId: auth.orgId, slug: parsed.data.slug, sourceId: parsed.data.project.sourceId,
      project: parsed.data.project, ...computedEstimate, createdBy: auth.userId, updatedBy: auth.userId,
      createdAt: now, updatedAt: now,
    }).returning();
    res.status(201).json(GetEstimateResponse.parse(draftEntity(row)));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A shared estimate already exists for this source ID." }); return;
    }
    req.log.warn({ error }, "Estimate draft creation failed");
    res.status(503).json({ error: "Estimate draft could not be saved." });
  }
});

router.get("/estimates/:id", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const row = await getDraft(param(req, "id") ?? "", auth);
    if (!row) { res.status(404).json({ error: "Estimate draft not found." }); return; }
    res.json(GetEstimateResponse.parse(draftEntity(row)));
  } catch (error) {
    req.log.warn({ error }, "Estimate draft read failed");
    res.status(503).json({ error: "Estimate draft is temporarily unavailable." });
  }
});

router.put("/estimates/:id", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const parsed = UpdateEstimateBody.safeParse(req.body);
    if (!parsed.success || !Number.isSafeInteger(parsed.data.expectedVersion) || parsed.data.expectedVersion < 1) {
      res.status(400).json({ error: "Provide an expected version and valid project snapshot." }); return;
    }
    const current = await getDraft(param(req, "id") ?? "", auth);
    if (!current) { res.status(404).json({ error: "Estimate draft not found." }); return; }
    if (!validateProject(parsed.data.project) || parsed.data.project.sourceId !== current.sourceId) {
      res.status(400).json({ error: "Project source ID cannot change and both source identifiers must be valid." }); return;
    }
    const computedEstimate = computed(current.slug, parsed.data.project);
    const [row] = await db.update(estimateDraftsTable).set({
      project: parsed.data.project, ...computedEstimate,
      version: current.version + 1, updatedBy: auth.userId, updatedAt: new Date(),
    }).where(and(
      eq(estimateDraftsTable.id, current.id), eq(estimateDraftsTable.orgId, auth.orgId),
      eq(estimateDraftsTable.version, parsed.data.expectedVersion),
    )).returning();
    if (!row) { res.status(409).json({ error: "Estimate changed in another session. Reload before saving." }); return; }
    res.json(UpdateEstimateResponse.parse(draftEntity(row)));
  } catch (error) {
    req.log.warn({ error }, "Estimate draft update failed");
    res.status(503).json({ error: "Estimate draft could not be saved." });
  }
});

router.post("/estimates/:id/issue", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const parsed = IssueEstimateBody.safeParse(req.body);
    if (!parsed.success || !Number.isSafeInteger(parsed.data.expectedVersion) || parsed.data.expectedVersion < 1) {
      res.status(400).json({ error: "Provide a valid expected draft version." }); return;
    }
    const draft = await getDraft(param(req, "id") ?? "", auth);
    if (!draft) { res.status(404).json({ error: "Estimate draft not found." }); return; }
    const result = await db.transaction(async tx => {
      const [locked] = await tx.select().from(estimateDraftsTable)
        .where(and(eq(estimateDraftsTable.id, draft.id), eq(estimateDraftsTable.orgId, auth.orgId)))
        .for("update").limit(1);
      if (!locked) return { failure: "missing" as const };
      const [replay] = await tx.select().from(issuedQuotesTable).where(and(
        eq(issuedQuotesTable.draftId, locked.id), eq(issuedQuotesTable.draftVersion, parsed.data.expectedVersion),
      )).limit(1);
      if (replay) return { quote: replay };
      if (locked.version !== parsed.data.expectedVersion) return { failure: "conflict" as const };

      const issueProject = locked.project;
      if (!validateProject(issueProject) || !issueProject.firstName.trim() ||
          !issueProject.lastName.trim() || !issueProject.projectName.trim()) {
        return { failure: "identity" as const };
      }
      const live = computed(locked.slug, locked.project);
      if (locked.policyVersion !== POLICY.version || locked.rateBookVersion !== RATE_BOOK_VERSION ||
          stableJson(live.calculation) !== stableJson(locked.calculation) ||
          stableJson(live.totals) !== stableJson(locked.totals)) {
        return { failure: "stale" as const };
      }
      const calc = live.calculation;
      const quoteTotals = live.totals;
      if (calc.issues.length || !calc.lines.length || quoteTotals.beforeTaxCents <= 0) {
        return { failure: "incomplete" as const };
      }
      const revisionRows = await tx.select().from(issuedQuotesTable)
        .where(eq(issuedQuotesTable.draftId, locked.id)).orderBy(desc(issuedQuotesTable.revision)).limit(1);
      const revision = (revisionRows[0]?.revision ?? 0) + 1;
      const quoteId = randomUUID();
      const project = locked.project;
      const source = { updatedAt: new Date().toISOString() };
      const client: Record<string, unknown> = {
        firstName: String(project.firstName).trim(),
        lastName: String(project.lastName).trim(),
        ...(clean(project.phone) ? { phone: clean(project.phone) } : {}),
        ...(clean(project.email) ? { email: clean(project.email) } : {}),
      };
      const address = {
        line1: clean(project.addressLine1),
        line2: clean(project.addressLine2),
        city: clean(project.city),
        state: clean(project.region),
        postalCode: clean(project.postalCode),
      };
      if (Object.values(address).some(Boolean)) client.address = address;
      const typeName = locked.slug === "flooring" ? "Flooring" : locked.slug === "bathroom" ? "Bathroom" : "Basement";
      const proposalBytes = renderPdf(`${typeName} estimate`, proposalRows(project, calc, quoteTotals.beforeTaxCents));
      const takeoffBytes = renderPdf(`${typeName} material takeoff`, takeoffRows(calc));
      if (proposalBytes.length > 8 * 1024 * 1024 || takeoffBytes.length > 8 * 1024 * 1024) {
        return { failure: "oversized" as const };
      }
      const proposalPath = `estimator-quotes/${quoteId}/proposal.pdf`;
      const takeoffPath = `estimator-quotes/${quoteId}/takeoff.pdf`;
      const proposalSha256 = sha256(proposalBytes);
      const takeoffSha256 = sha256(takeoffBytes);
      const identityJson = {
        sourceId: locked.sourceId,
        clientSourceId: project.clientSourceId,
        deliveryId: randomUUID(),
        source,
        client,
        project: {
          projectType: typeName,
          name: String(project.projectName).trim(),
          ...(clean(project.jobCode) ? { jobCode: clean(project.jobCode) } : {}),
        },
        expectedDocuments: ["proposal", "takeoff"],
      };
      const proposalJson = {
        sourceId: locked.sourceId,
        deliveryId: randomUUID(),
        source,
        document: {
          type: "proposal",
          originalName: documentName(project.projectName, locked.slug, "proposal"),
          mime: "application/pdf",
          sha256: proposalSha256,
        },
      };
      const takeoffJson = {
        sourceId: locked.sourceId,
        deliveryId: randomUUID(),
        source,
        document: {
          type: "takeoff",
          originalName: documentName(project.projectName, locked.slug, "takeoff"),
          mime: "application/pdf",
          sha256: takeoffSha256,
        },
      };
      await Promise.all([savePrivatePdf(proposalPath, proposalBytes), savePrivatePdf(takeoffPath, takeoffBytes)]);
      const [quote] = await tx.insert(issuedQuotesTable).values({
        id: quoteId, draftId: locked.id, revision, draftVersion: locked.version,
        project: locked.project, calculation: live.calculation, totals: live.totals,
        policyVersion: live.policyVersion, rateBookVersion: live.rateBookVersion, issuedBy: auth.userId,
      }).returning();
      await tx.insert(estimateDeliveriesTable).values({
        quoteId, identityJson, proposalJson, takeoffJson, proposalPath, proposalSha256,
        takeoffPath, takeoffSha256,
      });
      return { quote };
    });
    if ("failure" in result) {
      const status = result.failure === "incomplete" || result.failure === "oversized" || result.failure === "identity"
        ? 422 : result.failure === "stale" || result.failure === "conflict" ? 409 : 404;
      res.status(status).json({ error: result.failure === "incomplete"
        ? "Resolve calculation issues and enter a non-zero scope before issuing."
        : result.failure === "identity" ? "Enter client first and last name and a project name before issuing."
        : result.failure === "oversized" ? "Generated PDF exceeds the 8 MiB delivery limit."
        : result.failure === "stale" ? "Draft calculation or estimator policy/rates are stale. Re-save and review the recalculated draft."
        : result.failure === "conflict" ? "Estimate changed in another session. Reload before issuing."
          : "Estimate draft not found." });
      return;
    }
    res.json(IssueEstimateResponse.parse(quoteEntity(result.quote)));
  } catch (error) {
    req.log.warn({ error }, "Quote issue failed");
    res.status(503).json({ error: "Quote could not be issued; the draft remains available for retry." });
  }
});

router.get("/estimates/:id/revisions", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const draft = await getDraft(param(req, "id") ?? "", auth);
    if (!draft) { res.status(404).json({ error: "Estimate draft not found." }); return; }
    const rows = await db.select().from(issuedQuotesTable).where(eq(issuedQuotesTable.draftId, draft.id))
      .orderBy(desc(issuedQuotesTable.revision));
    res.json(GetEstimateRevisionsResponse.parse({ revisions: rows.map(quoteEntity) }));
  } catch (error) {
    req.log.warn({ error }, "Quote revision listing failed");
    res.status(503).json({ error: "Quote revisions are temporarily unavailable." });
  }
});

async function authorizedQuote(req: Request, auth: Authorized) {
  const draftId = param(req, "id") ?? "";
  const revision = Number(param(req, "revision"));
  if (!uuid.test(draftId) || !Number.isSafeInteger(revision) || revision < 1) return null;
  const [draft] = await db.select().from(estimateDraftsTable).where(and(
    eq(estimateDraftsTable.id, draftId), eq(estimateDraftsTable.orgId, auth.orgId),
  )).limit(1);
  if (!draft) return null;
  const [quote] = await db.select().from(issuedQuotesTable).where(and(
    eq(issuedQuotesTable.draftId, draft.id), eq(issuedQuotesTable.revision, revision),
  )).limit(1);
  return quote ?? null;
}

router.get("/estimates/:id/revisions/:revision", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const quote = await authorizedQuote(req, auth);
    if (!quote) { res.status(404).json({ error: "Issued quote revision not found." }); return; }
    res.json(GetEstimateRevisionResponse.parse(quoteEntity(quote)));
  } catch (error) {
    req.log.warn({ error }, "Quote revision read failed");
    res.status(503).json({ error: "Quote revision is temporarily unavailable." });
  }
});

router.get("/estimates/:id/revisions/:revision/delivery", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const quote = await authorizedQuote(req, auth);
    if (!quote) { res.status(404).json({ error: "Issued quote revision not found." }); return; }
    const [delivery] = await db.select().from(estimateDeliveriesTable)
      .where(eq(estimateDeliveriesTable.quoteId, quote.id)).limit(1);
    if (!delivery) { res.status(503).json({ error: "Frozen delivery snapshot is unavailable." }); return; }
    const [proposalBytes, takeoffBytes] = await Promise.all([
      readPrivatePdf(delivery.proposalPath), readPrivatePdf(delivery.takeoffPath),
    ]);
    if (sha256(proposalBytes) !== delivery.proposalSha256 || sha256(takeoffBytes) !== delivery.takeoffSha256) {
      res.status(503).json({ error: "Frozen delivery PDF integrity verification failed." }); return;
    }
    const proposalEnvelope = delivery.proposalJson as Record<string, any>;
    const takeoffEnvelope = delivery.takeoffJson as Record<string, any>;
    res.json(GetEstimateDeliveryResponse.parse({
      identityJson: delivery.identityJson,
      proposalJson: {
        ...proposalEnvelope,
        document: { ...proposalEnvelope.document, contentBase64: proposalBytes.toString("base64") },
      },
      takeoffJson: {
        ...takeoffEnvelope,
        document: { ...takeoffEnvelope.document, contentBase64: takeoffBytes.toString("base64") },
      },
      proposalSha256: delivery.proposalSha256, takeoffSha256: delivery.takeoffSha256,
    }));
  } catch (error) {
    req.log.warn({ error }, "Quote delivery snapshot read failed");
    res.status(503).json({ error: "Frozen delivery snapshot is temporarily unavailable." });
  }
});

router.get("/estimates/:id/revisions/:revision/pdf/:type", async (req, res): Promise<void> => {
  try {
    const auth = await authorize(req);
    if ("error" in auth) { res.status(auth.status).json({ error: auth.error }); return; }
    const type = param(req, "type");
    if (type !== "proposal" && type !== "takeoff") {
      res.status(400).json({ error: "PDF type must be proposal or takeoff." }); return;
    }
    const quote = await authorizedQuote(req, auth);
    if (!quote) { res.status(404).json({ error: "Issued quote revision not found." }); return; }
    const [delivery] = await db.select().from(estimateDeliveriesTable)
      .where(eq(estimateDeliveriesTable.quoteId, quote.id)).limit(1);
    if (!delivery) { res.status(404).json({ error: "Frozen PDF is unavailable." }); return; }
    const bytes = await readPrivatePdf(type === "proposal" ? delivery.proposalPath : delivery.takeoffPath);
    const expected = type === "proposal" ? delivery.proposalSha256 : delivery.takeoffSha256;
    if (sha256(bytes) !== expected) { res.status(503).json({ error: "Stored PDF integrity verification failed." }); return; }
    res.type("application/pdf").set("Cache-Control", "private, no-store").send(bytes);
  } catch (error) {
    req.log.warn({ error }, "Quote PDF retrieval failed");
    res.status(503).json({ error: "Issued PDF is temporarily unavailable." });
  }
});

export default router;