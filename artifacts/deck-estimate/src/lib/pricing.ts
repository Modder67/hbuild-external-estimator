export type MeasurementType = 
  | 'ledger' 
  | 'framing' 
  | 'deckArea' 
  | 'rail8' 
  | 'rail10' 
  | 'stair6' 
  | 'stair8' 
  | 'stair10';

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

export interface EstimateState {
  jobDetails: {
    salesperson: string;
    customerName: string;
    customerAddress: string;
    jobTitle: string;
    date: string;
  };
  measurements: Record<MeasurementType, number[]>;
  materialTier: MaterialTier;
  addons: AddonState[];
  selectedMarkup: 'good' | 'better' | 'best';
}

export const BASE_RATES = {
  ledger: 28, // per LF
  framing: 22, // per LF
  deckArea: 42, // per SqFt
  rail8: 285, // each
  rail10: 345, // each
  stair6: 195, // each
  stair8: 245, // each
  stair10: 295, // each
};

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
  ledger2x10x20: number;   // 2x10x20 boards for ledger (1 per 20 LF)
  framing2x12x16: number;  // 2x12x16 boards for framing (1 per 16 LF)
  deck075x55x20: number;   // 0.75x5.5x20 deck boards ((5.5/12)*20 = 9.167 sqft each)
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
  totalLf: number;
  totalLedgerLf: number;
  lumberCounts: LumberCounts;
}

export function sumArray(arr: number[]): number {
  return arr.reduce((sum, val) => sum + (Number(val) || 0), 0);
}

export function calculatePricing(state: EstimateState): PricingBreakdown {
  const lineItems: LineItem[] = [];
  
  // Calculate Totals for Dependencies
  const totalDeckSqFt = sumArray(state.measurements.deckArea);
  const totalLf = sumArray(state.measurements.framing); // Assuming Total LF is framing/perimeter
  const materialMultiplier = TIER_MULTIPLIERS[state.materialTier];

  // 1. Measurements
  const m = state.measurements;
  
  const addMeasurementItem = (id: string, name: string, qty: number, basePrice: number, applyMultiplier = false) => {
    if (qty > 0) {
      const unitPrice = applyMultiplier ? basePrice * materialMultiplier : basePrice;
      lineItems.push({
        id,
        name,
        qty,
        unitPrice,
        total: qty * unitPrice,
        type: 'measurement'
      });
    }
  };

  addMeasurementItem('ledger', 'Ledger (Linear Ft)', sumArray(m.ledger), BASE_RATES.ledger);
  addMeasurementItem('framing', 'Framing/Ridge (Linear Ft)', totalLf, BASE_RATES.framing);
  addMeasurementItem('deckArea', `Deck Surface (Sq Ft) - ${state.materialTier.charAt(0).toUpperCase() + state.materialTier.slice(1)}`, totalDeckSqFt, BASE_RATES.deckArea, true);
  
  addMeasurementItem('rail8', '8ft Flat Railing Section', sumArray(m.rail8), BASE_RATES.rail8);
  addMeasurementItem('rail10', '10ft Flat Railing Section', sumArray(m.rail10), BASE_RATES.rail10);
  
  addMeasurementItem('stair6', '6ft Stair Diagonal Railing', sumArray(m.stair6), BASE_RATES.stair6);
  addMeasurementItem('stair8', '8ft Stair Diagonal Railing', sumArray(m.stair8), BASE_RATES.stair8);
  addMeasurementItem('stair10', '10ft Stair Diagonal Railing', sumArray(m.stair10), BASE_RATES.stair10);

  // 2. Add-ons
  state.addons.forEach(addon => {
    if (addon.enabled) {
      let qty = addon.qty;
      let unit = 'ea';
      
      if (addon.isFlat) {
        qty = 1;
        unit = 'flat';
      } else if (addon.isPerSqFt) {
        qty = totalDeckSqFt;
        unit = 'sq ft';
      } else if (addon.isPerLf) {
        qty = addon.qty; // User provides LF for privacy screen usually, or it could be derived. Assuming user provided.
        unit = 'LF';
      }

      if (qty > 0) {
        lineItems.push({
          id: addon.id,
          name: `${addon.name} ${!addon.isFlat ? `(${unit})` : ''}`,
          qty,
          unitPrice: addon.priceOverride,
          total: qty * addon.priceOverride,
          type: 'addon'
        });
      }
    }
  });

  // Calculate Subtotal
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  
  // Tax (8.5%)
  const tax = subtotal * 0.085;
  const costTotal = subtotal + tax;

  // Markups
  const totals = {
    good: costTotal * (1 + MARKUP_RATES.good),
    better: costTotal * (1 + MARKUP_RATES.better),
    best: costTotal * (1 + MARKUP_RATES.best),
  };

  // Lumber count calculations
  const totalLedgerLf = sumArray(m.ledger);
  const DECK_BOARD_COVERAGE_SQFT = (5.5 / 12) * 20; // 0.75x5.5x20 covers ~9.167 sqft each
  const lumberCounts: LumberCounts = {
    ledger2x10x20: totalLedgerLf > 0 ? Math.ceil(totalLedgerLf / 20) : 0,
    framing2x12x16: totalLf > 0 ? Math.ceil(totalLf / 16) : 0,
    deck075x55x20: totalDeckSqFt > 0 ? Math.ceil(totalDeckSqFt / DECK_BOARD_COVERAGE_SQFT) : 0,
  };

  return {
    lineItems,
    subtotal,
    tax,
    totals,
    totalDeckSqFt,
    totalLf,
    totalLedgerLf,
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
