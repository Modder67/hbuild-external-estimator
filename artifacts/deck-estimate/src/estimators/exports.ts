import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Calculation } from './types';
import { money, POLICY, totals } from './types';
import type { EstimatorProject } from './project';

function filename(name: string, type: string, extension: string) {
  return `${name.trim().replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'estimate'}-${type}.${extension}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function moduleSpreadsheet<T>(type: string, project: EstimatorProject<T>, calc: Calculation) {
  const book = XLSX.utils.book_new();
  const summary = totals(calc);
  const sheets: Record<string, Record<string, string | number>[]> = {
    Overview: [
      { Field: 'Estimator', Value: type },
      { Field: 'Project', Value: project.projectName },
      { Field: 'Client', Value: `${project.firstName} ${project.lastName}`.trim() },
      { Field: 'Source project ID', Value: project.sourceId },
      { Field: 'Pricing policy', Value: POLICY.version },
      { Field: 'Markup method', Value: 'Additive; percentages on the same direct-cost subtotal' },
      { Field: 'Direct cost (known)', Value: summary.directCents / 100 },
      { Field: 'Company 35%', Value: summary.companyCents / 100 },
      { Field: 'Incidentals 20%', Value: summary.incidentalsCents / 100 },
      { Field: 'Accidents 50%', Value: summary.accidentsCents / 100 },
      { Field: 'Sales 7%', Value: summary.salesCents / 100 },
      { Field: 'Known before-tax amount', Value: summary.beforeTaxCents / 100 },
      { Field: 'Tax', Value: 'Not calculated; jurisdiction not configured' },
      { Field: 'Status', Value: calc.issues.length ? 'INCOMPLETE — known costs only' : 'Before tax — tax unconfigured' },
    ],
    Charges: calc.lines.map(line => ({
      ID: line.id, Section: line.group, Description: line.label, Quantity: line.quantity,
      Unit: line.unit, 'Unit direct cost': line.unitCostCents / 100, 'Total direct cost': line.totalCents / 100,
      Note: line.note ?? '',
    })),
    Takeoff: calc.takeoff.map(item => ({
      ID: item.id, Section: item.group, Description: item.label, Quantity: item.quantity,
      Unit: item.unit, Note: item.note ?? '',
    })),
    Review: [...calc.issues.map(issue => ({ Type: 'Pricing or scope issue', Detail: issue })),
      ...calc.assumptions.map(assumption => ({ Type: 'Assumption', Detail: assumption }))],
    Inputs: [{ JSON: JSON.stringify(project) }],
  };
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: 'No entries' }]), name);
  }
  XLSX.writeFile(book, filename(project.projectName, type.toLowerCase().replace(/\s+/g, '-'), 'xlsx'));
}

export function modulePdf<T>(
  type: string, project: EstimatorProject<T>, calc: Calculation,
  documentType: 'proposal' | 'takeoff', download = true,
) {
  const doc = new jsPDF();
  const title = `${type} ${documentType === 'proposal' ? 'Estimate' : 'Material Takeoff'}`;
  const name = filename(project.projectName, `${type.toLowerCase().replace(/\s+/g, '-')}-${documentType}`, 'pdf');
  doc.setFillColor(22, 22, 22);
  doc.rect(0, 0, 210, 36, 'F');
  doc.setTextColor(233, 204, 121);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('HBUILD', 14, 16);
  doc.setFontSize(11);
  doc.text(title, 14, 26);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.text(`Project: ${project.projectName || 'Untitled'}`, 14, 47);
  doc.text(`Client: ${project.firstName} ${project.lastName}`, 14, 53);
  doc.text(`Prepared: ${new Date().toLocaleDateString()}`, 14, 59);
  const address = [project.addressLine1, project.addressLine2, project.city, project.region, project.postalCode].filter(Boolean).join(', ');
  if (address) doc.text(`Location: ${address}`.slice(0, 100), 14, 65);
  const startY = address ? 71 : 65;
  if (documentType === 'proposal') {
    const summary = totals(calc);
    const allocations = calc.lines.map((line, index) =>
      index === calc.lines.length - 1
        ? summary.beforeTaxCents - calc.lines.slice(0, -1).reduce((sum, item) =>
            sum + (summary.directCents ? Math.round(summary.beforeTaxCents * item.totalCents / summary.directCents) : 0), 0)
        : summary.directCents ? Math.round(summary.beforeTaxCents * line.totalCents / summary.directCents) : 0);
    autoTable(doc, {
      startY, head: [['Scope', 'Description', 'Price before tax']],
      body: calc.lines.map((line, index) => [line.group, line.label, money(allocations[index])]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [38, 38, 38] },
    });
    const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    if (y > 260) doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.text(calc.issues.length ? `Known-cost portion before tax: ${money(summary.beforeTaxCents)}` : `Estimate before tax: ${money(summary.beforeTaxCents)}`,
      14, y > 260 ? 20 : y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Prices allocate the single project-wide additive markup; tax is not included.', 14, y > 260 ? 28 : y + 20);
  } else {
    autoTable(doc, {
      startY, head: [['Area', 'Material / quantity', 'Qty', 'Unit']],
      body: calc.takeoff.map(item => [item.group, item.label, String(item.quantity), item.unit]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [38, 38, 38] },
    });
  }
  if (calc.issues.length || documentType === 'takeoff') {
    doc.addPage();
    doc.setFontSize(13);
    doc.text(documentType === 'proposal' ? 'Preliminary estimate' : 'Purchasing review', 14, 20);
    doc.setFontSize(9);
    // Internal issues/assumptions may contain labor rates or cost-policy details.
    // They belong in the internal workbook, never in a shareable proposal/takeoff.
    const text = documentType === 'proposal'
      ? ['DRAFT — some selected work still requires scope or pricing review.',
        'The displayed amount covers known-cost items only and is not a complete quote.',
        'Final scope, purchasing dimensions and exclusions require estimator confirmation.',
        'Tax has not been calculated; jurisdiction and taxability remain to be confirmed.']
      : ['Quantities are preliminary; verify measurements, waste, product coverage, and purchasing dimensions.',
        'Items awaiting specification or pricing review may not appear in this list.'];
    doc.text(doc.splitTextToSize(text.join('\n'), 180), 14, 31);
  }
  const blob = doc.output('blob');
  if (download) saveBlob(blob, name);
  return { blob, filename: name };
}