import { costLine, createId, type Calculation, type TakeoffLine, validQuantity } from './types';

export type PanAdjustmentPolicy = 'unconfirmed' | 'none' | 'minus-one-inch-total-each-dimension';
export type DrywallRepair = 'none' | 'simple' | 'other';
export type ShowerFinish = 'Brushed Nickel' | 'Stainless' | 'Chrome' | 'Matte Black' | 'Brushed Gold';

export type BathroomScope = {
  id: string;
  name: string;
  tubInScope: boolean;
  tubWidthIn: number;
  tubLengthIn: number;
  tubDrainSide: 'left' | 'right' | 'other';
  showerInScope: boolean;
  demoTileSurround: boolean;
  wallDemoSqFt: number;
  wallHeightFt: number;
  panDemoInScope: boolean;
  existingPanDemoSqFt: number;
  newWallInstallSqFt: number;
  newPanWidthIn: number;
  newPanDepthIn: number;
  panAdjustmentPolicy: PanAdjustmentPolicy;
  finish: ShowerFinish;
  nicheInScope: boolean;
  nicheCount: number;
  nicheWidthIn: number;
  nicheHeightIn: number;
  drywallRepair: DrywallRepair;
  existingVanityWidthIn: number;
  replaceVanity: boolean;
  newVanityWidthIn: number;
  sinkCount: number;
  replaceTrap: boolean;
  replaceFaucet: boolean;
  vanityLightCount: number;
  vanityLightOwnerSupplied: boolean;
  towelBarCount: number;
  towelBarOwnerSupplied: boolean;
  mirrorCount: number;
  mirrorOwnerSupplied: boolean;
  additionalLightCount: number;
  additionalLightsConfirmedSeparate: boolean;
};

export type DeletedBathroom = { bathroom: BathroomScope; index: number };

/** A controlled, serializable bathroom estimate state suitable for embedding in a larger project. */
export type BathroomState = {
  bathrooms: BathroomScope[];
  deletedBathroom: DeletedBathroom | null;
};

function blankBathroom(name = 'Bathroom'): BathroomScope {
  return {
    id: createId('bathroom'),
    name,
    tubInScope: false,
    tubWidthIn: 0,
    tubLengthIn: 0,
    tubDrainSide: 'left',
    showerInScope: true,
    demoTileSurround: false,
    wallDemoSqFt: 0,
    wallHeightFt: 0,
    panDemoInScope: false,
    existingPanDemoSqFt: 0,
    newWallInstallSqFt: 0,
    newPanWidthIn: 0,
    newPanDepthIn: 0,
    panAdjustmentPolicy: 'unconfirmed',
    finish: 'Chrome',
    nicheInScope: false,
    nicheCount: 1,
    nicheWidthIn: 0,
    nicheHeightIn: 0,
    drywallRepair: 'none',
    existingVanityWidthIn: 0,
    replaceVanity: false,
    newVanityWidthIn: 36,
    sinkCount: 1,
    replaceTrap: false,
    replaceFaucet: false,
    vanityLightCount: 0,
    vanityLightOwnerSupplied: false,
    towelBarCount: 0,
    towelBarOwnerSupplied: false,
    mirrorCount: 0,
    mirrorOwnerSupplied: false,
    additionalLightCount: 0,
    additionalLightsConfirmedSeparate: false,
  };
}

export function newBathroomState(): BathroomState {
  return { bathrooms: [blankBathroom('Bathroom 1')], deletedBathroom: null };
}

export function addBathroomToState(state: BathroomState): BathroomState {
  const room = blankBathroom(`Bathroom ${state.bathrooms.length + 1}`);
  return { ...state, bathrooms: [...state.bathrooms, room], deletedBathroom: null };
}

