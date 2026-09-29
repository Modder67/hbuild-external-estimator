import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addBathroomToState, calculateBathroom, duplicateBathroomInState, newBathroomState } from './Bathroom';

describe('calculateBathroom', () => {
  it('allocates fresh IDs when adding to a restored state and duplicating a bathroom', () => {
    const restoredState = newBathroomState();
    restoredState.bathrooms[0].id = 'bathroom-2';

    const withAddedRoom = addBathroomToState(restoredState);
    const addedId = withAddedRoom.bathrooms[1].id;
    assert.notEqual(addedId, restoredState.bathrooms[0].id);

    const withDuplicate = duplicateBathroomInState(withAddedRoom, withAddedRoom.bathrooms[0]);
    const ids = withDuplicate.bathrooms.map(bathroom => bathroom.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('keeps demolition measurements independent from new installation takeoff', () => {
    const state = newBathroomState();
    const bathroom = state.bathrooms[0];
    bathroom.demoTileSurround = true;
    bathroom.wallDemoSqFt = 90;
    bathroom.wallHeightFt = 8;
    bathroom.panDemoInScope = true;
    bathroom.existingPanDemoSqFt = 15;
    bathroom.newWallInstallSqFt = 90;

    const result = calculateBathroom(state);
    assert.equal(result.lines.reduce((sum, line) => sum + line.totalCents, 0), 49_500);
    assert.equal(result.takeoff.find(line => line.label.includes('backerboard sheets'))?.quantity, 6);
    assert.equal(result.takeoff.find(line => line.label.startsWith('Wall tile'))?.quantity, 90);
    assert.ok(!result.takeoff.some(line => line.quantity === 720));
  });

  it('adds mutually exclusive drywall and optional fixture allowances exactly once', () => {
    const state = newBathroomState();
    const bathroom = state.bathrooms[0];
    bathroom.drywallRepair = 'simple';
    bathroom.replaceTrap = true;
    bathroom.replaceFaucet = true;
    bathroom.vanityLightCount = 1;
    bathroom.towelBarCount = 2;
    bathroom.towelBarOwnerSupplied = true;
    bathroom.mirrorCount = 1;
    bathroom.mirrorOwnerSupplied = true;
    bathroom.additionalLightCount = 1;
    bathroom.additionalLightsConfirmedSeparate = true;

    const result = calculateBathroom(state);
    assert.equal(result.lines.reduce((sum, line) => sum + line.totalCents, 0), 154_000);
    assert.equal(result.lines.filter(line => line.id.endsWith(':drywall-simple')).length, 1);
    assert.equal(result.lines.some(line => line.id.endsWith(':drywall-other')), false);
  });

  it('does not apply the unconfirmed pan correction and calculates confirmed inches correctly', () => {
    const state = newBathroomState();
    const bathroom = state.bathrooms[0];
    bathroom.newPanWidthIn = 60;
    bathroom.newPanDepthIn = 36;

    const pending = calculateBathroom(state);
    assert.ok(pending.issues.some(issue => issue.includes('adjustment is unresolved')));
    assert.equal(pending.takeoff.some(line => line.id.endsWith(':new-pan-area')), false);

    bathroom.panAdjustmentPolicy = 'minus-one-inch-total-each-dimension';
    const confirmed = calculateBathroom(state);
    const pan = confirmed.takeoff.find(line => line.id.endsWith(':new-pan-area'));
    assert.ok(pan);
    assert.ok(Math.abs(pan.quantity - 14.3402777778) < 0.000000001);
  });

  it('rounds backerboard at 15 square feet and beyond, and flags missing rates', () => {
    const state = newBathroomState();
    const bathroom = state.bathrooms[0];
    bathroom.newWallInstallSqFt = 15;
    const exact = calculateBathroom(state);
    assert.equal(exact.takeoff.find(line => line.id.endsWith(':backerboard-sheets'))?.quantity, 1);

    bathroom.newWallInstallSqFt = 15.1;
    const over = calculateBathroom(state);
    assert.equal(over.takeoff.find(line => line.id.endsWith(':backerboard-sheets'))?.quantity, 2);
    assert.ok(over.issues.some(issue => issue.includes('rates are missing')));
    assert.ok(over.lines.every(line => line.label !== 'Wall tile' && line.label !== 'Backerboard'));
  });

  it('holds overlapping additional-light pricing until separation is confirmed', () => {
    const state = newBathroomState();
    const bathroom = state.bathrooms[0];
    bathroom.vanityLightCount = 1;
    bathroom.additionalLightCount = 1;
    const pending = calculateBathroom(state);
    assert.equal(pending.lines.some(line => line.id.endsWith(':additional-lights')), false);

    bathroom.additionalLightsConfirmedSeparate = true;
    const confirmed = calculateBathroom(state);
    assert.equal(confirmed.lines.filter(line => line.id.endsWith(':vanity-light')).length, 1);
    assert.equal(confirmed.lines.filter(line => line.id.endsWith(':additional-lights')).length, 1);
  });

  it('does not create priced lines for invalid negative quantities', () => {
    const state = newBathroomState();
    const bathroom = state.bathrooms[0];
    bathroom.demoTileSurround = true;
    bathroom.wallDemoSqFt = -2;
    const result = calculateBathroom(state);
    assert.equal(result.lines.some(line => line.id.endsWith(':wall-demolition')), false);
    assert.ok(result.issues.some(issue => issue.includes('non-negative')));
  });
});