import type { Calculation, CostLine, TakeoffLine } from './types';

export const DECK_MEASUREMENT_TYPES = [
  'ledger', 'framing', 'pictureFrame', 'deckArea', 'joistCount', 'beam',
  'postCount', 'caissons', 'rail8', 'rail10', 'stair6', 'stair8', 'stair10',
] as const;

const JOB_DETAIL_FIELDS = [
  'salesperson', 'firstName', 'lastName', 'jobCode', 'addressLine1', 'addressLine2',
  'city', 'region', 'postalCode', 'customerName', 'customerAddress', 'jobTitle', 'date',
];
const LUMBER_FIELDS = ['ledger', 'framing', 'joist', 'beam', 'post'];
const ADDON_DEFINITIONS = [
  { id: 'stairs', name: 'Stairs (per step)', basePrice: 95, unit: 'ea' },
  { id: 'footings', name: 'Post Footings / Concrete', basePrice: 285, unit: 'ea' },
  { id: 'lighting', name: 'Lighting Package', basePrice: 850, flat: true },
  { id: 'underdeck', name: 'Under-Deck Ceiling', basePrice: 12, perSqFt: true },
  { id: 'privacy', name: 'Privacy Screen / Lattice', basePrice: 28, perLf: true },
  { id: 'stain', name: 'Custom Stain / Paint', basePrice: 650, flat: true },
  { id: 'removal', name: 'Removal of Old Deck', basePrice: 4.5, perSqFt: true },
] as const;
const LUMBER_IDS = new Set([
  '2x10x8-tf', '2x10x10-tf', '2x10x12-tf', '2x10x16-tf', '2x10x20-tf',
  '2x12x12-tf', '2x12x16-tf', '2x12x20-tf', '2x12x8-df', '2x12x10-df',
  '2x12x12-df', '2x12x16-df', '2x12x20-df', 'microlam', 'glulam', '4x4', '6x6', '8x8',
]);
const MARKUP_RATES = { good: 0.52, better: 0.42, best: 0.37 } as const;
const BASE_RATES = {
  ledger: 45.8, framing: 67.1, pictureFrame: 26.8, deckBoard: 199.5,
  beam: 114, postCount: 562, caissons: 925, railing: 146,
} as const;

type DeckScope = Record<string, any>;

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every(key => allowed.has(key));
}

function finiteNonnegative(value: unknown, maximum = 1_000_000): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum;
}

