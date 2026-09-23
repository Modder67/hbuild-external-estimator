import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import {
  EstimateState,
  PricingBreakdown,
  BASE_RATES,
  RAILING_RATE,
  MARKUP_RATES,
  TIER_MULTIPLIERS,
  formatCurrency,
} from './pricing';
import { LUMBER_BY_ID } from './lumber';

// ─── colour helpers (XLSX uses ARGB hex, no #) ──────────────────────────────
const BG_DARK    = 'FF111111';
const BG_GOLD    = 'FFE9CC79';
const BG_AMBER   = 'FFAC6310';
const BG_LIGHT   = 'FFFFF8E6';
const BG_HEADER  = 'FF1E1E1E';
const BG_SUBHEAD = 'FF2A2A2A';
const BG_WHITE   = 'FFFFFFFF';

const FG_GOLD    = 'FFE9CC79';
const FG_WHITE   = 'FFFFFFFF';
const FG_DARK    = 'FF111111';
const FG_AMBER   = 'FFAC6310';
const FG_GRAY    = 'FF888888';

function cellStyle(
  bgArgb: string,
  fgArgb: string,
  bold = false,
  size = 11,
  halign: 'left' | 'center' | 'right' = 'left',
  numFmt = '',
  italic = false,
  wrapText = false,
): { font?: Record<string, unknown>; [key: string]: unknown } {
  return {
    fill: { fgColor: { rgb: bgArgb }, patternType: 'solid' },
    font: { color: { rgb: fgArgb }, bold, italic, sz: size, name: 'Calibri' },
    alignment: { horizontal: halign, vertical: 'center', wrapText },
    border: {
      top:    { style: 'thin', color: { rgb: 'FF333333' } },
      bottom: { style: 'thin', color: { rgb: 'FF333333' } },
      left:   { style: 'thin', color: { rgb: 'FF333333' } },
      right:  { style: 'thin', color: { rgb: 'FF333333' } },
    },
    numFmt,
  };
}

function setCell(
  ws: XLSX.WorkSheet,
  addr: string,
  value: string | number | null,
  style: Record<string, unknown>,
  type: 'n' | 's' | 'f' = value !== null && typeof value === 'number' ? 'n' : 's',
) {
  ws[addr] = { v: value ?? '', t: type, s: style };
}

function colWidths(widths: number[]): { wch: number }[] {
  return widths.map(w => ({ wch: w }));
}

