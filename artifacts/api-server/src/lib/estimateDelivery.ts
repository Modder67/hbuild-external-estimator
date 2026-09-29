import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import type { Calculation } from "@workspace/estimator-core";

const sidecar = "http://127.0.0.1:1106";
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

function privateLocation(relativePath: string) {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  const clean = dir.replace(/^\/+|\/+$/g, "");
  const [bucketName, ...prefix] = clean.split("/");
  if (!bucketName || !prefix.length) throw new Error("PRIVATE_OBJECT_DIR is invalid.");
  return { bucket: storage.bucket(bucketName), path: [...prefix, relativePath].join("/") };
}

export async function savePrivatePdf(path: string, bytes: Buffer): Promise<void> {
  const target = privateLocation(path);
  await target.bucket.file(target.path).save(bytes, {
    resumable: false,
    validation: "crc32c",
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
  });
}

export async function readPrivatePdf(path: string): Promise<Buffer> {
  const target = privateLocation(path);
  const [bytes] = await target.bucket.file(target.path).download();
  return bytes;
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