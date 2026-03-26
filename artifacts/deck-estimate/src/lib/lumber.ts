export interface LumberOption {
  id: string;
  label: string;
  size: string;
  species: string;
  unit: 'EA' | 'LFT';
  lengthFt: number;   // board length in feet; 0 = sold by LFT (no board division)
  costPerUnit: number;
}

export const LUMBER_OPTIONS: LumberOption[] = [
  // 2×10 True Frame
  { id: '2x10x8-tf',   label: '2×10×8 True Frame',   size: '2×10×8',   species: 'True Frame',  unit: 'EA',  lengthFt: 8,  costPerUnit: 27.00 },
  { id: '2x10x10-tf',  label: '2×10×10 True Frame',  size: '2×10×10',  species: 'True Frame',  unit: 'EA',  lengthFt: 10, costPerUnit: 29.00 },
  { id: '2x10x12-tf',  label: '2×10×12 True Frame',  size: '2×10×12',  species: 'True Frame',  unit: 'EA',  lengthFt: 12, costPerUnit: 32.00 },
  { id: '2x10x16-tf',  label: '2×10×16 True Frame',  size: '2×10×16',  species: 'True Frame',  unit: 'EA',  lengthFt: 16, costPerUnit: 36.00 },
  { id: '2x10x20-tf',  label: '2×10×20 True Frame',  size: '2×10×20',  species: 'True Frame',  unit: 'EA',  lengthFt: 20, costPerUnit: 40.00 },
  // 2×12 True Frame
  { id: '2x12x12-tf',  label: '2×12×12 True Frame',  size: '2×12×12',  species: 'True Frame',  unit: 'EA',  lengthFt: 12, costPerUnit: 65.00 },
  { id: '2x12x16-tf',  label: '2×12×16 True Frame',  size: '2×12×16',  species: 'True Frame',  unit: 'EA',  lengthFt: 16, costPerUnit: 70.00 },
  { id: '2x12x20-tf',  label: '2×12×20 True Frame',  size: '2×12×20',  species: 'True Frame',  unit: 'EA',  lengthFt: 20, costPerUnit: 75.00 },
  // 2×12 #2 Doug Fir
  { id: '2x12x8-df',   label: '2×12×8 #2 Doug Fir',  size: '2×12×8',   species: '#2 Doug Fir', unit: 'EA',  lengthFt: 8,  costPerUnit: 17.55 },
  { id: '2x12x10-df',  label: '2×12×10 #2 Doug Fir', size: '2×12×10',  species: '#2 Doug Fir', unit: 'EA',  lengthFt: 10, costPerUnit: 21.95 },
  { id: '2x12x12-df',  label: '2×12×12 #2 Doug Fir', size: '2×12×12',  species: '#2 Doug Fir', unit: 'EA',  lengthFt: 12, costPerUnit: 26.33 },
  { id: '2x12x16-df',  label: '2×12×16 #2 Doug Fir', size: '2×12×16',  species: '#2 Doug Fir', unit: 'EA',  lengthFt: 16, costPerUnit: 35.10 },
  { id: '2x12x20-df',  label: '2×12×20 #2 Doug Fir', size: '2×12×20',  species: '#2 Doug Fir', unit: 'EA',  lengthFt: 20, costPerUnit: 43.88 },
  // Engineered
  { id: 'microlam',    label: '11 7/8" Microlam',     size: '11 7/8"',  species: 'Microlam',    unit: 'LFT', lengthFt: 0,  costPerUnit: 8.50  },
  { id: 'glulam',      label: '5½" × 9½" Glulam',    size: '5½"×9½"',  species: 'Glulam',      unit: 'LFT', lengthFt: 0,  costPerUnit: 32.00 },
  // Posts
  { id: '4x4',         label: '4×4',                  size: '4×4',      species: 'Post',        unit: 'EA',  lengthFt: 0,  costPerUnit: 24.00  },
  { id: '6x6',         label: '6×6',                  size: '6×6',      species: 'Post',        unit: 'EA',  lengthFt: 0,  costPerUnit: 126.00 },
  { id: '8x8',         label: '8×8',                  size: '8×8',      species: 'Post',        unit: 'EA',  lengthFt: 0,  costPerUnit: 224.00 },
];