/** Returns a reason when the submitted scope is not a complete, supported Deck EstimateState. */
export function validateDeckScope(scope: unknown): string | undefined {
  if (!record(scope)) return 'Deck scope must be a JSON object.';
  const rootRequired = [
    'jobDetails', 'measurements', 'joistSize', 'lumberSelections', 'stairPosts',
    'materialTier', 'addons', 'selectedMarkup',
  ];
  if (!exactKeys(scope, rootRequired, ['sourceId', 'clientSourceId', 'projectId', 'projectName'])) {
    return 'Deck scope does not match the supported estimate state.';
  }
  for (const key of ['sourceId', 'clientSourceId']) {
    if (scope[key] !== undefined && (typeof scope[key] !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope[key]))) {
      return `Deck ${key} must be a valid UUID when provided.`;
    }
  }
  if (scope.projectId !== undefined &&
      (typeof scope.projectId !== 'string' || scope.projectId.trim().length > 100)) {
    return 'Deck projectId must be a string.';
  }
  if (typeof scope.projectId === 'string' && scope.projectId.trim()) {
    return 'Deck estimate is linked to a canonical project and cannot be drafted or issued as a new-job estimate.';
  }
  if (scope.projectName !== undefined && (typeof scope.projectName !== 'string' || scope.projectName.length > 150)) {
    return 'Deck projectName must be a string of at most 150 characters.';
  }

  if (!record(scope.jobDetails) || !exactKeys(scope.jobDetails, JOB_DETAIL_FIELDS)) {
    return 'Deck job details are incomplete or contain unsupported fields.';
  }
  if (JOB_DETAIL_FIELDS.some(key => typeof scope.jobDetails[key] !== 'string' || scope.jobDetails[key].length > 500)) {
    return 'Deck job details must contain bounded text fields.';
  }
  if (!record(scope.measurements) || !exactKeys(scope.measurements, [...DECK_MEASUREMENT_TYPES])) {
    return 'Deck measurements are incomplete or contain unsupported fields.';
  }
  for (const key of DECK_MEASUREMENT_TYPES) {
    const measurements = scope.measurements[key];
    if (!Array.isArray(measurements) || measurements.length > 500 ||
        measurements.some((value: unknown) => !finiteNonnegative(value))) {
      return `Deck measurement ${key} must contain only finite, nonnegative values.`;
    }
  }
  if (!['', '2×6', '2×8', '2×10', '2×12'].includes(scope.joistSize)) {
    return 'Deck joist size is not supported.';
  }
  if (!record(scope.lumberSelections) || !exactKeys(scope.lumberSelections, LUMBER_FIELDS) ||
      LUMBER_FIELDS.some(key => typeof scope.lumberSelections[key] !== 'string' ||
        (scope.lumberSelections[key] !== '' && !LUMBER_IDS.has(scope.lumberSelections[key])))) {
    return 'Deck lumber selections contain a missing or unsupported selection.';
  }
  if (!record(scope.stairPosts) || !exactKeys(scope.stairPosts, ['left', 'middle', 'right', 'center']) ||
      Object.values(scope.stairPosts).some(value => !Number.isSafeInteger(value) || !finiteNonnegative(value))) {
    return 'Deck stair-post quantities must be nonnegative whole numbers.';
  }
  if (!['basic', 'premium', 'luxury'].includes(scope.materialTier)) {
    return 'Deck material tier is not supported.';
  }
  if (!['good', 'better', 'best'].includes(scope.selectedMarkup)) {
    return 'Deck markup tier is not supported.';
  }
  if (!Array.isArray(scope.addons) || scope.addons.length !== ADDON_DEFINITIONS.length) {
    return 'Deck add-ons must include each supported add-on exactly once.';
  }
  const seen = new Set<string>();
  for (const addon of scope.addons) {
    if (!record(addon) || typeof addon.id !== 'string' || seen.has(addon.id)) {
      return 'Deck add-ons contain a malformed or duplicate ID.';
    }
    seen.add(addon.id);
    const definition = ADDON_DEFINITIONS.find(item => item.id === addon.id);
    if (!definition) return `Unrecognized deck add-on ID: ${addon.id}.`;
    const flags = ['isPerSqFt', 'isPerLf', 'isFlat'];
    if (!exactKeys(addon, ['id', 'name', 'enabled', 'qty', 'priceOverride', 'basePrice'], flags) ||
        addon.name !== definition.name || addon.basePrice !== definition.basePrice ||
        typeof addon.enabled !== 'boolean' || !finiteNonnegative(addon.qty) ||
        !finiteNonnegative(addon.priceOverride)) {
      return `Deck add-on ${addon.id} contains an invalid quantity, override, or definition.`;
    }
    const expectedFlags = {
      isPerSqFt: 'perSqFt' in definition,
      isPerLf: 'perLf' in definition,
      isFlat: 'flat' in definition,
    };
    if (flags.some(flag => addon[flag] !== undefined && addon[flag] !== expectedFlags[flag as keyof typeof expectedFlags]) ||
        flags.some(flag => expectedFlags[flag as keyof typeof expectedFlags] && addon[flag] !== true)) {
      return `Deck add-on ${addon.id} has unsupported pricing flags.`;
    }
    if (addon.priceOverride > 1_000_000) return `Deck add-on ${addon.id} override is too large.`;
  }
  return undefined;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function getSelectionQuantity(scope: DeckScope, key: string, required: number, label: string): TakeoffLine | undefined {
  const selection = scope.lumberSelections[key] as string;
  if (!selection) return undefined;
  const option = LUMBER_OPTIONS[selection];
  if (!option) return undefined;
  const overageQuantity = key === 'framing' ? required * 2 * 1.2
    : key === 'post' ? required : required * 1.2;
  const quantity = key === 'joist'
    ? Math.ceil((required / (16 / 12)) * 1.2)
    : option.lengthFt > 0 ? Math.ceil(overageQuantity / option.lengthFt) : Math.ceil(overageQuantity);
  return { id: `lumber-${key}`, group: 'Lumber', label: option.label, quantity, unit: option.unit };
}

