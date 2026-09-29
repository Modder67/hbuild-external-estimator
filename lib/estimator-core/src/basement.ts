import { calculateBathroom, newBathroomState, type BathroomState } from './bathroom';
import { calculateFlooring, newFlooringState, type FlooringState } from './flooring';
import { combine, costLine, createId, type Calculation, type TakeoffLine, validQuantity } from './types';

export type BasementWall = {
  id: string;
  name: string;
  roomName: string;
  lengthFt: number | null;
  heightFt: number | null;
  finishedFaces: number;
  sheetLengthIn: 96 | 120;
  sheetWidthIn: number;
  wastePercent: number;
  surface: 'drywall' | 'wet-wall' | 'other';
  wetWallPackageConfirmed: boolean;
};

export type BasementSoffit = {
  id: string;
  name: string;
  roomName: string;
  lengthFt: number | null;
  widthIn: number | null;
  dropHeightIn: number | null;
  exposedFaces: number;
};

export type ElectricalPointKind = 'can' | 'outlet' | 'switch' | 'wall-light' | 'hanging-light';
export type BasementElectricalPoint = {
  id: string;
  roomName: string;
  kind: ElectricalPointKind;
  bathroomId: string;
};

export type BasementState = {
  egress: 'yes' | 'no' | 'unconfirmed';
  walls: BasementWall[];
  soffits: BasementSoffit[];
  panelWork: 'none' | 'upgrade' | 'subpanel' | 'both';
  distinctPanelWorkConfirmed: boolean;
  electricalDays: number | null;
  dailyLaborExcluded: boolean;
  electricalPoints: BasementElectricalPoint[];
  includeFlooring: boolean;
  flooring: FlooringState;
  includeBathrooms: boolean;
  bathrooms: BathroomState;
  bathroomFloorOwner: 'flooring' | 'excluded' | 'unconfirmed';
  bathroomLightingOwner: 'bathroom' | 'basement-electrical' | 'unconfirmed';
};

export const makeId = (prefix: string) => createId(prefix);

export function newBasementState(): BasementState {
  const bathrooms = newBathroomState();
  bathrooms.bathrooms = bathrooms.bathrooms.map(bathroom => ({
    ...bathroom,
    id: createId('bathroom'),
  }));
  return {
    egress: 'unconfirmed',
    walls: [],
    soffits: [],
    panelWork: 'none',
    distinctPanelWorkConfirmed: false,
    electricalDays: null,
    dailyLaborExcluded: false,
    electricalPoints: [],
    includeFlooring: false,
    flooring: newFlooringState(),
    includeBathrooms: false,
    bathrooms,
    bathroomFloorOwner: 'unconfirmed',
    bathroomLightingOwner: 'unconfirmed',
  };
}

const blankCalculation = (): Calculation => ({ lines: [], takeoff: [], issues: [], assumptions: [] });

function isPositive(value: number | null): value is number {
  return value !== null && validQuantity(value) && value > 0;
}

function takeoff(
  result: Calculation, id: string, group: string, label: string, quantity: number, unit: string, note?: string,
) {
  result.takeoff.push({ id, group, label, quantity, unit, note });
}

function addDirect(result: Calculation, id: string, group: string, label: string, quantity: number, unit: string, rateCents: number, note?: string) {
  if (!validQuantity(quantity) || !validQuantity(rateCents)) {
    result.issues.push(`${label}: quantity or rate is invalid.`);
    return;
  }
  if (quantity > 0) result.lines.push(costLine(id, group, label, quantity, unit, rateCents, note));
}

const electricalRates: Record<ElectricalPointKind, { material: number; labor: number; label: string }> = {
  can: { material: 2500, labor: 17500, label: 'Recessed can light' },
  outlet: { material: 3500, labor: 17500, label: 'Outlet' },
  switch: { material: 2500, labor: 17500, label: 'Switch' },
  'wall-light': { material: 2500, labor: 17500, label: 'Wall light' },
  'hanging-light': { material: 4500, labor: 27500, label: 'Hanging light/fan' },
};
const isLightPoint = (point: BasementElectricalPoint) => point.kind === 'can' || point.kind === 'wall-light' || point.kind === 'hanging-light';