// ─── SHEET 1: Estimate ──────────────────────────────────────────────────────
function buildEstimateSheet(state: EstimateState, pricing: PricingBreakdown): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const ref: string[] = [];
  let row = 1;

  const set = (col: string, val: string | number | null, style: Record<string, unknown>) => {
    setCell(ws, `${col}${row}`, val, style);
  };

  // ── TITLE ROW ────────────────────────────────────────────────────────────
  ws['!merges'] = ws['!merges'] ?? [];

  const titleStyle = cellStyle(BG_DARK, FG_GOLD, true, 16, 'left');
  const subStyle   = cellStyle(BG_DARK, FG_GRAY, false, 10, 'left', '', true);
  ws[`A${row}`] = { v: 'HBUILD', t: 's', s: titleStyle };
  ws[`B${row}`] = { v: '', t: 's', s: cellStyle(BG_DARK, FG_GOLD) };
  ws[`C${row}`] = { v: '', t: 's', s: cellStyle(BG_DARK, FG_GOLD) };
  ws[`D${row}`] = { v: '', t: 's', s: cellStyle(BG_DARK, FG_GOLD) };
  ws[`E${row}`] = { v: 'Instant Estimate Builder', t: 's', s: cellStyle(BG_DARK, FG_GRAY, false, 11, 'right', '', true) };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 3 } });
  row++;

  const infoStyle = cellStyle(BG_DARK, FG_GRAY, false, 10);
  ws[`A${row}`] = { v: '303-356-1262  |  Colorado  |  hbuild.co', t: 's', s: infoStyle };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 4 } });
  row += 2;

  // ── JOB DETAILS ──────────────────────────────────────────────────────────
  const sectionHd = cellStyle(BG_HEADER, FG_GOLD, true, 12, 'left');
  ws[`A${row}`] = { v: 'JOB DETAILS', t: 's', s: sectionHd };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 4 } });
  row++;

  const labelStyle = cellStyle(BG_SUBHEAD, FG_GRAY, false, 10);
  const valStyle   = cellStyle(BG_WHITE,   FG_DARK, false, 11);

  const jobRows: [string, string][] = [
    ['Customer',   state.jobDetails.customerName    || ''],
    ['Address',    state.jobDetails.customerAddress || ''],
    ['Job Title',  state.jobDetails.jobTitle        || ''],
    ['Salesperson',state.jobDetails.salesperson     || ''],
    ['Date',       format(new Date(state.jobDetails.date || new Date()), 'MMMM d, yyyy')],
  ];
  for (const [label, val] of jobRows) {
    ws[`A${row}`] = { v: label, t: 's', s: labelStyle };
    ws[`B${row}`] = { v: val,   t: 's', s: valStyle };
    ws['!merges'].push({ s: { r: row - 1, c: 1 }, e: { r: row - 1, c: 4 } });
    row++;
  }
  row++;

  // ── LINE ITEMS ────────────────────────────────────────────────────────────
  ws[`A${row}`] = { v: 'LINE ITEMS', t: 's', s: sectionHd };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 4 } });
  row++;

  const colHd = cellStyle(BG_HEADER, FG_GOLD, true, 10, 'center');
  ws[`A${row}`] = { v: 'Description',  t: 's', s: colHd };
  ws[`B${row}`] = { v: 'Qty',          t: 's', s: { ...colHd, alignment: { horizontal: 'center' } } };
  ws[`C${row}`] = { v: 'Unit Price',   t: 's', s: { ...colHd, alignment: { horizontal: 'right' } } };
  ws[`D${row}`] = { v: 'Total',        t: 's', s: { ...colHd, alignment: { horizontal: 'right' } } };
  ws[`E${row}`] = { v: 'Type',         t: 's', s: { ...colHd, alignment: { horizontal: 'center' } } };
  row++;

  const money = '"$"#,##0.00';
  const evenRow = cellStyle(BG_WHITE,   FG_DARK, false, 10, 'left');
  const oddRow  = cellStyle(BG_LIGHT,   FG_DARK, false, 10, 'left');
  const moneyE  = (bg: string) => cellStyle(bg, FG_DARK, false, 10, 'right', money);
  const qtyE    = (bg: string) => cellStyle(bg, FG_DARK, false, 10, 'center');

  for (let i = 0; i < pricing.lineItems.length; i++) {
    const item = pricing.lineItems[i];
    const bg   = i % 2 === 0 ? BG_WHITE : BG_LIGHT;
    const row0 = cellStyle(bg, FG_DARK, false, 10);
    ws[`A${row}`] = { v: item.name,      t: 's', s: row0 };
    ws[`B${row}`] = { v: item.qty,       t: 'n', s: qtyE(bg) };
    ws[`C${row}`] = { v: item.unitPrice, t: 'n', s: moneyE(bg) };
    ws[`D${row}`] = { v: item.total,     t: 'n', s: moneyE(bg) };
    ws[`E${row}`] = { v: item.type,      t: 's', s: cellStyle(bg, FG_GRAY, false, 9, 'center') };
    row++;
  }

  // ── SUBTOTAL / TAX / TOTALS ───────────────────────────────────────────────
  row++;
  const totHd  = cellStyle(BG_SUBHEAD, FG_GRAY,  false, 10, 'right');
  const totVal = cellStyle(BG_SUBHEAD, FG_WHITE,  true,  11, 'right', money);
  const totGold= cellStyle(BG_DARK,    FG_GOLD,   true,  12, 'right', money);

  const totals: [string, number][] = [
    ['Subtotal (before tax)',     pricing.subtotal],
    ['CO Sales Tax (8.5%)',       pricing.tax],
    ['Cost Total (+ tax)',        pricing.subtotal + pricing.tax],
    ['Good Pricing (52% markup)', pricing.totals.good],
    ['Better Pricing (42% markup)', pricing.totals.better],
    ['Best Value (37% markup)',   pricing.totals.best],
  ];

  for (const [label, val] of totals) {
    const isTotal = label.includes('markup');
    const lblS = isTotal ? cellStyle(BG_DARK, FG_GRAY, false, 10, 'right') : totHd;
    const valS = isTotal ? totGold : totVal;
    ws[`D${row}`] = { v: label, t: 's', s: lblS };
    ws[`E${row}`] = { v: val,   t: 'n', s: valS };
    row++;
  }
  row++;

  // ── MEASUREMENTS SUMMARY ──────────────────────────────────────────────────
  ws[`A${row}`] = { v: 'MEASUREMENTS SUMMARY', t: 's', s: sectionHd };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 4 } });
  row++;

  const measRows: [string, string | number][] = [
    ['Deck Area (sq ft)',        pricing.totalDeckSqFt],
    ['Deck Boards (count)',       pricing.totalDeckBoards],
    ['Ledger Board (LF)',         pricing.totalLedgerLf],
    ['Framing / Perimeter (LF)', pricing.totalLf],
    ['Railing (LF)',              pricing.totalRailingLf],
  ];
  for (const [label, val] of measRows) {
    ws[`A${row}`] = { v: label, t: 's', s: labelStyle };
    ws[`B${row}`] = { v: val,   t: typeof val === 'number' ? 'n' : 's', s: valStyle };
    row++;
  }

  // ── COLUMN WIDTHS & REF ───────────────────────────────────────────────────
  ws['!cols'] = colWidths([42, 10, 14, 30, 14]);
  ws['!ref'] = `A1:E${row}`;

  return ws;
}