const LUMBER_OPTIONS: Record<string, { label: string; unit: string; lengthFt: number }> = {
  '2x10x8-tf': { label: '2×10×8 True Frame', unit: 'EA', lengthFt: 8 },
  '2x10x10-tf': { label: '2×10×10 True Frame', unit: 'EA', lengthFt: 10 },
  '2x10x12-tf': { label: '2×10×12 True Frame', unit: 'EA', lengthFt: 12 },
  '2x10x16-tf': { label: '2×10×16 True Frame', unit: 'EA', lengthFt: 16 },
  '2x10x20-tf': { label: '2×10×20 True Frame', unit: 'EA', lengthFt: 20 },
  '2x12x12-tf': { label: '2×12×12 True Frame', unit: 'EA', lengthFt: 12 },
  '2x12x16-tf': { label: '2×12×16 True Frame', unit: 'EA', lengthFt: 16 },
  '2x12x20-tf': { label: '2×12×20 True Frame', unit: 'EA', lengthFt: 20 },
  '2x12x8-df': { label: '2×12×8 #2 Doug Fir', unit: 'EA', lengthFt: 8 },
  '2x12x10-df': { label: '2×12×10 #2 Doug Fir', unit: 'EA', lengthFt: 10 },
  '2x12x12-df': { label: '2×12×12 #2 Doug Fir', unit: 'EA', lengthFt: 12 },
  '2x12x16-df': { label: '2×12×16 #2 Doug Fir', unit: 'EA', lengthFt: 16 },
  '2x12x20-df': { label: '2×12×20 #2 Doug Fir', unit: 'EA', lengthFt: 20 },
  microlam: { label: '11 7/8" Microlam', unit: 'LFT', lengthFt: 0 },
  glulam: { label: '5½" × 9½" Glulam', unit: 'LFT', lengthFt: 0 },
  '4x4': { label: '4×4 Post', unit: 'EA', lengthFt: 0 },
  '6x6': { label: '6×6 Post', unit: 'EA', lengthFt: 0 },
  '8x8': { label: '8×8 Post', unit: 'EA', lengthFt: 0 },
};

function makeLine(id: string, group: string, label: string, quantity: number, rate: number, unit: string): CostLine {
  const unitCostCents = Math.round(rate * 100);
  return { id, group, label, quantity, unit, unitCostCents, totalCents: Math.round(quantity * rate * 100) };
}