export const LUMBER_BY_ID: Record<string, LumberOption> = Object.fromEntries(
  LUMBER_OPTIONS.map(o => [o.id, o])
);

// Groups for display in dropdown
export const LUMBER_GROUPS: { label: string; ids: string[] }[] = [
  { label: '2×10 True Frame', ids: ['2x10x8-tf', '2x10x10-tf', '2x10x12-tf', '2x10x16-tf', '2x10x20-tf'] },
  { label: '2×12 True Frame', ids: ['2x12x12-tf', '2x12x16-tf', '2x12x20-tf'] },
  { label: '2×12 #2 Doug Fir', ids: ['2x12x8-df', '2x12x10-df', '2x12x12-df', '2x12x16-df', '2x12x20-df'] },
  { label: 'Engineered Lumber', ids: ['microlam', 'glulam'] },
  { label: 'Posts', ids: ['4x4', '6x6', '8x8'] },
];

export interface LumberCalcResult {
  option: LumberOption;
  qty: number;
  cost: number;
}

/**
 * Ledger Board lumber
 * Covers total ledger LF with 20% overage.
 * If board has a fixed length: qty = ceil(LF * 1.20 / boardLength)
 * If LFT-based: qty (in LFT) = ceil(LF * 1.20)
 */
export function calcLedgerLumber(option: LumberOption, totalLedgerLf: number): LumberCalcResult {
  if (totalLedgerLf <= 0) return { option, qty: 0, cost: 0 };
  const qty = option.lengthFt > 0
    ? Math.ceil((totalLedgerLf * 1.20) / option.lengthFt)
    : Math.ceil(totalLedgerLf * 1.20);
  return { option, qty, cost: qty * option.costPerUnit };
}

/**
 * Framing / Perimeter (New Ledger) lumber
 * Rim board runs twice around perimeter: totalFramingLF × 2, then +20% overage.
 */
export function calcFramingLumber(option: LumberOption, totalFramingLf: number): LumberCalcResult {
  if (totalFramingLf <= 0) return { option, qty: 0, cost: 0 };
  const totalLf = totalFramingLf * 2;
  const qty = option.lengthFt > 0
    ? Math.ceil((totalLf * 1.20) / option.lengthFt)
    : Math.ceil(totalLf * 1.20);
  return { option, qty, cost: qty * option.costPerUnit };
}

/**
 * Floor Joist lumber
 * Joist count = (ledger LF + framing LF) / (16" OC = 1.333 ft) × 1.20 overage
 * Each joist = 1 board of selected lumber.
 */
export function calcJoistLumber(option: LumberOption, totalLedgerLf: number, totalFramingLf: number): LumberCalcResult {
  const total = totalLedgerLf + totalFramingLf;
  if (total <= 0) return { option, qty: 0, cost: 0 };
  const qty = Math.ceil((total / (16 / 12)) * 1.20);
  return { option, qty, cost: qty * option.costPerUnit };
}

export function calcJoistCount(totalLedgerLf: number, totalFramingLf: number): number {
  const total = totalLedgerLf + totalFramingLf;
  if (total <= 0) return 0;
  return Math.ceil((total / (16 / 12)) * 1.20);
}

export interface LumberBreakdown {
  ledger: LumberCalcResult | null;
  framing: LumberCalcResult | null;
  joist: LumberCalcResult | null;
  totalCost: number;
}

export function calculateLumberBreakdown(
  lumberSelections: { ledger: string; framing: string; joist: string },
  totalLedgerLf: number,
  totalFramingLf: number,
): LumberBreakdown {
  const ledgerOpt = LUMBER_BY_ID[lumberSelections.ledger] ?? null;
  const framingOpt = LUMBER_BY_ID[lumberSelections.framing] ?? null;
  const joistOpt = LUMBER_BY_ID[lumberSelections.joist] ?? null;

  const ledger = ledgerOpt ? calcLedgerLumber(ledgerOpt, totalLedgerLf) : null;
  const framing = framingOpt ? calcFramingLumber(framingOpt, totalFramingLf) : null;
  const joist = joistOpt ? calcJoistLumber(joistOpt, totalLedgerLf, totalFramingLf) : null;

  const totalCost =
    (ledger?.cost ?? 0) +
    (framing?.cost ?? 0) +
    (joist?.cost ?? 0);

  return { ledger, framing, joist, totalCost };
}