export function duplicateBathroomInState(state: BathroomState, bathroom: BathroomScope): BathroomState {
  const duplicate: BathroomScope = {
    ...bathroom,
    id: createId('bathroom'),
    name: `${bathroom.name} copy`,
    wallDemoSqFt: 0,
    wallHeightFt: 0,
    existingPanDemoSqFt: 0,
    newWallInstallSqFt: 0,
    newPanWidthIn: 0,
    newPanDepthIn: 0,
    tubWidthIn: 0,
    tubLengthIn: 0,
    nicheWidthIn: 0,
    nicheHeightIn: 0,
    towelBarCount: 0,
    mirrorCount: 0,
    vanityLightCount: 0,
    vanityLightOwnerSupplied: false,
    additionalLightCount: 0,
    sinkCount: 1,
  };
  return { ...state, bathrooms: [...state.bathrooms, duplicate], deletedBathroom: null };
}

function isCount(value: number): boolean {
  return validQuantity(value) && Number.isInteger(value);
}

function addTakeoff(
  lines: TakeoffLine[],
  id: string,
  bathroom: BathroomScope,
  label: string,
  quantity: number,
  unit: string,
  note?: string,
) {
  lines.push({ id: `${bathroom.id}:${id}`, group: bathroom.name, label, quantity, unit, note });
}

/**
 * Calculates direct, known bathroom costs only. Missing rates remain completeness issues;
 * project-level markups are intentionally left to the parent estimator.
 */
