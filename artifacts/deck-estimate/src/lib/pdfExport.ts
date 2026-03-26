import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EstimateState, PricingBreakdown, formatCurrency } from './pricing';
import { format } from 'date-fns';

export function generateEstimatePDF(state: EstimateState, breakdown: PricingBreakdown) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Colors matching the brand
  const goldColor: [number, number, number] = [233, 204, 121]; // #e9cc79
  const bronzeColor: [number, number, number] = [178, 128, 45]; // #b2802d
  const darkColor: [number, number, number] = [17, 17, 17]; // #111111
  
  // === HEADER ===
  doc.setFillColor(...darkColor);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(...goldColor);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Deck Remodel Pros', 15, 20);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Colorado\'s Premier Deck Specialists', 15, 28);
  
  // Company Info (Right aligned)
  doc.setFontSize(10);
  doc.text('(720) 555-0100', pageWidth - 15, 16, { align: 'right' });
  doc.text('www.deckremodelpros.com', pageWidth - 15, 22, { align: 'right' });
  doc.text('Highlands Ranch / Littleton / Parker, CO', pageWidth - 15, 28, { align: 'right' });

  // === CUSTOMER DETAILS BOX ===
  doc.setDrawColor(...bronzeColor);
  doc.setLineWidth(0.5);
  doc.setFillColor(250, 250, 250);
  doc.rect(15, 45, pageWidth - 30, 40, 'FD');
  
  doc.setTextColor(...darkColor);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(state.jobDetails.jobTitle || 'Deck Remodel Estimate', 20, 55);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Customer: ${state.jobDetails.customerName || 'Not specified'}`, 20, 65);
  doc.text(`Address: ${state.jobDetails.customerAddress || 'Not specified'}`, 20, 72);
  
  doc.text(`Date: ${format(new Date(state.jobDetails.date || new Date()), 'MMMM d, yyyy')}`, pageWidth - 20, 65, { align: 'right' });
  doc.text(`Sales Representative: ${state.jobDetails.salesperson || 'Not specified'}`, pageWidth - 20, 72, { align: 'right' });

  // === STAIR POSTS (if any) ===
  const totalStairPosts = state.stairPosts.left + state.stairPosts.middle + state.stairPosts.right + state.stairPosts.center;
  if (totalStairPosts > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Stair Posts — Left: ${state.stairPosts.left}  Middle: ${state.stairPosts.middle}  Right: ${state.stairPosts.right}  Center: ${state.stairPosts.center}  (Total: ${totalStairPosts})`,
      pageWidth / 2, 83, { align: 'center' }
    );
  }

  // === MATERIALS REQUIRED TABLE ===
  const { lumberCounts, totalLedgerLf, totalLf, totalDeckSqFt } = breakdown;
  const materialsData = [];
  if (lumberCounts.ledger2x10x20 > 0) {
    materialsData.push([
      'Ledger Board',
      '2×10×20',
      `${totalLedgerLf} LF total`,
      `${lumberCounts.ledger2x10x20} pcs`
    ]);
  }
  if (lumberCounts.framing2x12x16 > 0) {
    materialsData.push([
      'Framing / Perimeter',
      '2×12×16',
      `${totalLf} LF total`,
      `${lumberCounts.framing2x12x16} pcs`
    ]);
  }
  if (lumberCounts.deck075x55x20 > 0) {
    materialsData.push([
      'Deck Surface',
      '0.75×5.5×20',
      `${totalDeckSqFt} sq ft total`,
      `${lumberCounts.deck075x55x20} pcs`
    ]);
  }

  if (materialsData.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('🪵  Materials Required', 15, 90);

    autoTable(doc, {
      startY: 94,
      head: [['Component', 'Lumber Size', 'Measurement', 'Qty to Order']],
      body: materialsData,
      theme: 'grid',
      headStyles: {
        fillColor: bronzeColor,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        textColor: darkColor,
        fontSize: 10
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 35, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 45, halign: 'right' },
        3: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [250, 246, 236] },
      margin: { left: 15, right: 15 }
    });
  }

  const materialsEndY = materialsData.length > 0 ? (doc as any).lastAutoTable.finalY + 8 : 90;

  // === CONTRACTOR-ONLY LUMBER COST TABLE ===
  const { lumber } = breakdown;
  const lumberRows: string[][] = [];
  if (lumber.ledger && lumber.ledger.qty > 0) {
    lumberRows.push([
      'Ledger Board',
      lumber.ledger.option.label,
      `${lumber.ledger.qty} ${lumber.ledger.option.unit === 'LFT' ? 'LFT' : 'pcs'}`,
      formatCurrency(lumber.ledger.cost)
    ]);
  }
  if (lumber.framing && lumber.framing.qty > 0) {
    lumberRows.push([
      'New Ledger (Framing)',
      lumber.framing.option.label,
      `${lumber.framing.qty} ${lumber.framing.option.unit === 'LFT' ? 'LFT' : 'pcs'}`,
      formatCurrency(lumber.framing.cost)
    ]);
  }
  if (lumber.joist && lumber.joist.qty > 0) {
    lumberRows.push([
      'Floor Joists',
      lumber.joist.option.label,
      `${lumber.joist.qty} ${lumber.joist.option.unit === 'LFT' ? 'LFT' : 'pcs'}`,
      formatCurrency(lumber.joist.cost)
    ]);
  }

  let lumberEndY = materialsEndY;
  if (lumberRows.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...([180, 100, 20] as [number, number, number]));
    doc.text('[CONTRACTOR ONLY]  Lumber Cost Summary', 15, materialsEndY + 2);

    autoTable(doc, {
      startY: materialsEndY + 6,
      head: [['Section', 'Lumber Selected', 'QTY (+20%)', 'Material Cost']],
      body: lumberRows,
      foot: [['', '', 'Total Lumber Cost', formatCurrency(lumber.totalCost)]],
      theme: 'grid',
      headStyles: {
        fillColor: [120, 60, 10] as [number, number, number],
        textColor: [255, 220, 100] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: { textColor: darkColor, fontSize: 10 },
      footStyles: {
        fillColor: [250, 240, 210] as [number, number, number],
        textColor: [100, 50, 0] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 11
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [255, 248, 230] },
      margin: { left: 15, right: 15 }
    });

    lumberEndY = (doc as any).lastAutoTable.finalY + 8;
  }

  // === ITEMIZED BREAKDOWN TABLE ===
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text('💰  Cost Breakdown', 15, lumberEndY + 2);

  const tableData = breakdown.lineItems.map(item => [
    item.name,
    item.qty.toString(),
    formatCurrency(item.unitPrice),
    formatCurrency(item.total)
  ]);

  autoTable(doc, {
    startY: lumberEndY + 6,
    head: [['Description', 'Quantity', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: darkColor,
      textColor: goldColor,
      fontStyle: 'bold',
      fontSize: 11
    },
    bodyStyles: {
      textColor: darkColor,
      fontSize: 10
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    margin: { left: 15, right: 15 }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // === TOTALS ===
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', pageWidth - 60, finalY);
  doc.text(formatCurrency(breakdown.subtotal), pageWidth - 15, finalY, { align: 'right' });
  
  doc.text('Tax (8.5%):', pageWidth - 60, finalY + 8);
  doc.text(formatCurrency(breakdown.tax), pageWidth - 15, finalY + 8, { align: 'right' });
  
  // Selected Grand Total
  const selectedTotal = breakdown.totals[state.selectedMarkup];
  
  doc.setFillColor(...darkColor);
  doc.rect(pageWidth - 80, finalY + 15, 65, 12, 'F');
  
  doc.setTextColor(...goldColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL:', pageWidth - 75, finalY + 23);
  doc.text(formatCurrency(selectedTotal), pageWidth - 20, finalY + 23, { align: 'right' });

  // === FOOTER ===
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text('This estimate is valid for 30 days from the date above.', 15, finalY + 45);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...darkColor);
  doc.text('Thank you – Let\'s build your dream deck! | Deck Remodel Pros', pageWidth / 2, 280, { align: 'center' });

  // Save the PDF
  const filename = `Estimate_${state.jobDetails.customerName?.replace(/\s+/g, '_') || 'Deck'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(filename);
}
