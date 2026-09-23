import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EstimateState, PricingBreakdown, formatCurrency } from './pricing';
import { LumberCalcResult } from './lumber';
import { format } from 'date-fns';

const SECTIONS: { key: keyof PricingBreakdown['lumber']; label: string; note?: string }[] = [
  { key: 'ledger', label: 'Ledger Board', note: '+20% overage' },
  { key: 'framing', label: 'New Ledger / Framing', note: '×2 perimeter +20%' },
  { key: 'joist', label: 'Floor Joists', note: '16" OC +20%' },
  { key: 'beam', label: 'Beam Replacement', note: '+20% overage' },
  { key: 'post', label: 'Posts', note: 'exact qty' },
];

export async function generateLumberTakeoffPDF(state: EstimateState, breakdown: PricingBreakdown, options: { download?: boolean } = {}) {
  // Fetch logo
  let logoDataUrl: string | null = null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}hbuild-logo.png`);
    const blob = await res.blob();
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // logo optional
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const gold: [number, number, number] = [233, 204, 121];
  const dark: [number, number, number] = [17, 17, 17];
  const bronze: [number, number, number] = [178, 128, 45];
  const amber: [number, number, number] = [180, 100, 20];

  // === HEADER ===
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 44, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 0, pageWidth, 2, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 13, 8, 16, 16);
  }
  const textX = logoDataUrl ? 33 : 15;

  doc.setTextColor(...gold);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('HBUILD', textX, 17);

  doc.setTextColor(200, 200, 200);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Lumber Takeoff — For Ordering', textX, 25);

  doc.setTextColor(200, 200, 200);
  doc.text('303-356-1262', pageWidth - 15, 14, { align: 'right' });
  doc.text('Colorado', pageWidth - 15, 20, { align: 'right' });

  // "FOR ORDERING USE ONLY" badge
  doc.setFillColor(...amber);
  doc.roundedRect(pageWidth - 15 - 54, 26, 54, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FOR ORDERING USE ONLY', pageWidth - 15 - 27, 32.5, { align: 'center' });

  // === JOB DETAILS BOX ===
  doc.setDrawColor(...bronze);
  doc.setLineWidth(0.4);
  doc.setFillColor(250, 250, 250);
  doc.rect(15, 49, pageWidth - 30, 32, 'FD');

  doc.setTextColor(...dark);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(state.jobDetails.jobTitle || 'Deck Remodel', 20, 58);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Customer: ${state.jobDetails.customerName || 'Not specified'}`, 20, 66);
  doc.text(`Address: ${state.jobDetails.customerAddress || 'Not specified'}`, 20, 72);
  doc.text(`Date: ${format(new Date(state.jobDetails.date || new Date()), 'MMMM d, yyyy')}`, pageWidth - 20, 66, { align: 'right' });
  doc.text(`Sales Rep: ${state.jobDetails.salesperson || 'Not specified'}`, pageWidth - 20, 72, { align: 'right' });

  // === LUMBER TAKEOFF TABLE ===
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...amber);
  doc.text('Lumber Material Takeoff', 15, 92);

  const rows: string[][] = [];
  const { lumber } = breakdown;

  for (const { key, label, note } of SECTIONS) {
    const item = lumber[key] as LumberCalcResult | null;
    if (item && item.qty > 0) {
      const qtyStr = item.option.unit === 'LFT'
        ? `${item.qty} LFT`
        : `${item.qty} pcs`;
      rows.push([
        label,
        item.option.label,
        item.option.size,
        qtyStr,
        note ?? '',
        formatCurrency(item.cost),
      ]);
    }
  }

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120, 120, 120);
    doc.text('No lumber selections recorded.', 15, 100);
  } else {
    autoTable(doc, {
      startY: 96,
      head: [['Section', 'Lumber Selected', 'Size', 'QTY', 'Note', 'Cost']],
      body: rows,
      theme: 'grid',
      headStyles: {
        fillColor: [100, 55, 10] as [number, number, number],
        textColor: [255, 220, 100] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: { textColor: dark, fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 22, halign: 'center', textColor: [120, 100, 60] as [number, number, number], fontSize: 8 },
        5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [255, 248, 230] },
      foot: [['', '', '', '', 'Total Lumber Cost', formatCurrency(lumber.totalCost)]],
      footStyles: {
        fillColor: [240, 225, 185] as [number, number, number],
        textColor: [80, 50, 0] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 11,
      },
      margin: { left: 15, right: 15 },
    });
  }

  const tableEndY = rows.length > 0 ? (doc as any).lastAutoTable.finalY + 12 : 110;

  // === ORDERING CHECKLIST ===
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('Ordering Checklist', 15, tableEndY);

  const checkRows = rows.map(r => [`☐  ${r[0]}`, r[1], r[3], r[5]]);
  if (checkRows.length > 0) {
    autoTable(doc, {
      startY: tableEndY + 4,
      head: [['Item', 'Lumber', 'Qty to Order', 'Est. Cost']],
      body: checkRows,
      theme: 'striped',
      headStyles: {
        fillColor: dark,
        textColor: gold,
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: { textColor: dark, fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
      },
      margin: { left: 15, right: 15 },
    });
  }

  // === FOOTER ===
  const pageH = doc.internal.pageSize.getHeight();
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a contractor ordering document. Quantities include overage where noted.', pageWidth / 2, pageH - 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text('HBUILD | 303-356-1262 | Colorado', pageWidth / 2, pageH - 8, { align: 'center' });

  const filename = `LumberTakeoff_${state.jobDetails.customerName?.replace(/\s+/g, '_') || 'Job'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const blob = doc.output('blob');
  if (options.download !== false) doc.save(filename);
  return { filename, blob };
}