/** Server-owned Deck takeoff and charges from a validated EstimateState. */
export function calculateDeck(scope: unknown): Calculation {
  const invalid = validateDeckScope(scope);
  if (invalid) return { lines: [], takeoff: [], issues: [invalid], assumptions: [] };
  const state = scope as DeckScope;
  const m = state.measurements as Record<string, number[]>;
  const totalDeckSqFt = sum(m.deckArea);
  const totalDeckBoards = totalDeckSqFt > 0 ? Math.ceil(totalDeckSqFt * 0.141) : 0;
  const totalLedgerLf = sum(m.ledger);
  const totalFramingLf = sum(m.framing);
  const totalBeamLf = sum(m.beam);
  const totalPosts = sum(m.postCount);
  const materialMultiplier = { basic: 1, premium: 1.35, luxury: 1.75 }[state.materialTier as 'basic' | 'premium' | 'luxury'];
  const lines: CostLine[] = [];
  const add = (id: string, label: string, quantity: number, rate: number, unit: string, tiered = false) => {
    if (quantity > 0) lines.push(makeLine(id, 'Deck scope', label, quantity, tiered ? rate * materialMultiplier : rate, unit));
  };
  add('ledger', 'Ledger Board', totalLedgerLf, BASE_RATES.ledger, 'LF');
  add('framing', 'Framing / Rim Board', totalFramingLf, BASE_RATES.framing, 'LF');
  add('pictureFrame', 'Square Edge / Picture Frame', sum(m.pictureFrame), BASE_RATES.pictureFrame, 'LF');
  add('deckArea', `Deck Boards (${totalDeckSqFt} sqft → ${totalDeckBoards} boards)`, totalDeckBoards, BASE_RATES.deckBoard, 'board', true);
  add('beam', 'Beam Replacement / Installation', totalBeamLf, BASE_RATES.beam, 'LF');
  add('postCount', 'Post Count', totalPosts, BASE_RATES.postCount, 'EA');
  add('caissons', 'Caissons', sum(m.caissons), BASE_RATES.caissons, 'EA');
  const railingLf = sum(m.rail8) * 8 + sum(m.rail10) * 10 + sum(m.stair6) * 6 + sum(m.stair8) * 8 + sum(m.stair10) * 10;
  add('railing', 'Railing', railingLf, BASE_RATES.railing, 'LF');

  for (const addon of state.addons as Array<{ id: string; name: string; enabled: boolean; qty: number; priceOverride: number; isFlat?: boolean; isPerSqFt?: boolean; isPerLf?: boolean }>) {
    if (!addon.enabled) continue;
    let quantity = addon.qty;
    let unit = 'EA';
    if (addon.isFlat) { quantity = 1; unit = 'flat'; }
    else if (addon.isPerSqFt) { quantity = totalDeckSqFt; unit = 'sq ft'; }
    else if (addon.isPerLf) unit = 'LF';
    if (quantity > 0) lines.push(makeLine(addon.id, 'Add-ons', addon.name, quantity, addon.priceOverride, unit));
  }

  const takeoff: TakeoffLine[] = [];
  if (totalDeckBoards > 0) takeoff.push({ id: 'deck-boards', group: 'Decking', label: '0.75×5.5×20 deck boards', quantity: totalDeckBoards, unit: 'EA' });
  if (totalLedgerLf > 0) {
    const item = getSelectionQuantity(state, 'ledger', totalLedgerLf, 'Ledger lumber');
    if (item) takeoff.push(item);
  }
  if (totalFramingLf > 0) {
    const framing = getSelectionQuantity(state, 'framing', totalFramingLf, 'Framing lumber');
    const joist = getSelectionQuantity(state, 'joist', totalFramingLf, 'Joist lumber');
    if (framing) takeoff.push(framing);
    if (joist) takeoff.push(joist);
  }
  if (totalBeamLf > 0) {
    const item = getSelectionQuantity(state, 'beam', totalBeamLf, 'Beam lumber');
    if (item) takeoff.push(item);
  }
  if (totalPosts > 0) {
    const item = getSelectionQuantity(state, 'post', totalPosts, 'Post lumber');
    if (item) takeoff.push(item);
  }

  const result: Calculation = {
    lines,
    takeoff,
    issues: [],
    assumptions: [
      `Deck boards: ceiling of measured deck square feet multiplied by 0.1410.`,
      `Selected ledger and beam lumber include 20% overage; framing lumber covers twice the measured perimeter plus 20%.`,
      `Joist count: ceiling of framing LF divided by 16 inches on center, plus 20% overage; posts use measured count without overage.`,
      `${state.materialTier} material tier applied to deck-board rate.`,
      `Selected ${state.selectedMarkup} markup is applied to the pre-tax subtotal at ${MARKUP_RATES[state.selectedMarkup as keyof typeof MARKUP_RATES] * 100}%.`,
    ],
  };
  const takeoffIssue = deckIssueReadiness(state, result);
  if (takeoffIssue) result.issues.push(takeoffIssue);
  return result;
}

/** Prevent issuance unless every measured framing section has an explicit lumber selection. */
export function deckIssueReadiness(scope: unknown, calculation: Calculation): string | undefined {
  const error = validateDeckScope(scope);
  if (error) return error;
  const state = scope as DeckScope;
  const measurements = state.measurements as Record<string, number[]>;
  const missing: string[] = [];
  if (sum(measurements.ledger) > 0 && !state.lumberSelections.ledger) missing.push('ledger');
  if (sum(measurements.framing) > 0) {
    if (!state.lumberSelections.framing) missing.push('framing');
    if (!state.lumberSelections.joist) missing.push('joist');
  }
  if (sum(measurements.beam) > 0 && !state.lumberSelections.beam) missing.push('beam');
  if (sum(measurements.postCount) > 0 && !state.lumberSelections.post) missing.push('post');
  if (missing.length) return `Select lumber for each measured Deck section before issuing: ${missing.join(', ')}.`;
  const hasSelection = LUMBER_FIELDS.some(key => Boolean(state.lumberSelections[key]));
  if (calculation.lines.some(line => line.totalCents > 0) && !hasSelection) {
    return 'Select at least one lumber option before issuing a priced Deck estimate.';
  }
  return undefined;
}

/** Deck quote totals use only the chosen markup tier, without the legacy browser tax. */
export function deckTotals(calculation: Calculation, scope: unknown) {
  const error = validateDeckScope(scope);
  if (error) throw new Error(error);
  const state = scope as DeckScope;
  const directCents = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);
  const markupCents = Math.round(directCents * MARKUP_RATES[state.selectedMarkup as keyof typeof MARKUP_RATES]);
  return {
    directCents,
    companyCents: 0,
    incidentalsCents: 0,
    accidentsCents: 0,
    salesCents: 0,
    beforeTaxCents: directCents + markupCents,
  };
}