import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, privatePdfsTable } from "@workspace/db";
import type { Calculation } from "@workspace/estimator-core";

/**
 * Private PDF storage backends. With PRIVATE_OBJECT_DIR set (Replit), PDFs go
 * to Replit's object storage through the local sidecar, exactly as before.
 * Without it (e.g. Netlify), PDFs live in the estimator's own Postgres
 * (`estimator_private_pdfs`), same path key, same no-overwrite rule as
 * ifGenerationMatch(0). Bytes are capped at 8 MiB upstream either way.
 */
const sidecar = "http://127.0.0.1:1106";

async function gcsLocation(relativePath: string, dir: string) {
  // Imported lazily so hosts without the sidecar never load or bundle-init GCS.
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${sidecar}/token`,
      type: "external_account",
      credential_source: {
        url: `${sidecar}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
  const clean = dir.replace(/^\/+|\/+$/g, "");
  const [bucketName, ...prefix] = clean.split("/");
  if (!bucketName || !prefix.length) throw new Error("PRIVATE_OBJECT_DIR is invalid.");
  return { bucket: storage.bucket(bucketName), path: [...prefix, relativePath].join("/") };
}

export async function savePrivatePdf(path: string, bytes: Buffer): Promise<void> {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (dir) {
    const target = await gcsLocation(path, dir);
    await target.bucket.file(target.path).save(bytes, {
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
    });
    return;
  }
  const inserted = await db.insert(privatePdfsTable)
    .values({ path, bytes })
    .onConflictDoNothing({ target: privatePdfsTable.path })
    .returning({ path: privatePdfsTable.path });
  if (inserted.length !== 1) throw new Error(`A private PDF already exists at ${path}.`);
}

export async function readPrivatePdf(path: string): Promise<Buffer> {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (dir) {
    const target = await gcsLocation(path, dir);
    const [bytes] = await target.bucket.file(target.path).download();
    return bytes;
  }
  const [row] = await db.select({ bytes: privatePdfsTable.bytes })
    .from(privatePdfsTable).where(eq(privatePdfsTable.path, path)).limit(1);
  if (!row) throw new Error(`No private PDF stored at ${path}.`);
  return Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pdfText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}

/** Produces a small self-contained, customer-safe PDF without contacting a third party. */
export function renderPdf(title: string, rows: string[]): Buffer {
  const wrap = (value: string) => {
    let text = value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
    const lines: string[] = [];
    while (text.length > 96) {
      let split = text.lastIndexOf(" ", 96);
      if (split < 1) split = 96;
      lines.push(text.slice(0, split));
      const remainder = text.slice(split);
      text = remainder.startsWith(" ") ? remainder.slice(1) : remainder;
    }
    lines.push(text);
    return lines;
  };
  const lines = [title, "", ...rows].flatMap(wrap);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  const pageRefs = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((page, index) => {
      const pageObject = 4 + index * 2;
      const contentObject = pageObject + 1;
      const commands = ["BT", "/F1 10 Tf", "48 754 Td", "14 TL"];
      page.forEach((line, lineIndex) => {
        if (lineIndex) commands.push("T*");
        commands.push(`(${pdfText(line)}) Tj`);
      });
      commands.push("ET");
      const stream = commands.join("\n");
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
        `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}

export function proposalRows(project: Record<string, unknown>, calculation: Calculation, total: number) {
  const client = [project.firstName, project.lastName].filter(value => typeof value === "string").join(" ");
  const projectName = typeof project.projectName === "string" ? project.projectName : "Estimate";
  const rows = [
    `Project: ${projectName}`,
    ...(client ? [`Prepared for: ${client}`] : []),
    "",
    "Before-tax estimate. Sales tax has not been configured.",
    ...calculation.lines.map(line =>
      `${line.group} - ${line.label}: ${line.quantity} ${line.unit} - $${(line.totalCents / 100).toFixed(2)}`),
    "",
    `Before-tax total: $${(total / 100).toFixed(2)}`,
  ];
  return rows;
}

export function takeoffRows(calculation: Calculation) {
  return ["Materials takeoff", ...calculation.takeoff.map(item =>
    `${item.label}: ${item.quantity} ${item.unit}`)];
}

function deckHeader(project: Record<string, unknown>, revision: number, issuedAt?: string) {
  const scope = project.scope as Record<string, any>;
  const job = scope.jobDetails as Record<string, unknown>;
  const name = typeof project.projectName === "string" && project.projectName.trim()
    ? project.projectName.trim()
    : typeof job.jobTitle === "string" && job.jobTitle.trim() ? job.jobTitle.trim() : "Deck estimate";
  const client = [project.firstName, project.lastName].filter(value => typeof value === "string" && value.trim()).join(" ");
  const date = typeof job.date === "string" && job.date.trim() ? job.date : "Not specified";
  return [`Project: ${name}`, `Client: ${client || "Not specified"}`, `Estimate date: ${date}`, `Issued at (UTC): ${issuedAt ?? "Not specified"}`, `Revision: ${revision}`, ""];
}

export function deckProposalRows(
  project: Record<string, unknown>,
  calculation: Calculation,
  total: number,
  revision: number,
  issuedAt?: string,
) {
  const scope = project.scope as Record<string, any>;
  const markupRates = { good: 52, better: 42, best: 37 };
  const markup = scope.selectedMarkup as keyof typeof markupRates;
  const materialTier = typeof scope.materialTier === "string" ? scope.materialTier : "unspecified";
  const directSubtotal = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);
  const markupAmount = total - directSubtotal;
  return [
    ...deckHeader(project, revision, issuedAt),
    `Material tier: ${materialTier}`,
    `Selected markup: ${markup} (${markupRates[markup]}%) on pre-tax subtotal`,
    "",
    "Quantity | Unit | Unit amount | Line amount",
    ...calculation.lines.map(line =>
      `${line.label}: ${line.quantity} ${line.unit} | $${(line.unitCostCents / 100).toFixed(2)} / ${line.unit} | $${(line.totalCents / 100).toFixed(2)}`),
    "",
    `Direct subtotal: $${(directSubtotal / 100).toFixed(2)}`,
    `Selected tier markup (${markupRates[markup]}%): $${(markupAmount / 100).toFixed(2)}`,
    `Before-tax total: $${(total / 100).toFixed(2)}`,
    "Tax: Not calculated",
    "",
    "Calculation assumptions",
    ...calculation.assumptions.map(assumption => `- ${assumption}`),
    "Not released to client",
  ];
}

export function deckTakeoffRows(project: Record<string, unknown>, calculation: Calculation, revision: number, issuedAt?: string) {
  return [
    ...deckHeader(project, revision, issuedAt),
    "Ordering quantities only — selected or calculated items; no nominal reference quantities.",
    ...calculation.takeoff.filter(item => item.quantity > 0).map(item =>
      `${item.label}: ${item.quantity} ${item.unit}`),
    "",
    "Calculation assumptions",
    ...calculation.assumptions.map(assumption => `- ${assumption}`),
  ];
}
