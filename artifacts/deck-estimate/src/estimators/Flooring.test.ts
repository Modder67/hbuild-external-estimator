import assert from 'node:assert/strict';
import { calculateFlooring, newFlooringState, type FlooringDoor, type FlooringRoom } from './Flooring';

function room(overrides: Partial<FlooringRoom> = {}): FlooringRoom {
  return {
    id: 'living', name: 'Living room', measuredSqft: 200, existingType: 'carpet', demolition: true,
    demolitionAreaOverride: null, otherDemoDescription: '', otherDemoRateCents: null, substrate: 'unknown',
    package: 'lvp-median', wastePercent: 10, packageSizeSqft: null, installedAreaOverride: null,
    carpetMaterialQuantitySqft: null, materialRateOverrideCents: null, materialUnitOverride: null, installRateOverrideCents: null,
    baseboardMode: 'new', baseboardLft: 60, reinstallRateCents: null,
    pad: 'none', padRateCents: null, ...overrides,
  };
}

function door(id: string, orderId = 'order-1', overrides: Partial<FlooringDoor> = {}): FlooringDoor {
  return {
    id, location: `Door ${id}`, roomName: '', pocket: false, exterior: false, width: 30, measurement: 'slab',
    heightIn: null, jambDepthIn: null, handing: 'left', swing: 'inward', viewingSide: 'hallway',
    slideDirection: '', hardware: 'reuse', hardwarePackage: '', hardwareRateCents: null, reuseConfirmed: true,
    trimColor: '', doorPaintColor: '', orderId, customMaterialRateCents: null, customLaborRateCents: null, ...overrides,
  };
}

function direct(state: ReturnType<typeof newFlooringState>): number {
  return calculateFlooring(state).lines.reduce((sum, line) => sum + line.totalCents, 0);
}

// Acceptance sample: demolition, waste-adjusted LVP, installation, and new baseboard.
const sample = newFlooringState();
sample.rooms = [room()];
assert.equal(direct(sample), 174500);

// Waste changes material purchasing only, never the labor quantity.
const noWaste = newFlooringState();
noWaste.rooms = [room({ wastePercent: 0 })];
const noWasteLines = calculateFlooring(noWaste).lines;
assert.equal(noWasteLines.find(line => line.id === 'room:living:installation')?.quantity, 200);
assert.equal(noWasteLines.find(line => line.id === 'room:living:material')?.quantity, 200);

// 49 SQFT is the small tile demolition tier; exactly 50 uses the standard rate.
const tile49 = newFlooringState();
tile49.rooms = [room({ measuredSqft: 49, baseboardMode: 'none', wastePercent: 0, existingType: 'tile' })];
assert.equal(calculateFlooring(tile49).lines.find(line => line.id === 'room:living:demolition')?.unitCostCents, 600);
const tile50 = newFlooringState();
tile50.rooms = [room({ measuredSqft: 50, baseboardMode: 'none', wastePercent: 0, existingType: 'tile' })];
assert.equal(calculateFlooring(tile50).lines.find(line => line.id === 'room:living:demolition')?.unitCostCents, 400);

// Unknown material units and missing tile installation/pad rates remain visible issues.
const incomplete = newFlooringState();
incomplete.rooms = [room({ package: 'carpet-median', pad: '7lb' })];
const incompleteResult = calculateFlooring(incomplete);
assert.ok(incompleteResult.issues.some(issue => issue.includes('unit') && issue.includes('unconfirmed')));
assert.ok(incompleteResult.issues.some(issue => issue.includes('pad rate is missing')));
incomplete.rooms[0] = room({ package: 'carpet-median', materialUnitOverride: 'sqyd' });
const carpetMaterialQuantity = calculateFlooring(incomplete).lines.find(line => line.id === 'room:living:material')?.quantity;
assert.ok(carpetMaterialQuantity !== undefined && Math.abs(carpetMaterialQuantity - 220 / 9) < 1e-12);
incomplete.rooms[0] = room({ package: 'tile-median' });
assert.ok(calculateFlooring(incomplete).issues.some(issue => issue.includes('installation rate is missing')));

// Door known subtotals use the correct combined tier and one shipping minimum per order.
for (const [count, expected] of [[1, 87500], [3, 145000]] as const) {
  const state = newFlooringState();
  state.doors = Array.from({ length: count }, (_, index) => door(`d${index + 1}`));
  const result = calculateFlooring(state);
  assert.equal(direct(state), expected);
  assert.equal(result.takeoff.reduce((sum, item) => sum + item.quantity, 0), count * 54);
  assert.ok(result.issues.some(issue => issue.includes('Casing material coverage')));
}
const twoDoors = newFlooringState();
twoDoors.doors = [door('d1'), door('d2')];
assert.ok(calculateFlooring(twoDoors).issues.some(issue => issue.includes('Exactly 2 standard')));
assert.equal(direct(twoDoors), 77500);
assert.equal(direct(newFlooringState()), 0);

// Separate orders receive separate minima; entered shipping above the minimum is honored.
const splitOrder = newFlooringState();
splitOrder.orders.push({ id: 'order-2', label: 'Second order', shippingCents: 60000 });
splitOrder.doors = [door('d1'), door('d2', 'order-2')];
assert.equal(calculateFlooring(splitOrder).lines.filter(line => line.id.endsWith(':shipping')).reduce((sum, line) => sum + line.totalCents, 0), 107500);
