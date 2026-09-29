import { costLine, createId, validQuantity, type Calculation } from './types';

export type FloorType = 'carpet' | 'lvp' | 'tile' | 'hardwood' | 'linoleum' | 'other';
export type FlooringPackage = 'lvp-median' | 'lvp-high' | 'tile-median' | 'tile-high' | 'carpet-median' | 'carpet-high';
export type BaseboardMode = 'none' | 'new' | 'reinstall';
export type DoorWidth = 24 | 30 | 32 | 36;

export type FlooringRoom = {
  id: string;
  name: string;
  measuredSqft: number;
  existingType: FloorType;
  demolition: boolean;
  demolitionAreaOverride: number | null;
  otherDemoDescription: string;
  otherDemoRateCents: number | null;
  substrate: 'concrete' | 'wood' | 'other' | 'unknown';
  package: FlooringPackage;
  wastePercent: number;
  packageSizeSqft: number | null;
  installedAreaOverride: number | null;
  carpetMaterialQuantitySqft: number | null;
  materialRateOverrideCents: number | null;
  materialUnitOverride: 'sqft' | 'sqyd' | null;
  installRateOverrideCents: number | null;
  baseboardMode: BaseboardMode;
  baseboardLft: number;
  reinstallRateCents: number | null;
  pad: 'none' | '7lb' | '10lb';
  padRateCents: number | null;
};

export type FlooringDoor = {
  id: string;
  location: string;
  roomName: string;
  pocket: boolean;
  exterior: boolean;
  width: DoorWidth;
  measurement: 'slab' | 'rough-opening';
  heightIn: number | null;
  jambDepthIn: number | null;
  handing: 'left' | 'right' | '';
  swing: 'inward' | 'outward' | '';
  viewingSide: string;
  slideDirection: 'left' | 'right' | '';
  hardware: 'new' | 'reuse';
  hardwarePackage: string;
  hardwareRateCents: number | null;
  reuseConfirmed: boolean;
  trimColor: string;
  doorPaintColor: string;
  orderId: string;
  customMaterialRateCents: number | null;
  customLaborRateCents: number | null;
};

export type FlooringOrder = {
  id: string;
  label: string;
  shippingCents: number | null;
};

export type FlooringExtra = {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  unitCostCents: number | null;
  included: boolean;
};

export type FlooringState = {
  rooms: FlooringRoom[];
  doors: FlooringDoor[];
  orders: FlooringOrder[];
  extras: FlooringExtra[];
  casingMaterialIncluded: boolean | null;
  casingPaintIncluded: boolean | null;
  casingRateCentsPerLft: number | null;
  casingPaintRateCentsPerDoor: number | null;
  doorTrimColor: string;
};

export const newId = (prefix: string) => createId(prefix);

export function newFlooringState(): FlooringState {
  return {
    rooms: [],
    doors: [],
    orders: [{ id: 'order-1', label: 'Order 1', shippingCents: null }],
    extras: [],
    casingMaterialIncluded: null,
    casingPaintIncluded: null,
    casingRateCentsPerLft: null,
    casingPaintRateCentsPerDoor: null,
    doorTrimColor: '',
  };
}

const floorRates: Record<FlooringPackage, { materialCents: number | null; installCents: number | null; materialUnit: 'sqft' | 'sqyd' }> = {
  'lvp-median': { materialCents: 350, installCents: 200, materialUnit: 'sqft' },
  'lvp-high': { materialCents: 450, installCents: 200, materialUnit: 'sqft' },
  'tile-median': { materialCents: 350, installCents: null, materialUnit: 'sqft' },
  'tile-high': { materialCents: 650, installCents: null, materialUnit: 'sqft' },
  'carpet-median': { materialCents: 950, installCents: 700, materialUnit: 'sqyd' },
  'carpet-high': { materialCents: 3650, installCents: 700, materialUnit: 'sqyd' },
};

const demoRates: Record<Exclude<FloorType, 'other'>, { standard: number; small: number }> = {
  carpet: { standard: 100, small: 100 },
  lvp: { standard: 100, small: 100 },
  tile: { standard: 400, small: 600 },
  hardwood: { standard: 400, small: 600 },
  linoleum: { standard: 300, small: 500 },
};