// ─── SHEET 2: Lumber Takeoff ─────────────────────────────────────────────────
function buildLumberSheet(state: EstimateState, pricing: PricingBreakdown): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  ws['!merges'] = [];
  let row = 1;

  const titleS  = cellStyle(BG_DARK,   FG_GOLD,  true, 14, 'left');
  const badgeS  = cellStyle(BG_AMBER,  FG_WHITE, true, 10, 'center');
  const sectionS= cellStyle(BG_HEADER, FG_AMBER, true, 11, 'left');
  const hdrS    = cellStyle(BG_HEADER, FG_GOLD,  true, 10, 'center');
  const money   = '"$"#,##0.00';

  ws[`A${row}`] = { v: 'HBUILD – Lumber Takeoff', t: 's', s: titleS };
  ws[`E${row}`] = { v: 'FOR ORDERING USE ONLY',  t: 's', s: badgeS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 3 } });
  row += 2;

  ws[`A${row}`] = { v: 'LUMBER MATERIAL TAKEOFF', t: 's', s: sectionS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 5 } });
  row++;

  const cols = ['Section', 'Lumber Selected', 'Size', 'Qty', 'Note', 'Est. Cost'];
  'ABCDEF'.split('').forEach((c, i) => {
    ws[`${c}${row}`] = { v: cols[i], t: 's', s: hdrS };
  });
  row++;

  const sections: { key: keyof typeof pricing.lumber; label: string; note: string }[] = [
    { key: 'ledger',  label: 'Ledger Board',          note: '+20% overage' },
    { key: 'framing', label: 'Framing / Rim Board',   note: '×2 perimeter +20%' },
    { key: 'joist',   label: 'Floor Joists',          note: 'framing ÷ 16" OC +20%' },
    { key: 'beam',    label: 'Beam Replacement',      note: '+20% overage' },
    { key: 'post',    label: 'Posts',                 note: 'exact qty' },
  ];

  let totalCost = 0;
  let i = 0;
  for (const { key, label, note } of sections) {
    const item = pricing.lumber[key] as { qty: number; cost: number; option: { label: string; size: string; unit: string } } | null;
    if (!item || item.qty <= 0) continue;
    const bg = i % 2 === 0 ? BG_WHITE : BG_LIGHT;
    const row0 = cellStyle(bg, FG_DARK, false, 10);
    const qty = item.option.unit === 'LFT' ? `${item.qty} LFT` : `${item.qty} pcs`;
    ws[`A${row}`] = { v: label,           t: 's', s: { ...row0, font: { ...row0.font, bold: true } } };
    ws[`B${row}`] = { v: item.option.label, t: 's', s: row0 };
    ws[`C${row}`] = { v: item.option.size,  t: 's', s: cellStyle(bg, FG_DARK, false, 10, 'center') };
    ws[`D${row}`] = { v: qty,             t: 's', s: cellStyle(bg, FG_DARK, true,  10, 'center') };
    ws[`E${row}`] = { v: note,            t: 's', s: cellStyle(bg, FG_GRAY, false, 9,  'center', '', true) };
    ws[`F${row}`] = { v: item.cost,       t: 'n', s: cellStyle(bg, FG_DARK, true,  10, 'right', money) };
    totalCost += item.cost;
    i++; row++;
  }

  // Footer total
  const footS = cellStyle(BG_AMBER, FG_WHITE, true, 11, 'right', money);
  ws[`E${row}`] = { v: 'Total Lumber Cost', t: 's', s: cellStyle(BG_AMBER, FG_WHITE, true, 11, 'right') };
  ws[`F${row}`] = { v: totalCost, t: 'n', s: footS };
  row += 2;

  // Ordering checklist
  ws[`A${row}`] = { v: 'ORDERING CHECKLIST', t: 's', s: sectionS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 5 } });
  row++;

  const chkHdr = cellStyle(BG_DARK, FG_GOLD, true, 10, 'center');
  ['☐ Item', 'Lumber', 'Qty to Order', 'Est. Cost'].forEach((h, ci) => {
    ws[`${'ABCD'[ci]}${row}`] = { v: h, t: 's', s: chkHdr };
  });
  row++;

  let j = 0;
  for (const { key, label } of sections) {
    const item = pricing.lumber[key] as { qty: number; cost: number; option: { label: string; unit: string } } | null;
    if (!item || item.qty <= 0) continue;
    const bg = j % 2 === 0 ? BG_WHITE : BG_LIGHT;
    const qty = item.option.unit === 'LFT' ? `${item.qty} LFT` : `${item.qty} pcs`;
    ws[`A${row}`] = { v: `☐  ${label}`, t: 's', s: cellStyle(bg, FG_DARK, false, 10) };
    ws[`B${row}`] = { v: item.option.label, t: 's', s: cellStyle(bg, FG_DARK, false, 10) };
    ws[`C${row}`] = { v: qty,              t: 's', s: cellStyle(bg, FG_DARK, true,  10, 'center') };
    ws[`D${row}`] = { v: item.cost,        t: 'n', s: cellStyle(bg, FG_DARK, false, 10, 'right', money) };
    j++; row++;
  }

  ws['!cols'] = colWidths([28, 26, 20, 14, 22, 14]);
  ws['!ref'] = `A1:F${row}`;
  return ws;
}

