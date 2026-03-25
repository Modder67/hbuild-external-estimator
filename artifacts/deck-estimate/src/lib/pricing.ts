export type MeasurementType = 
  | 'ledger' 
  | 'framing'
  | 'pictureFrame'
  | 'deckArea'
  | 'joistCount'
  | 'beam'
  | 'postCount'
  | 'caissons'
  | 'rail8' 
  | 'rail10' 
  | 'stair6' 
  | 'stair8' 
  | 'stair10';

export const JOIST_SIZES = ['2×6', '2×8', '2×10', '2×12'] as const;
export type JoistSize = typeof JOIST_SIZES[number] | '';

export type MaterialTier = 'basic' | 'premium' | 'luxury';

export interface AddonState {
  id: string;
  name: string;
  enabled: boolean;
  qty: number;
  priceOverride: number;
  isPerSqFt?: boolean;
  isPerLf?: boolean;
  isFlat?: boolean;
  basePrice: number;
}

export interface StairPosts {
  left: number;
  middle: number;
  right: number;
  center: number;
}

export interface EstimateState {
  jobDetails: {
    salesperson: string;
    customerName: string;
    customerAddress: string;
    jobTitle: string;
    date: string;
  };
  measurements: Record<MeasurementType, number[]>;
  joistSize: JoistSize;
  stairPosts: StairPosts;
  materialTier: MaterialTier;
  addons: AddonState[];
  selectedMarkup: 'good' | 'better' | 'best';
}

// Per-unit base prices from pricing sheet (before markup tiers)
export const BASE_RATES = {
  ledger:       45.80,  // per LF
  framing:      67.10,  // per LF  (Rim Board)
  pictureFrame: 26.80,  // per LF  (Square Edge / Picture Frame)
  deckBoard:   199.50,  // per board — qty = ceil(sqft × 0.1410)
  beam:        114.00,  // per LF  (Beam Replacement/Installation)
  postCount:   562.00,  // per EA
  caissons:    925.00,  // per EA
};

export const RAILING_RATE = 146; // per Linear Foot (all railing types)

export const TIER_MULTIPLIERS: Record<MaterialTier, number> = {
  basic: 1.0,
  premium: 1.35,
  luxury: 1.75,
};

export const MARKUP_RATES = {
  good: 0.52,
  better: 0.42,
  best: 0.37,
};

export const DEFAULT_ADDONS: AddonState[] = [
  { id: 'stairs', name: 'Stairs (per step)', enabled: false, qty: 1, basePrice: 95, priceOverride: 95 },
  { id: 'footings', name: 'Post Footings / Concrete', enabled: false, qty: 1, basePrice: 285, priceOverride: 285 },
  { id: 'lighting', name: 'Lighting Package', enabled: false, qty: 1, basePrice: 850, priceOverride: 850, isFlat: true },
  { id: 'underdeck', name: 'Under-Deck Ceiling', enabled: false, qty: 1, basePrice: 12, priceOverride: 12, isPerSqFt: true },
  { id: 'privacy', name: 'Privacy Screen / Lattice', enabled: false, qty: 1, basePrice: 28, priceOverride: 28, isPerLf: true },
  { id: 'stain', name: 'Custom Stain / Paint', enabled: false, qty: 1, basePrice: 650, priceOverride: 650, isFlat: true },
  { id: 'removal', name: 'Removal of Old Deck', enabled: false, qty: 1, basePrice: 4.50, priceOverride: 4.50, isPerSqFt: true },
];

export interface LineItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  type: 'measurement' | 'addon';
}

export interface LumberCounts {
  ledger2x10x20: number;   // 2×10×20 boards for ledger (1 per 20 LF)
  framing2x12x16: number;  // 2×12×16 boards for framing (1 per 16 LF)
  deck075x55x20: number;   // 0.75×5.5×20 deck boards (sqft × 0.1410)
}

export interface PricingBreakdown {
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  totals: {
    good: number;
    better: number;
    best: number;
  };
  totalDeckSqFt: number;
  totalDeckBoards: number;
  totalLf: number;
  totalLedgerLf: number;
  totalRailingLf: number;
  lumberCounts: LumberCounts;
}

export function sumArray(arr: number[]): number {
  return arr.reduce((sum, val) => sum + (Number(val) || 0), 0);
}