export const packageLabels: Record<FlooringPackage, string> = {
  'lvp-median': 'LVP Median',
  'lvp-high': 'LVP High End',
  'tile-median': 'Tile Median',
  'tile-high': 'Tile High End',
  'carpet-median': 'Carpet Median',
  'carpet-high': 'Carpet High End',
};

function addLine(result: Calculation, id: string, label: string, quantity: number, unit: string, rate: number, note?: string) {
  if (!validQuantity(quantity) || !validQuantity(rate)) {
    result.issues.push(`Invalid quantity or rate for ${label}.`);
    return;
  }
  result.lines.push(costLine(id, 'Flooring & doors', label, quantity, unit, rate, note));
}

function roomQuantity(room: FlooringRoom, override: number | null, measured: number): number {
  return override ?? measured;
}

export function calculateFlooring(state: FlooringState): Calculation {
  const result: Calculation = { lines: [], takeoff: [], issues: [], assumptions: [] };
  if (state.rooms.length === 0 && state.doors.length === 0) {
    result.issues.push('Add at least one flooring room or door opening before issuing an estimate.');
  }
  const usableDemo = state.rooms.map(room => ({
    room,
    quantity: room.demolition ? roomQuantity(room, room.demolitionAreaOverride, room.measuredSqft) : 0,
  })).filter(item => item.quantity > 0 && validQuantity(item.quantity));

  // Demolition tiers are selected against the aggregate quantity for each existing material.
  const demoTotals = new Map<FloorType, number>();
  usableDemo.forEach(({ room, quantity }) => demoTotals.set(room.existingType, (demoTotals.get(room.existingType) ?? 0) + quantity));
  usableDemo.forEach(({ room, quantity }) => {
    const id = `room:${room.id}:demolition`;
    if (room.existingType === 'other') {
      if (!room.otherDemoDescription.trim()) result.issues.push(`${room.name || 'A room'}: describe the existing “Other” flooring before pricing demolition.`);
      if (room.otherDemoRateCents === null) result.issues.push(`${room.name || 'A room'}: custom demolition rate for “Other” flooring is missing.`);
      else addLine(result, id, `${room.name}: ${room.otherDemoDescription || 'Other'} demolition`, quantity, 'SQFT', room.otherDemoRateCents);
      return;
    }
    const rate = demoRates[room.existingType];
    const unitRate = (demoTotals.get(room.existingType) ?? 0) < 50 ? rate.small : rate.standard;
    addLine(result, id, `${room.name}: ${room.existingType} demolition`, quantity, 'SQFT', unitRate,
      `Rate tier based on ${demoTotals.get(room.existingType)} SQFT aggregate.`);
  });
  if (usableDemo.length) result.assumptions.push('Demolition tier thresholds aggregate by existing flooring material across all rooms; exactly 50 SQFT uses the standard rate.');

  state.rooms.forEach(room => {
    const measuredValid = validQuantity(room.measuredSqft);
    if (!measuredValid) result.issues.push(`${room.name || 'A room'}: measured area must be a non-negative finite number.`);
    if (room.demolition && !validQuantity(roomQuantity(room, room.demolitionAreaOverride, room.measuredSqft))) {
      result.issues.push(`${room.name || 'A room'}: demolition area must be non-negative and finite.`);
    }
    const installArea = roomQuantity(room, room.installedAreaOverride, room.measuredSqft);
    if (!validQuantity(installArea)) {
      result.issues.push(`${room.name || 'A room'}: installation area must be non-negative and finite.`);
      return;
    }
    if (installArea <= 0) {
      result.issues.push(`${room.name || 'A room'}: active flooring section requires a positive installation area.`);
      return;
    }
    const baseRates = floorRates[room.package];
    const rates = {
      materialCents: room.materialRateOverrideCents ?? baseRates.materialCents,
      installCents: room.installRateOverrideCents ?? baseRates.installCents,
      materialUnit: room.materialUnitOverride ?? baseRates.materialUnit,
    };
    if (!validQuantity(room.wastePercent) || room.wastePercent > 100) {
      result.issues.push(`${room.name}: material waste must be between 0% and 100%.`);
      return;
    }
    if (room.packageSizeSqft !== null && (!validQuantity(room.packageSizeSqft) || room.packageSizeSqft === 0)) {
      result.issues.push(`${room.name}: package size must be greater than zero when configured.`);
      return;
    }
    const wasteFactor = 1 + room.wastePercent / 100;
    const purchasedSqft = room.carpetMaterialQuantitySqft ?? (installArea * wasteFactor);
    if (!validQuantity(purchasedSqft)) {
      result.issues.push(`${room.name}: purchased material quantity must be non-negative and finite.`);
      return;
    }
    const packagedSqft = room.packageSizeSqft && room.packageSizeSqft > 0
      ? Math.ceil(purchasedSqft / room.packageSizeSqft) * room.packageSizeSqft
      : purchasedSqft;
    const purchasedMaterialQuantity = rates.materialUnit === 'sqyd' ? packagedSqft / 9 : packagedSqft;
    if (rates.materialCents === null) result.issues.push(`${packageLabels[room.package]} material rate is missing.`);
    else if (room.package.startsWith('carpet') && room.materialUnitOverride === null) {
      result.issues.push(`${packageLabels[room.package]} material unit (SQFT or SQYD) is unconfirmed; no material charge was assumed.`);
    } else addLine(result, `room:${room.id}:material`, `${room.name}: ${packageLabels[room.package]} material`, purchasedMaterialQuantity, rates.materialUnit.toUpperCase(), rates.materialCents,
      room.packageSizeSqft ? `Waste ${room.wastePercent}%; rounded up to ${room.packageSizeSqft} SQFT package.` : `Waste ${room.wastePercent}%; no package rounding.`);

    if (rates.installCents === null) result.issues.push(`${packageLabels[room.package]} installation rate is missing.`);
    else if (room.package.startsWith('carpet')) addLine(result, `room:${room.id}:installation`, `${room.name}: carpet installation`, installArea / 9, 'SQYD', rates.installCents, 'Installation uses installed area, without material waste.');
    else addLine(result, `room:${room.id}:installation`, `${room.name}: ${packageLabels[room.package]} installation`, installArea, 'SQFT', rates.installCents, 'Installation uses installed area, without material waste.');

    if (room.package.startsWith('carpet') && room.pad !== 'none') {
      if (room.padRateCents === null) result.issues.push(`${room.name}: carpet ${room.pad} pad rate is missing.`);
      else addLine(result, `room:${room.id}:pad`, `${room.name}: carpet ${room.pad} pad`, installArea, 'SQFT', room.padRateCents);
    }

    if (!validQuantity(room.baseboardLft)) result.issues.push(`${room.name}: baseboard length must be non-negative and finite.`);
    else if (room.baseboardMode === 'new' && room.baseboardLft > 0) {
      addLine(result, `room:${room.id}:baseboard-labor`, `${room.name}: new baseboard paint/install labor`, room.baseboardLft, 'LFT', 500);
      addLine(result, `room:${room.id}:baseboard-material`, `${room.name}: new baseboard material and paint`, room.baseboardLft, 'LFT', 125);
    } else if (room.baseboardMode === 'reinstall' && room.baseboardLft > 0) {
      if (room.reinstallRateCents === null) result.issues.push(`${room.name}: reinstall-existing baseboard rate is missing.`);
      else addLine(result, `room:${room.id}:baseboard-reinstall`, `${room.name}: reinstall existing baseboard`, room.baseboardLft, 'LFT', room.reinstallRateCents);
    }
  });

  const standardDoors = state.doors.filter(door => !door.pocket && !door.exterior);
  if (standardDoors.length === 2) result.issues.push('Exactly 2 standard interior doors has unresolved labor pricing.');
  const standardLaborRate = standardDoors.length === 1 ? 25000 : standardDoors.length > 2 ? 17500 : null;
  if (standardDoors.length > 0 && standardLaborRate !== null) {
    standardDoors.forEach(door => addLine(result, `door:${door.id}:material`, `${door.location || 'Door'}: standard door material`, 1, 'door', 15000));
    standardDoors.forEach(door => addLine(result, `door:${door.id}:labor`, `${door.location || 'Door'}: hang, casing installation and paint labor`, 1, 'door', standardLaborRate,
      `Combined standard-door tier: ${standardDoors.length} eligible door(s).`));
  } else if (standardDoors.length === 2) {
    standardDoors.forEach(door => addLine(result, `door:${door.id}:material`, `${door.location || 'Door'}: standard door material`, 1, 'door', 15000));
  }

  state.doors.forEach(door => {
    const nonstandard = door.pocket || door.exterior;
    const kind = door.pocket && door.exterior ? 'pocket and exterior' : door.pocket ? 'pocket' : 'exterior';
    if (nonstandard) {
      if (door.customMaterialRateCents === null) result.issues.push(`${door.location || 'Door'}: ${kind} door material package/rate is missing.`);
      else addLine(result, `door:${door.id}:material`, `${door.location || 'Door'}: custom ${kind} door material`, 1, 'door', door.customMaterialRateCents);
      if (door.customLaborRateCents === null) result.issues.push(`${door.location || 'Door'}: ${kind} door labor package/rate is missing.`);
      else addLine(result, `door:${door.id}:labor`, `${door.location || 'Door'}: custom ${kind} door labor`, 1, 'door', door.customLaborRateCents);
    }
    if (door.hardware === 'new') {
      if (door.hardwareRateCents === null) result.issues.push(`${door.location || 'Door'}: new hardware package and rate are missing.`);
      else addLine(result, `door:${door.id}:hardware`, `${door.location || 'Door'}: ${door.hardwarePackage || 'New'} hardware`, 1, 'package', door.hardwareRateCents);
    } else if (!door.reuseConfirmed) result.issues.push(`${door.location || 'Door'}: confirm reused hardware suitability.`);

    result.takeoff.push({ id: `door:${door.id}:casing-sticks`, group: 'Doors', label: `${door.location || 'Door'} casing sticks`, quantity: 6, unit: '8-ft stick' });
    result.takeoff.push({ id: `door:${door.id}:casing-length`, group: 'Doors', label: `${door.location || 'Door'} casing length`, quantity: 48, unit: 'LFT' });
    if (nonstandard) result.issues.push(`${door.location || 'Door'}: pocket/exterior casing takeoff requires package review; six 8-ft sticks are shown provisionally.`);
    if (door.measurement === 'rough-opening') result.assumptions.push('Door width is recorded as a rough opening and is not treated as a slab purchasing dimension.');
  });

  if (state.doors.length) {
    if (state.casingMaterialIncluded === null) result.issues.push('Casing material coverage must be confirmed as included in door material or separately priced.');
    else if (!state.casingMaterialIncluded) {
      if (state.casingRateCentsPerLft === null) result.issues.push('Casing material rate is missing.');
      else addLine(result, 'doors:casing-material', 'Door casing material', state.doors.length * 48, 'LFT', state.casingRateCentsPerLft);
    }
    if (state.casingPaintIncluded === null) result.issues.push('Casing paint-supply coverage must be confirmed or priced.');
    else if (!state.casingPaintIncluded) {
      if (state.casingPaintRateCentsPerDoor === null) result.issues.push('Casing paint-supply rate is missing.');
      else addLine(result, 'doors:casing-paint', 'Casing paint supplies', state.doors.length, 'door', state.casingPaintRateCentsPerDoor);
    }
  }

  const doorsByOrder = new Map<string, FlooringDoor[]>();
  state.doors.forEach(door => {
    const list = doorsByOrder.get(door.orderId) ?? [];
    list.push(door);
    doorsByOrder.set(door.orderId, list);
  });
  doorsByOrder.forEach((doors, orderId) => {
    const order = state.orders.find(item => item.id === orderId);
    const entered = order?.shippingCents;
    if (entered !== null && entered !== undefined && !validQuantity(entered)) {
      result.issues.push(`${order?.label ?? orderId}: shipping amount must be non-negative.`);
      return;
    }
    const shipping = Math.max(47500, entered ?? 47500);
    addLine(result, `order:${orderId}:shipping`, `${order?.label ?? orderId}: door shipping and handling`, 1, 'order', shipping,
      entered === null || entered === undefined ? 'Estimated minimum; supplier quote not confirmed.' : 'Estimate uses the greater of entered shipping and the $475 minimum.');
  });

  state.extras.forEach(extra => {
    if (extra.included) return;
    if (!extra.label.trim()) result.issues.push('A manual extra needs a description.');
    if (!validQuantity(extra.quantity)) result.issues.push(`${extra.label || 'Manual extra'} quantity must be non-negative and finite.`);
    if (extra.unitCostCents === null) result.issues.push(`${extra.label || 'Manual extra'} rate is missing.`);
    else addLine(result, `extra:${extra.id}`, extra.label || 'Manual extra', extra.quantity, extra.unit, extra.unitCostCents);
  });
  return result;
}

