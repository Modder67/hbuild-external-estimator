import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EstimateState, PricingBreakdown, formatCurrency } from './pricing';
import { format } from 'date-fns';

// ─── Brand colours ───────────────────────────────────────────────────────────
const GOLD:   [number, number, number] = [233, 204, 121];
const BRONZE: [number, number, number] = [178, 128, 45];
const DARK:   [number, number, number] = [17,  17,  17];
const AMBER:  [number, number, number] = [180, 100, 20];
const LIGHT:  [number, number, number] = [250, 248, 240];
const MID:    [number, number, number] = [200, 200, 200];
const GRAY:   [number, number, number] = [100, 100, 100];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sectionTitle(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  color: [number, number, number] = DARK,
) {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(text, x, y);
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function generateEstimatePDF(
  state: EstimateState,
  breakdown: PricingBreakdown,
  options: { download?: boolean } = {},
) {
  // Fetch logo
  let logoDataUrl: string | null = null;
  try {
    const res  = await fetch(`${import.meta.env.BASE_URL}hbuild-logo.png`);
    const blob = await res.blob();
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { /* logo is optional */ }

  const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW     = doc.internal.pageSize.getWidth();   // 210
  const pageH     = doc.internal.pageSize.getHeight();  // 297
  const marginL   = 15;
  const marginR   = 15;
  const contentW  = pageW - marginL - marginR;

  // ── HEADER BAND ──────────────────────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 42, 'F');

  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageW, 2, 'F');                        // gold top stripe

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginL, 9, 16, 16);
  }

  const nameX = logoDataUrl ? marginL + 20 : marginL;

  doc.setTextColor(...GOLD);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('HBUILD', nameX, 20);

  doc.setTextColor(...MID);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Deck & Remodel Specialists', nameX, 27);

  doc.setTextColor(...MID);
  doc.setFontSize(9);
  doc.text('303-356-1262', pageW - marginR, 15, { align: 'right' });
  doc.text('Colorado', pageW - marginR, 22, { align: 'right' });

  // "ESTIMATE" label top-right
  doc.setFillColor(...GOLD);
  doc.roundedRect(pageW - marginR - 34, 28, 34, 9, 1.5, 1.5, 'F');
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATE', pageW - marginR - 17, 34, { align: 'center' });

  // ── JOB DETAILS BOX ──────────────────────────────────────────────────────
  const boxY = 47;
  const boxH = 36;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(...BRONZE);
  doc.setLineWidth(0.4);
  doc.rect(marginL, boxY, contentW, boxH, 'FD');

  // Job title
  doc.setTextColor(...DARK);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const jobTitle = state.jobDetails.jobTitle || 'Deck Remodel Estimate';
  doc.text(jobTitle, marginL + 5, boxY + 10);

  // Customer info — left column
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`Customer:  ${state.jobDetails.customerName || 'Not specified'}`, marginL + 5, boxY + 20);
  doc.text(`Address:    ${state.jobDetails.customerAddress || 'Not specified'}`, marginL + 5, boxY + 28);

  // Date / salesperson — right column
  doc.text(
    `Date: ${format(new Date(state.jobDetails.date || new Date()), 'MMM d, yyyy')}`,
    pageW - marginR - 5, boxY + 20, { align: 'right' },
  );
  doc.text(
    `Rep: ${state.jobDetails.salesperson || 'Not specified'}`,
    pageW - marginR - 5, boxY + 28, { align: 'right' },
  );

  let cursor = boxY + boxH + 10;

  // ── STAIR POSTS (optional note) ───────────────────────────────────────────
  const totalStairPosts =
    state.stairPosts.left + state.stairPosts.middle +
    state.stairPosts.right + state.stairPosts.center;
  if (totalStairPosts > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRAY);
    doc.text(
      `Stair Posts — Left: ${state.stairPosts.left}  Middle: ${state.stairPosts.middle}  ` +
      `Right: ${state.stairPosts.right}  Center: ${state.stairPosts.center}  (Total: ${totalStairPosts})`,
      pageW / 2, cursor, { align: 'center' },
    );
    cursor += 8;
  }

  // ── MATERIALS REQUIRED TABLE ──────────────────────────────────────────────
  const { lumberCounts, totalLedgerLf, totalLf, totalDeckSqFt } = breakdown;
  const materialsData: string[][] = [];

  if (lumberCounts.ledger2x10x20 > 0)
    materialsData.push(['Ledger Board',        '2x10x20',    `${totalLedgerLf} LF`, `${lumberCounts.ledger2x10x20} pcs`]);
  if (lumberCounts.framing2x12x16 > 0)
    materialsData.push(['Framing / Perimeter', '2x12x16',    `${totalLf} LF`,       `${lumberCounts.framing2x12x16} pcs`]);
  if (lumberCounts.deck075x55x20 > 0)
    materialsData.push(['Deck Surface',        '0.75x5.5x20',`${totalDeckSqFt} sqft`,`${lumberCounts.deck075x55x20} pcs`]);

  if (materialsData.length > 0) {
    sectionTitle(doc, 'Materials Required', marginL, cursor);
    cursor += 5;

    autoTable(doc, {
      startY: cursor,
      head: [['Component', 'Lumber Size', 'Measurement', 'Qty to Order']],
      body: materialsData,
      theme: 'grid',
      headStyles:        { fillColor: BRONZE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
      bodyStyles:        { textColor: DARK, fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 38, halign: 'right' },
        3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: marginL, right: marginR },
    });

    cursor = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── CONTRACTOR LUMBER COST TABLE ──────────────────────────────────────────
  const { lumber } = breakdown;
  const lumberRows: string[][] = [];

  const lRow = (label: string, item: { qty: number; cost: number; option: { label: string; unit: string } }) =>
    lumberRows.push([
      label,
      item.option.label,
      `${item.qty} ${item.option.unit === 'LFT' ? 'LFT' : 'pcs'}`,
      formatCurrency(item.cost),
    ]);

  if (lumber.ledger  && lumber.ledger.qty  > 0) lRow('Ledger Board',        lumber.ledger);
  if (lumber.framing && lumber.framing.qty > 0) lRow('Framing / Rim Board', lumber.framing);
  if (lumber.joist   && lumber.joist.qty   > 0) lRow('Floor Joists',        lumber.joist);
  if (lumber.beam    && lumber.beam.qty    > 0) lRow('Beam Replacement',     lumber.beam);
  if (lumber.post    && lumber.post.qty    > 0) lRow('Posts',                lumber.post);

  if (lumberRows.length > 0) {
    sectionTitle(doc, 'CONTRACTOR ONLY — Lumber Cost Summary', marginL, cursor, AMBER);
    cursor += 5;

    autoTable(doc, {
      startY: cursor,
      head: [['Section', 'Lumber Selected', 'QTY (+20%)', 'Material Cost']],
      body: lumberRows,
      foot: [['', '', 'Total Lumber Cost', formatCurrency(lumber.totalCost)]],
      theme: 'grid',
      headStyles:  { fillColor: [120, 60, 10],    textColor: [255, 220, 100], fontStyle: 'bold', fontSize: 10 },
      bodyStyles:  { textColor: DARK, fontSize: 10 },
      footStyles:  { fillColor: [245, 232, 200],  textColor: [80, 50, 0],    fontStyle: 'bold', fontSize: 11 },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 32, halign: 'right',  fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [255, 248, 230] },
      margin: { left: marginL, right: marginR },
    });

    cursor = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── COST BREAKDOWN TABLE ──────────────────────────────────────────────────
  sectionTitle(doc, 'Cost Breakdown', marginL, cursor);
  cursor += 5;

  const tableData = breakdown.lineItems.map(item => [
    item.name,
    item.qty.toString(),
    formatCurrency(item.unitPrice),
    formatCurrency(item.total),
  ]);

  autoTable(doc, {
    startY: cursor,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles:  { fillColor: DARK, textColor: GOLD, fontStyle: 'bold', fontSize: 10 },
    bodyStyles:  { textColor: DARK, fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: marginL, right: marginR },
  });

  cursor = (doc as any).lastAutoTable.finalY + 8;

  // ── TOTALS BLOCK ──────────────────────────────────────────────────────────
  // Ensure totals block fits on current page; add new page if needed
  const totalsH = 44;
  if (cursor + totalsH > pageH - 20) {
    doc.addPage();
    cursor = 20;
  }

  const totX  = pageW - marginR - 90;
  const totW  = 90;

  // Subtotal row
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Subtotal:', totX + 2, cursor + 6);
  doc.text(formatCurrency(breakdown.subtotal), pageW - marginR, cursor + 6, { align: 'right' });

  // Tax row
  doc.text('CO Sales Tax (8.5%):', totX + 2, cursor + 13);
  doc.text(formatCurrency(breakdown.tax), pageW - marginR, cursor + 13, { align: 'right' });

  // Separator line
  doc.setDrawColor(...BRONZE);
  doc.setLineWidth(0.3);
  doc.line(totX, cursor + 16, pageW - marginR, cursor + 16);

  // Grand total band
  doc.setFillColor(...DARK);
  doc.rect(totX, cursor + 18, totW, 14, 'F');

  doc.setTextColor(...GOLD);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL', totX + 3, cursor + 27);
  doc.text(
    formatCurrency(breakdown.totals[state.selectedMarkup]),
    pageW - marginR - 2, cursor + 27, { align: 'right' },
  );

  // Markup tier label
  const tierLabel =
    state.selectedMarkup === 'good'   ? 'Good Pricing (52% markup)'   :
    state.selectedMarkup === 'better' ? 'Better Pricing (42% markup)' :
                                        'Best Value (37% markup)';
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID);
  doc.text(tierLabel, pageW - marginR, cursor + 34, { align: 'right' });

  cursor += totalsH;

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const footerY = pageH - 14;

  doc.setFillColor(...DARK);
  doc.rect(0, footerY - 5, pageW, 19, 'F');

  doc.setFillColor(...GOLD);
  doc.rect(0, footerY - 5, pageW, 0.8, 'F');

  doc.setTextColor(...GRAY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('This estimate is valid for 30 days from the date shown above.', pageW / 2, footerY + 1, { align: 'center' });

  doc.setTextColor(...MID);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('HBUILD  |  303-356-1262  |  Colorado', pageW / 2, footerY + 7, { align: 'center' });

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const filename =
    `Estimate_${(state.jobDetails.customerName || 'Deck').replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const blob = doc.output('blob');
  if (options.download !== false) doc.save(filename);
  return { filename, blob };
}