export function calculatePricing(state: EstimateState): PricingBreakdown {
  const lineItems: LineItem[] = [];
  
  const totalDeckSqFt = sumArray(state.measurements.deckArea);
  const totalDeckBoards = totalDeckSqFt > 0 ? Math.ceil(totalDeckSqFt * 0.1410) : 0;
  const totalLedgerLf = sumArray(state.measurements.ledger);
  const totalLf = sumArray(state.measurements.framing);
  const materialMultiplier = TIER_MULTIPLIERS[state.materialTier];
  const m = state.measurements;

  const addItem = (id: string, name: string, qty: number, unitPrice: number, applyTier = false) => {
    if (qty > 0) {
      const price = applyTier ? unitPrice * materialMultiplier : unitPrice;
      lineItems.push({ id, name, qty, unitPrice: price, total: qty * price, type: 'measurement' });
    }
  };

  // Ledger Board: $45.80/LF
  addItem('ledger', 'Ledger Board (Linear Ft)', totalLedgerLf, BASE_RATES.ledger);

  // Framing / Rim Board: $67.10/LF
  addItem('framing', 'Framing / Rim Board (Linear Ft)', totalLf, BASE_RATES.framing);

  // Square Edge / Picture Frame: $26.80/LF
  const totalPictureFrameLf = sumArray(m.pictureFrame);
  addItem('pictureFrame', 'Square Edge / Picture Frame (Linear Ft)', totalPictureFrameLf, BASE_RATES.pictureFrame);

  // Deck Boards: ceil(sqft × 0.1410) boards × $199.50 × tier multiplier
  const tierLabel = state.materialTier.charAt(0).toUpperCase() + state.materialTier.slice(1);
  addItem('deckArea', `Deck Boards (${totalDeckSqFt} sqft → ${totalDeckBoards} boards) – ${tierLabel}`, totalDeckBoards, BASE_RATES.deckBoard, true);

  // Beam Replacement/Installation: $114/LF
  const totalBeamLf = sumArray(m.beam);
  addItem('beam', 'Beam Replacement / Installation (Linear Ft)', totalBeamLf, BASE_RATES.beam);

  // Post Count: $562/EA
  const totalPosts = sumArray(m.postCount);
  addItem('postCount', 'Post Count (Each)', totalPosts, BASE_RATES.postCount);

  // Caissons: $925/EA
  const totalCaissons = sumArray(m.caissons);
  addItem('caissons', 'Caissons (Each)', totalCaissons, BASE_RATES.caissons);

  // Railing: all sections converted to linear feet × $146/LF
  const totalRailingLf =
    sumArray(m.rail8)  * 8  +
    sumArray(m.rail10) * 10 +
    sumArray(m.stair6) * 6  +
    sumArray(m.stair8) * 8  +
    sumArray(m.stair10) * 10;

  if (totalRailingLf > 0) {
    lineItems.push({
      id: 'railing',
      name: 'Railing (Linear Ft)',
      qty: totalRailingLf,
      unitPrice: RAILING_RATE,
      total: totalRailingLf * RAILING_RATE,
      type: 'measurement',
    });
  }

  // Add-ons
  state.addons.forEach(addon => {
    if (addon.enabled) {
      let qty = addon.qty;
      let unit = 'ea';
      if (addon.isFlat) { qty = 1; unit = 'flat'; }
      else if (addon.isPerSqFt) { qty = totalDeckSqFt; unit = 'sq ft'; }
      else if (addon.isPerLf) { unit = 'LF'; }
      if (qty > 0) {
        lineItems.push({
          id: addon.id,
          name: `${addon.name} ${!addon.isFlat ? `(${unit})` : ''}`,
          qty,
          unitPrice: addon.priceOverride,
          total: qty * addon.priceOverride,
          type: 'addon',
        });
      }
    }
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.085;
  const costTotal = subtotal + tax;

  const totals = {
    good:   costTotal * (1 + MARKUP_RATES.good),
    better: costTotal * (1 + MARKUP_RATES.better),
    best:   costTotal * (1 + MARKUP_RATES.best),
  };

  const lumberCounts: LumberCounts = {
    ledger2x10x20:  totalLedgerLf > 0  ? Math.ceil(totalLedgerLf / 20) : 0,
    framing2x12x16: totalLf > 0        ? Math.ceil(totalLf / 16) : 0,
    deck075x55x20:  totalDeckBoards,
  };

  return {
    lineItems,
    subtotal,
    tax,
    totals,
    totalDeckSqFt,
    totalDeckBoards,
    totalLf,
    totalLedgerLf,
    totalRailingLf,
    lumberCounts,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