export function calculateBathroom(state: BathroomState): Calculation {
  const lines: Calculation['lines'] = [];
  const takeoff: TakeoffLine[] = [];
  const issues: string[] = [];
  const assumptions: string[] = [
    'Bathroom costs are direct-cost allowances only; project markups and tax are applied by the parent estimator.',
    'The linked Home Depot package contents and prices are unverified and have not been imported.',
    'Supplied fixed allowances are treated as unsplit per-bathroom direct costs where applicable.',
    'Existing pan demolition SQFT is entered as an independent confirmed footprint; new-pan dimensional adjustments are not applied to demolition area.',
  ];

  for (const bathroom of state.bathrooms) {
    const prefix = bathroom.id;
    const addIssue = (message: string) => issues.push(`${bathroom.name}: ${message}`);
    const addCost = (id: string, label: string, quantity: number, unit: string, unitCostCents: number, note?: string) => {
      if (quantity > 0) lines.push(costLine(`${prefix}:${id}`, bathroom.name, label, quantity, unit, unitCostCents, note));
    };

    const measuredValues: Array<[string, number]> = [
      ['Wall demolition area', bathroom.wallDemoSqFt],
      ['Wall height', bathroom.wallHeightFt],
      ['Existing pan demolition area', bathroom.existingPanDemoSqFt],
      ['New wall installation area', bathroom.newWallInstallSqFt],
      ['New pan width', bathroom.newPanWidthIn],
      ['New pan depth', bathroom.newPanDepthIn],
    ];
    for (const [label, value] of measuredValues) {
      if (!validQuantity(value)) addIssue(`${label} must be a non-negative number.`);
    }

    if (bathroom.demoTileSurround && validQuantity(bathroom.wallDemoSqFt)) {
      addCost('wall-demolition', 'Tile-surround wall demolition labor', bathroom.wallDemoSqFt, 'sq ft', 400);
    }
    if (bathroom.demoTileSurround && bathroom.wallDemoSqFt > 0 && bathroom.wallHeightFt === 0) {
      addIssue('Wall height is required for layout review; entered wall area is not multiplied by height.');
    }
    if (bathroom.panDemoInScope && validQuantity(bathroom.existingPanDemoSqFt)) {
      addCost('pan-demolition', 'Existing pan demolition labor', bathroom.existingPanDemoSqFt, 'sq ft', 900);
    }

    if (validQuantity(bathroom.newWallInstallSqFt) && bathroom.newWallInstallSqFt > 0) {
      const sheets = Math.ceil(bathroom.newWallInstallSqFt / 15);
      addTakeoff(takeoff, 'backerboard-sheets', bathroom, '5 ft × 3 ft backerboard sheets', sheets, 'sheets', '15 sq ft coverage per sheet; no waste allowance applied.');
      addTakeoff(takeoff, 'backerboard-area', bathroom, 'Backerboard coverage', sheets * 15, 'sq ft', `${bathroom.newWallInstallSqFt} sq ft net wall area; sheet rounding shown.`);
      addTakeoff(takeoff, 'tile-area', bathroom, 'Wall tile (preliminary, before waste)', bathroom.newWallInstallSqFt, 'sq ft', 'Zero-waste preliminary takeoff; no box-coverage rounding configured.');
      addIssue('Wall reconstruction material and installation rates are missing (tile, backerboard, setting materials, waterproofing, labor, and disposal).');
      addIssue('No universal waste allowance is configured; preliminary tile takeoff uses zero waste.');
      assumptions.push(`${bathroom.name}: backerboard quantity uses 15 sq ft per 5 × 3 ft sheet and rounds up; entered wall area is not multiplied by height.`);
    }

    if (bathroom.tubInScope) {
      addIssue('Tub material, removal, installation, and applicable package pricing are not configured.');
      if (bathroom.tubWidthIn <= 0 || bathroom.tubLengthIn <= 0) addIssue('Enter the tub dimensions in inches.');
    } else if (bathroom.showerInScope) {
      const hasNewPanDimensions = bathroom.newPanWidthIn > 0 || bathroom.newPanDepthIn > 0;
      if (hasNewPanDimensions && bathroom.panAdjustmentPolicy === 'unconfirmed') {
        addIssue('New pan measurement adjustment is unresolved; confirm the one-inch policy before using a pan area.');
      } else if (hasNewPanDimensions) {
        const adjustment = bathroom.panAdjustmentPolicy === 'minus-one-inch-total-each-dimension' ? 1 : 0;
        const width = bathroom.newPanWidthIn - adjustment;
        const depth = bathroom.newPanDepthIn - adjustment;
        if (width <= 0 || depth <= 0) {
          addIssue('Adjusted new pan dimensions must both be greater than zero.');
        } else {
          const area = width * depth / 144;
          addTakeoff(takeoff, 'new-pan-area', bathroom, 'New shower pan area (estimating only)', area, 'sq ft', `Raw: ${bathroom.newPanWidthIn} × ${bathroom.newPanDepthIn} in; adjusted: ${width} × ${depth} in. Verify product fit.`);
          assumptions.push(`${bathroom.name}: pan dimensions use ${adjustment ? 'one inch total subtracted from each entered dimension' : 'no dimensional adjustment'}; this policy is not a product-fit guarantee.`);
        }
      }
      if (bathroom.showerInScope) addIssue('Shower pan/assembly, valve, trim, and installation rates are not configured; the supplied valve/fixture/install price statement has unresolved allocation.');
    }

    if (bathroom.nicheInScope) {
      if (!isCount(bathroom.nicheCount) || bathroom.nicheCount < 1) addIssue('Niche quantity must be a positive whole number.');
      else {
        if (bathroom.nicheWidthIn <= 0 || bathroom.nicheHeightIn <= 0) addIssue('Enter positive niche width and height in inches.');
        addTakeoff(takeoff, 'niche-count', bathroom, 'Shower niches', bathroom.nicheCount, 'each', `${bathroom.nicheWidthIn} × ${bathroom.nicheHeightIn} in; dimensions and waterproofing/package inclusion require confirmation.`);
      }
      addIssue('Niche material and labor rates are missing; confirm prefab/package waterproofing coverage.');
    }

    if (bathroom.drywallRepair === 'simple') addCost('drywall-simple', 'Simple drywall touchups (per-bathroom allowance)', 1, 'bathroom', 53500);
    if (bathroom.drywallRepair === 'other') addCost('drywall-other', 'Other drywall repair (per-bathroom allowance)', 1, 'bathroom', 160000);
    if (bathroom.drywallRepair !== 'none') {
      assumptions.push(`${bathroom.name}: drywall repair is a fixed per-bathroom unsplit allowance; scope basis and labor/material allocation are pending confirmation.`);
    }

    if (bathroom.replaceVanity) {
      addIssue('Vanity supply, countertop/sink inclusion, cabinet removal, and cabinet installation pricing are missing.');
      if (bathroom.existingVanityWidthIn <= 0) addIssue('Enter the existing vanity width in inches.');
      if (!validQuantity(bathroom.newVanityWidthIn) || bathroom.newVanityWidthIn <= 0) addIssue('Enter a positive new vanity width in inches.');
      assumptions.push(`${bathroom.name}: sink count is entered explicitly; it is not derived from vanity width.`);
    }
    if (!isCount(bathroom.sinkCount) || bathroom.sinkCount < 1) {
      if (bathroom.replaceVanity || bathroom.replaceTrap || bathroom.replaceFaucet) addIssue('Sink count must be a positive whole number.');
    } else {
      const trapScope = bathroom.replaceVanity || bathroom.replaceTrap;
      const faucetScope = bathroom.replaceVanity || bathroom.replaceFaucet;
      if (trapScope) {
        addCost('p-trap', 'P-trap plumbing allowance', bathroom.sinkCount, 'each', 13000, 'Labor/material coverage is unresolved.');
        addIssue('P-trap allowance labor/material coverage needs clarification.');
      }
      if (faucetScope) {
        addCost('faucet', 'Faucet allowance (combined installation labor/material)', bathroom.sinkCount, 'each', 25000);
      }
      if (bathroom.sinkCount > 1 && (trapScope || faucetScope)) {
        assumptions.push(`${bathroom.name}: one trap and/or faucet allowance is applied per explicitly entered sink; confirm this multiplication policy.`);
      }
    }

    if (!isCount(bathroom.vanityLightCount)) addIssue('Vanity light quantity must be a non-negative whole number.');
    else {
      addCost('vanity-light', 'New vanity-light installation labor', bathroom.vanityLightCount, 'each', 7500, bathroom.vanityLightOwnerSupplied ? 'Labor only; owner-supplied fixture.' : 'Labor only; fixture material is not priced.');
      if (bathroom.vanityLightCount > 0 && !bathroom.vanityLightOwnerSupplied) addIssue('Vanity light fixture material price or owner-supplied status is required.');
    }
    if (!isCount(bathroom.towelBarCount)) addIssue('Towel bar quantity must be a non-negative whole number.');
    else if (bathroom.towelBarCount > 0) {
      addCost('towel-bars', 'Towel bar installation labor', bathroom.towelBarCount, 'each', 2500, bathroom.towelBarOwnerSupplied ? 'Owner-supplied material.' : 'Towel bar material is not priced.');
      if (!bathroom.towelBarOwnerSupplied) addIssue('Towel bar material price or owner-supplied status is required.');
    }
    if (!isCount(bathroom.mirrorCount)) addIssue('Mirror quantity must be a non-negative whole number.');
    else if (bathroom.mirrorCount > 0) {
      addCost('mirrors', 'Mirror installation labor', bathroom.mirrorCount, 'each', 12500, bathroom.mirrorOwnerSupplied ? 'Owner-supplied material.' : 'Mirror material is not priced.');
      if (!bathroom.mirrorOwnerSupplied) addIssue('Mirror material price or owner-supplied status is required.');
    }
    if (!isCount(bathroom.additionalLightCount)) {
      addIssue('Additional light quantity must be a non-negative whole number.');
    } else {
      const overlap = bathroom.vanityLightCount > 0 && bathroom.additionalLightCount > 0;
      if (overlap && !bathroom.additionalLightsConfirmedSeparate) {
        addIssue('Additional light allowance is held until confirmed to be for physical fixtures separate from vanity lights.');
      } else {
        addCost('additional-lights', 'Additional light (combined labor/material)', bathroom.additionalLightCount, 'each', 37500);
      }
    }
  }

  if (state.bathrooms.length === 0) issues.push('Add at least one bathroom to calculate bathroom scope.');
  return { lines, takeoff, issues: [...new Set(issues)], assumptions: [...new Set(assumptions)] };
}