// ─── SHEET 3: Pricing Config ─────────────────────────────────────────────────
function buildConfigSheet(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  ws['!merges'] = [];
  let row = 1;

  const titleS  = cellStyle(BG_DARK, FG_GOLD, true, 14);
  const noteS   = cellStyle(BG_DARK, FG_GRAY, false, 9, 'left', '', true);
  const sectionS= cellStyle(BG_HEADER, FG_GOLD, true, 11);
  const hdrS    = cellStyle(BG_SUBHEAD, FG_GOLD, true, 10);
  const labelS  = cellStyle(BG_WHITE, FG_DARK, false, 10);
  const moneyS  = cellStyle(BG_LIGHT, FG_DARK, true, 11, 'right', '"$"#,##0.00');
  const pctS    = cellStyle(BG_LIGHT, FG_DARK, true, 11, 'right', '0.0%');

  ws[`A${row}`] = { v: 'HBUILD – Pricing Configuration', t: 's', s: titleS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;
  ws[`A${row}`] = { v: 'Edit the yellow cells below, then re-upload this file to update the app\'s rates.', t: 's', s: noteS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row += 2;

  // BASE RATES
  ws[`A${row}`] = { v: 'BASE RATES', t: 's', s: sectionS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;
  ws[`A${row}`] = { v: 'Item', t: 's', s: hdrS };
  ws[`B${row}`] = { v: 'Rate',  t: 's', s: { ...hdrS, alignment: { horizontal: 'right' } } };
  ws[`C${row}`] = { v: 'Unit',  t: 's', s: { ...hdrS, alignment: { horizontal: 'left' } } };
  row++;

  const baseRateRows: [string, number, string][] = [
    ['Ledger Board',                  BASE_RATES.ledger,      'per Linear Foot'],
    ['Framing / Rim Board',           BASE_RATES.framing,     'per Linear Foot'],
    ['Square Edge / Picture Frame',   BASE_RATES.pictureFrame,'per Linear Foot'],
    ['Deck Boards',                   BASE_RATES.deckBoard,   'per Board'],
    ['Beam Replacement / Installation',BASE_RATES.beam,       'per Linear Foot'],
    ['Post Count',                    BASE_RATES.postCount,   'per Each'],
    ['Caissons',                      BASE_RATES.caissons,    'per Each'],
    ['Railing',                       RAILING_RATE,           'per Linear Foot'],
  ];
  for (const [label, rate, unit] of baseRateRows) {
    ws[`A${row}`] = { v: label, t: 's', s: labelS };
    ws[`B${row}`] = { v: rate,  t: 'n', s: moneyS };
    ws[`C${row}`] = { v: unit,  t: 's', s: cellStyle(BG_WHITE, FG_GRAY, false, 9) };
    row++;
  }
  row++;

  // MARKUP RATES
  ws[`A${row}`] = { v: 'MARKUP TIERS', t: 's', s: sectionS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;
  ws[`A${row}`] = { v: 'Tier',   t: 's', s: hdrS };
  ws[`B${row}`] = { v: 'Markup', t: 's', s: { ...hdrS, alignment: { horizontal: 'right' } } };
  row++;

  const markupRows: [string, number][] = [
    ['Good',       MARKUP_RATES.good],
    ['Better',     MARKUP_RATES.better],
    ['Best Value', MARKUP_RATES.best],
  ];
  for (const [label, rate] of markupRows) {
    ws[`A${row}`] = { v: label, t: 's', s: labelS };
    ws[`B${row}`] = { v: rate,  t: 'n', s: pctS };
    row++;
  }
  row++;

  // MATERIAL TIER MULTIPLIERS
  ws[`A${row}`] = { v: 'MATERIAL TIER MULTIPLIERS', t: 's', s: sectionS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;
  ws[`A${row}`] = { v: 'Tier',      t: 's', s: hdrS };
  ws[`B${row}`] = { v: 'Multiplier',t: 's', s: { ...hdrS, alignment: { horizontal: 'right' } } };
  row++;
  const tierRows: [string, number][] = [
    ['Basic',   TIER_MULTIPLIERS.basic],
    ['Premium', TIER_MULTIPLIERS.premium],
    ['Luxury',  TIER_MULTIPLIERS.luxury],
  ];
  for (const [label, mult] of tierRows) {
    ws[`A${row}`] = { v: label, t: 's', s: labelS };
    ws[`B${row}`] = { v: mult,  t: 'n', s: { ...pctS, numFmt: '0.00"×"' } };
    row++;
  }
  row++;

  // Tax note
  const taxNoteS = cellStyle(BG_WHITE, FG_GRAY, false, 9, 'left', '', true);
  ws[`A${row}`] = { v: 'CO Sales Tax: 8.5% (applied automatically before markup)', t: 's', s: taxNoteS };
  ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });

  ws['!cols'] = colWidths([36, 14, 26]);
  ws['!ref'] = `A1:C${row}`;
  return ws;
}

// ─── PUBLIC EXPORT ───────────────────────────────────────────────────────────
export function generateExcelExport(state: EstimateState, pricing: PricingBreakdown) {
  const wb = XLSX.utils.book_new();

  const estimateSheet = buildEstimateSheet(state, pricing);
  const lumberSheet   = buildLumberSheet(state, pricing);
  const configSheet   = buildConfigSheet();

  XLSX.utils.book_append_sheet(wb, estimateSheet, 'Estimate');
  XLSX.utils.book_append_sheet(wb, lumberSheet,   'Lumber Takeoff');
  XLSX.utils.book_append_sheet(wb, configSheet,   'Pricing Config');

  const filename = `HBUILD_Estimate_${state.jobDetails.customerName?.replace(/\s+/g, '_') || 'Job'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