export function calculateBasement(state: BasementState): Calculation {
  const base = blankCalculation();
  const issues = base.issues;
  const assumptions = base.assumptions;
  const lines = base.lines;
  const takeoffs = base.takeoff;

  if (state.egress === 'no') {
    addDirect(base, 'basement:egress-cut', 'Basement', 'Egress window cut allowance (one opening)', 1, 'opening', 250000,
      'Unsplit cut allowance only; not a complete window, well, drainage, or compliance scope.');
  } else if (state.egress === 'unconfirmed') {
    issues.push('Confirm whether an egress window is present; No adds one $2,500 cut allowance.');
  }

  for (const wall of state.walls) {
    const name = wall.name.trim() || 'Unnamed wall segment';
    const group = wall.roomName.trim() || 'Basement walls';
    if (wall.lengthFt === null || !validQuantity(wall.lengthFt)) {
      issues.push(`${name}: enter a non-negative segment length in feet.`);
      continue;
    }
    if (wall.lengthFt === 0) continue;
    const length = wall.lengthFt;
    const studs = Math.ceil(length * 12 / 16) + 1 + 2;
    takeoff(base, `wall:${wall.id}:studs`, group, `${name}: 16-inch-on-center studs`, studs, 'studs',
      'Proposed end-inclusive layout: ceil(length × 12 / 16) + 1 endpoints + 2 backing studs; verify structural layout.');
    if (!validQuantity(wall.finishedFaces) || !Number.isInteger(wall.finishedFaces)) {
      issues.push(`${name}: finished face count must be a non-negative whole number.`);
    }

    const priceWall = wall.surface !== 'wet-wall' || wall.wetWallPackageConfirmed;
    if (wall.surface === 'wet-wall' && !wall.wetWallPackageConfirmed) {
      issues.push(`${name}: wet-wall surface is held from the drywall package until package inclusion/substitution is confirmed.`);
    }

    if (wall.heightFt === null || !isPositive(wall.heightFt)) {
      issues.push(`${name}: a positive wall height in feet is required for drywall sheet takeoff.`);
      continue;
    }
    if (priceWall) {
      addDirect(base, `wall:${wall.id}:package`, group, `${name}: framing and drywall fixed allowance`, length, 'LFT', 1600,
        wall.surface === 'wet-wall' ? 'Wet-wall allowance included only after explicit confirmation; do not add it again through another owner.' : '$4/LFT framing and drywall labor + $12/LFT material.');
    }
    if (!validQuantity(wall.sheetWidthIn) || wall.sheetWidthIn <= 0) {
      issues.push(`${name}: sheet width must be greater than zero inches.`);
      continue;
    }
    if (!validQuantity(wall.wastePercent) || wall.wastePercent > 100) {
      issues.push(`${name}: drywall waste must be between 0% and 100%.`);
      continue;
    }
    const faces = validQuantity(wall.finishedFaces) && Number.isInteger(wall.finishedFaces) ? wall.finishedFaces : 0;
    if (faces === 0) {
      issues.push(`${name}: enter at least one finished face for drywall sheet takeoff.`);
      continue;
    }
    const area = length * wall.heightFt * faces;
    const sheetCoverage = wall.sheetLengthIn * wall.sheetWidthIn / 144;
    const sheets = Math.ceil(area * (1 + wall.wastePercent / 100) / sheetCoverage);
    if (wall.surface === 'drywall') {
      takeoff(base, `wall:${wall.id}:drywall`, group, `${name}: ${wall.sheetLengthIn / 12}-ft drywall sheets`, sheets, 'sheets',
        `${area} SQFT net (${length} LFT × ${wall.heightFt} ft × ${faces} face(s)); ${wall.sheetWidthIn}-in proposed sheet width; ${wall.wastePercent}% waste.`);
    } else {
      takeoff(base, `wall:${wall.id}:surface-area`, group, `${name}: ${wall.surface} surface area (informational)`, area, 'SQFT',
        'Tracked separately from drywall sheet purchasing; confirm finish/package ownership.');
    }
  }
  if (state.walls.some(wall => wall.lengthFt !== null && wall.lengthFt > 0)) {
    assumptions.push('Stud layout uses the proposed end-inclusive endpoint (+1) rule and two additional backing studs per physical segment. Stud and drywall takeoff are informational; the $16/LFT wall allowance is charged once.');
    assumptions.push('48-inch drywall sheet width is a proposed visible default pending confirmation. Sheet count is preliminary coverage rounding, not an optimized cutting layout.');
  }

  for (const soffit of state.soffits) {
    const name = soffit.name.trim() || 'Unnamed soffit';
    const group = soffit.roomName.trim() || 'Basement soffits';
    if (soffit.lengthFt === null || !validQuantity(soffit.lengthFt)) {
      issues.push(`${name}: enter a non-negative soffit length in feet.`);
      continue;
    }
    if (soffit.lengthFt === 0) continue;
    const sections = Math.ceil(soffit.lengthFt / 8);
    takeoff(base, `soffit:${soffit.id}:plywood`, group, `${name}: 8-ft plywood pieces`, sections, 'pieces',
      'Length rule only; piece width/thickness and coverage compatibility are unresolved.');
    takeoff(base, `soffit:${soffit.id}:lumber`, group, `${name}: 2×4×8 lumber pieces`, sections * 6, 'pieces',
      'Six pieces per 8-ft section, including a partial final section; longer-stock layout is not inferred.');
    for (const [label, value, unit] of [
      ['width', soffit.widthIn, 'inches'], ['drop height', soffit.dropHeightIn, 'inches'],
    ] as const) {
      if (value === null || !isPositive(value)) issues.push(`${name}: enter a positive soffit ${label} in ${unit} to describe its coverage.`);
    }
    if (!validQuantity(soffit.exposedFaces) || !Number.isInteger(soffit.exposedFaces) || soffit.exposedFaces < 1) {
      issues.push(`${name}: exposed face count must be a positive whole number.`);
    }
    issues.push(`${name}: soffit labor/material, drywall coverage, and plywood/lumber package inclusion rates are unpriced; takeoff only.`);
  }

  const anyElectrical = state.panelWork !== 'none' || state.electricalPoints.length > 0 || state.electricalDays !== null;
  if (state.panelWork === 'both' && !state.distinctPanelWorkConfirmed) {
    issues.push('Panel upgrade and subpanel are held until distinct intended scopes are confirmed.');
  } else {
    if (state.panelWork === 'upgrade' || state.panelWork === 'both') {
      addDirect(base, 'electrical:panel-upgrade', 'Basement electrical', 'Electrical panel upgrade allowance', 1, 'allowance', 480000,
        'Unsplit supplied allowance; capacity/need not inferred.');
    }
    if (state.panelWork === 'subpanel' || state.panelWork === 'both') {
      addDirect(base, 'electrical:subpanel', 'Basement electrical', 'Subpanel installation allowance', 1, 'allowance', 75000,
        'Unsplit supplied allowance.');
    }
  }
  const seenPoints = new Set<string>();
  const billablePoints: BasementElectricalPoint[] = [];
  const linkedBathroomLights = new Map<string, BasementElectricalPoint[]>();
  for (const point of state.electricalPoints) {
    if (!point.id.trim()) {
      issues.push('Each electrical point requires a stable physical point ID.');
      continue;
    }
    if (seenPoints.has(point.id)) {
      issues.push(`Electrical point ID “${point.id}” is duplicated; duplicate point charges were skipped.`);
      continue;
    }
    seenPoints.add(point.id);
    if (point.bathroomId && !state.bathrooms.bathrooms.some(bathroom => bathroom.id === point.bathroomId)) {
      issues.push(`Electrical point ${point.id}: linked bathroom ID “${point.bathroomId}” was not found; point pricing is held pending attribution.`);
      continue;
    }
    if (!point.roomName.trim()) issues.push(`Electrical point ${point.id}: enter a room name for scope attribution.`);
    if (point.bathroomId && isLightPoint(point)) {
      if (state.bathroomLightingOwner !== 'basement-electrical') {
        issues.push(`${point.roomName || 'Bathroom electrical point'}: linked bathroom light fixture/wire charges are held until bathroom lighting ownership is assigned to Basement electrical.`);
        continue;
      }
      const linked = linkedBathroomLights.get(point.bathroomId) ?? [];
      linked.push(point);
      linkedBathroomLights.set(point.bathroomId, linked);
      continue;
    }
    billablePoints.push(point);
  }
  if (state.bathroomLightingOwner === 'basement-electrical') {
    if (!state.includeBathrooms) {
      linkedBathroomLights.forEach(points => billablePoints.push(...points));
    } else {
      const bathroomById = new Map(state.bathrooms.bathrooms.map(bathroom => [bathroom.id, bathroom] as const));
      linkedBathroomLights.forEach((points, bathroomId) => {
        const bathroom = bathroomById.get(bathroomId);
        if (!bathroom) {
          issues.push(`Bathroom lighting link ${bathroomId}: no matching bathroom exists; linked electrical light points are not priced.`);
          return;
        }
        const hasUnresolvedOverlap = bathroom.vanityLightCount > 0 && bathroom.additionalLightCount > 0 && !bathroom.additionalLightsConfirmedSeparate;
        if (hasUnresolvedOverlap) {
          issues.push(`${bathroom.name}: vanity and additional bathroom-light counts overlap without confirmation; linked electrical lights are not priced.`);
          return;
        }
        const expected = bathroom.vanityLightCount + bathroom.additionalLightCount;
        if (points.length !== expected) {
          issues.push(`${bathroom.name}: selected bathroom lighting count is ${expected}, but ${points.length} distinct linked Basement electrical light point(s) were entered; all linked light charges are held until counts match.`);
          return;
        }
        billablePoints.push(...points);
      });
      state.bathrooms.bathrooms.forEach(bathroom => {
        const selected = bathroom.vanityLightCount + bathroom.additionalLightCount;
        const linkedCount = linkedBathroomLights.get(bathroom.id)?.length ?? 0;
        const hasUnresolvedOverlap = bathroom.vanityLightCount > 0 && bathroom.additionalLightCount > 0 && !bathroom.additionalLightsConfirmedSeparate;
        if (hasUnresolvedOverlap) {
          issues.push(`${bathroom.name}: confirm vanity and additional light fixtures are physically separate before pricing.`);
        }
        if (selected > 0 && linkedCount === 0) {
          issues.push(`${bathroom.name}: bathroom lighting belongs to Basement electrical, but no linked light point IDs were entered for ${selected} selected fixture(s).`);
        }
      });
    }
  }
  billablePoints.forEach(point => {
    const rate = electricalRates[point.kind];
    const attribution = point.roomName.trim() || 'Room not named';
    addDirect(base, `electrical:${point.id}:material`, 'Basement electrical', `${attribution}: ${rate.label} material`, 1, 'point', rate.material);
    addDirect(base, `electrical:${point.id}:labor`, 'Basement electrical', `${attribution}: ${rate.label} rough-and-trim labor`, 1, 'point', rate.labor,
      'Supplied combined unit labor; not charged once for rough and again for trim.');
    addDirect(base, `electrical:${point.id}:wire`, 'Basement electrical', `${attribution}: wire allowance`, 1, 'point', 3800,
      'One charge per distinct physical fixture/box point.');
  });
  if (anyElectrical) {
    if (state.dailyLaborExcluded) {
      assumptions.push('The $200/day standard electrical labor charge was explicitly excluded by user choice.');
    } else if (state.electricalDays === null) {
      issues.push('Enter billable electrical labor days or explicitly exclude the $200/day standard labor charge.');
    } else if (!validQuantity(state.electricalDays)) {
      issues.push('Electrical labor days must be a non-negative number.');
    } else {
      addDirect(base, 'electrical:daily-labor', 'Basement electrical', 'Standard electrical labor per diem', state.electricalDays, 'day', 20000,
        'Proposed additive daily charge applied once across the electrical scope; not per fixture or worker.');
    }
  }
  if (billablePoints.length) assumptions.push('Wire is charged once per distinct listed physical point. Electrical unit rates include rough and trim once; the entered per-diem is an additional charge.');

  const childParts: Calculation[] = [base];
  if (state.includeFlooring) childParts.push(calculateFlooring(state.flooring));
  if (state.includeBathrooms) {
    const bathroomState: BathroomState = structuredClone(state.bathrooms);
    if (state.bathroomLightingOwner !== 'bathroom') {
      bathroomState.bathrooms = bathroomState.bathrooms.map(bathroom => ({
        ...bathroom,
        vanityLightCount: 0,
        additionalLightCount: 0,
      }));
    }
    childParts.push(calculateBathroom(bathroomState));
    if (state.bathrooms.bathrooms.length > 0) {
      if (state.bathroomFloorOwner === 'unconfirmed') issues.push('Assign bathroom floor ownership explicitly: shared Flooring module or excluded.');
      if (state.bathroomFloorOwner === 'flooring' && !state.includeFlooring) issues.push('Bathroom floor is assigned to Flooring, but the Flooring module is excluded.');
      const hasBathroomLighting = state.bathrooms.bathrooms.some(bathroom => bathroom.vanityLightCount > 0 || bathroom.additionalLightCount > 0);
      if (state.bathroomLightingOwner === 'unconfirmed' && hasBathroomLighting) {
        issues.push('Assign bathroom lighting to the Bathroom module or Basement electrical; related bathroom and electrical fixture/wire charges are held pending ownership.');
      }
    }
  }
  if (state.includeBathrooms && state.includeFlooring && state.bathroomFloorOwner === 'flooring') {
    assumptions.push('Bathroom floors are priced only in the shared Flooring module; the bathroom module does not add a floor charge.');
  }
  return combine(...childParts);
}

