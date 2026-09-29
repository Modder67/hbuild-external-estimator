import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateBasement, newBasementState, type BasementElectricalPoint, type BasementWall } from './Basement';

function wall(overrides: Partial<BasementWall> = {}): BasementWall {
  return {
    id: 'wall-1',
    name: 'North wall',
    roomName: 'Rec room',
    lengthFt: 16,
    heightFt: 8,
    finishedFaces: 1,
    sheetLengthIn: 96,
    sheetWidthIn: 48,
    wastePercent: 0,
    surface: 'drywall',
    wetWallPackageConfirmed: false,
    ...overrides,
  };
}

function point(id: string, kind: BasementElectricalPoint['kind'], roomName = 'Rec room'): BasementElectricalPoint {
  return { id, kind, roomName, bathroomId: '' };
}

function total(result: ReturnType<typeof calculateBasement>): number {
  return result.lines.reduce((sum, line) => sum + line.totalCents, 0);
}

describe('calculateBasement', () => {
  it('calculates a 16-ft wall with 15 studs, four sheets, and $256 direct cost', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.walls = [wall()];
    const result = calculateBasement(state);

    assert.equal(total(result), 25_600);
    assert.equal(result.takeoff.find(item => item.id === 'wall:wall-1:studs')?.quantity, 15);
    assert.equal(result.takeoff.find(item => item.id === 'wall:wall-1:drywall')?.quantity, 4);
    assert.equal(result.lines[0].quantity, 16);
    assert.equal(result.lines[0].unitCostCents, 1600);
  });

  it('applies egress cut allowance only when egress is No', () => {
    const state = newBasementState();
    state.egress = 'no';
    assert.equal(total(calculateBasement(state)), 250_000);
    state.egress = 'yes';
    assert.equal(total(calculateBasement(state)), 0);
    state.egress = 'unconfirmed';
    assert.ok(calculateBasement(state).issues.some(issue => issue.includes('Confirm whether an egress')));
  });

  it('counts soffit sections by length without inventing a price', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.soffits = [{
      id: 'soffit-17', name: 'Main run', roomName: 'Rec room', lengthFt: 17,
      widthIn: 24, dropHeightIn: 12, exposedFaces: 2,
    }];
    const result = calculateBasement(state);
    assert.equal(result.takeoff.find(item => item.id === 'soffit:soffit-17:plywood')?.quantity, 3);
    assert.equal(result.takeoff.find(item => item.id === 'soffit:soffit-17:lumber')?.quantity, 18);
    assert.equal(total(result), 0);
    assert.ok(result.issues.some(issue => issue.includes('soffit labor/material')));
  });

  it('prices the illustrative electrical mix once with two additive labor days', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.electricalDays = 2;
    state.electricalPoints = [
      ...Array.from({ length: 4 }, (_, index) => point(`can-${index + 1}`, 'can')),
      ...Array.from({ length: 6 }, (_, index) => point(`outlet-${index + 1}`, 'outlet')),
      ...Array.from({ length: 2 }, (_, index) => point(`switch-${index + 1}`, 'switch')),
      point('wall-light-1', 'wall-light'),
      point('hanging-1', 'hanging-light'),
    ];

    const result = calculateBasement(state);
    assert.equal(total(result), 391_200);
    assert.equal(result.lines.filter(line => line.id.endsWith(':wire')).length, 14);
    assert.equal(result.lines.filter(line => line.id === 'electrical:daily-labor').length, 1);
  });

  it('matches the $6,668 partial project direct-cost check', () => {
    const state = newBasementState();
    state.egress = 'no';
    state.walls = [wall()];
    state.electricalDays = 2;
    state.electricalPoints = [
      ...Array.from({ length: 4 }, (_, index) => point(`can-${index + 1}`, 'can')),
      ...Array.from({ length: 6 }, (_, index) => point(`outlet-${index + 1}`, 'outlet')),
      ...Array.from({ length: 2 }, (_, index) => point(`switch-${index + 1}`, 'switch')),
      point('wall-light-1', 'wall-light'),
      point('hanging-1', 'hanging-light'),
    ];
    assert.equal(total(calculateBasement(state)), 666_800);
  });

  it('requires explicit dimensions and does not charge zero or negative wall lengths', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.walls = [wall({ id: 'missing-height', heightFt: null }), wall({ id: 'zero', lengthFt: 0 }), wall({ id: 'negative', lengthFt: -1 })];
    const result = calculateBasement(state);
    assert.equal(total(result), 0);
    assert.ok(result.issues.some(issue => issue.includes('positive wall height')));
    assert.ok(result.issues.some(issue => issue.includes('non-negative segment length')));
    assert.equal(result.takeoff.some(item => item.id === 'wall:zero:studs'), false);
  });

  it('avoids duplicate bathroom/electrical lighting charges until ownership is explicit', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.includeBathrooms = true;
    state.bathrooms.bathrooms[0].vanityLightCount = 1;
    state.electricalPoints = [{ ...point('vanity-point', 'wall-light', 'Bathroom 1'), bathroomId: state.bathrooms.bathrooms[0].id }];
    const pending = calculateBasement(state);
    assert.equal(total(pending), 0);
    assert.ok(pending.issues.some(issue => issue.includes('lighting ownership')));

    state.bathroomLightingOwner = 'bathroom';
    const bathroomOwned = calculateBasement(state);
    assert.equal(total(bathroomOwned), 7_500);
    assert.equal(bathroomOwned.lines.some(line => line.id === 'electrical:vanity-point:wire'), false);

    state.bathroomLightingOwner = 'basement-electrical';
    const electricalOwned = calculateBasement(state);
    assert.equal(total(electricalOwned), 23_800);
    assert.equal(electricalOwned.lines.some(line => line.id.endsWith(':vanity-light')), false);
  });

  it('does not suppress bathroom-linked outlets or switches as if they were shared lights', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.includeBathrooms = true;
    state.bathroomLightingOwner = 'bathroom';
    const bathroom = state.bathrooms.bathrooms[0];
    bathroom.vanityLightCount = 1;
    state.electricalPoints = [
      { ...point('bath-outlet', 'outlet', bathroom.name), bathroomId: bathroom.id },
      { ...point('bath-switch', 'switch', bathroom.name), bathroomId: bathroom.id },
    ];
    state.dailyLaborExcluded = true;

    const result = calculateBasement(state);
    assert.equal(total(result), 56_100);
    assert.equal(result.lines.filter(line => line.id.startsWith('electrical:bath-outlet:')).length, 3);
    assert.equal(result.lines.filter(line => line.id.startsWith('electrical:bath-switch:')).length, 3);
  });

  it('holds linked bathroom light costs unless distinct electrical point IDs match selected counts', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.includeBathrooms = true;
    state.bathroomLightingOwner = 'basement-electrical';
    state.dailyLaborExcluded = true;
    const bathroom = state.bathrooms.bathrooms[0];
    bathroom.vanityLightCount = 3;
    state.electricalPoints = [{ ...point('only-one-light', 'wall-light', bathroom.name), bathroomId: bathroom.id }];

    const mismatch = calculateBasement(state);
    assert.equal(total(mismatch), 0);
    assert.ok(mismatch.issues.some(issue => issue.includes('count is 3, but 1 distinct linked')));
    assert.equal(mismatch.lines.some(line => line.id.includes('only-one-light')), false);

    bathroom.vanityLightCount = 1;
    state.electricalPoints.push({ ...point('second-light', 'hanging-light', bathroom.name), bathroomId: bathroom.id });
    const extra = calculateBasement(state);
    assert.equal(total(extra), 0);
    assert.ok(extra.issues.some(issue => issue.includes('count is 1, but 2 distinct linked')));
  });

  it('prices linked bathroom lights through Basement electrical exactly once when counts match', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.includeBathrooms = true;
    state.bathroomLightingOwner = 'basement-electrical';
    state.dailyLaborExcluded = true;
    const bathroom = state.bathrooms.bathrooms[0];
    bathroom.vanityLightCount = 1;
    bathroom.additionalLightCount = 1;
    bathroom.additionalLightsConfirmedSeparate = true;
    state.electricalPoints = [
      { ...point('vanity-physical-point', 'wall-light', bathroom.name), bathroomId: bathroom.id },
      { ...point('additional-physical-point', 'hanging-light', bathroom.name), bathroomId: bathroom.id },
    ];

    const result = calculateBasement(state);
    assert.equal(total(result), 59_600);
    assert.equal(result.lines.filter(line => line.id.endsWith(':wire')).length, 2);
    assert.equal(result.lines.some(line => line.id.endsWith(':vanity-light') || line.id.endsWith(':additional-lights')), false);
  });

  it('creates UUID-backed default bathroom IDs instead of resettable sequence IDs', () => {
    const first = newBasementState().bathrooms.bathrooms[0].id;
    const second = newBasementState().bathrooms.bathrooms[0].id;
    assert.match(first, /^bathroom-[0-9a-f-]{36}$/i);
    assert.match(second, /^bathroom-[0-9a-f-]{36}$/i);
    assert.notEqual(first, second);
  });

  it('omits optional flooring and bathroom costs unless their modules are selected', () => {
    const state = newBasementState();
    state.egress = 'yes';
    state.includeFlooring = false;
    state.flooring.rooms = [{
      id: 'rec', name: 'Rec room', measuredSqft: 100, existingType: 'carpet', demolition: false,
      demolitionAreaOverride: null, otherDemoDescription: '', otherDemoRateCents: null, substrate: 'concrete',
      package: 'lvp-median', wastePercent: 0, packageSizeSqft: null, installedAreaOverride: null,
      carpetMaterialQuantitySqft: null, materialRateOverrideCents: null, materialUnitOverride: null, installRateOverrideCents: null,
      baseboardMode: 'none', baseboardLft: 0, reinstallRateCents: null, pad: 'none', padRateCents: null,
    }];
    assert.equal(total(calculateBasement(state)), 0);
    state.includeFlooring = true;
    assert.equal(total(calculateBasement(state)), 55_000);
  });
});