import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EstimateState } from '@/lib/pricing';
import { deckProjectFromState, deckStateFromProject } from './deckProject';

const state: EstimateState = {
  sourceId: 'source-deck',
  clientSourceId: 'client-deck',
  projectId: undefined,
  projectName: undefined,
  jobDetails: {
    salesperson: 'Estimator',
    firstName: 'Ada',
    lastName: 'Lovelace',
    jobCode: 'DECK-7',
    addressLine1: '1 Main St',
    addressLine2: 'Unit 2',
    city: 'Denver',
    region: 'CO',
    postalCode: '80202',
    customerName: 'Ada Lovelace',
    customerAddress: '1 Main St, Unit 2, Denver CO 80202',
    jobTitle: 'Deck rebuild',
    date: '2026-01-10',
  },
  measurements: {
    ledger: [12, 4], framing: [20], pictureFrame: [8], deckArea: [240],
    joistCount: [3], beam: [10], postCount: [4], caissons: [4],
    rail8: [2], rail10: [1], stair6: [1], stair8: [0], stair10: [0],
  },
  joistSize: '2×10',
  lumberSelections: { ledger: '2x10x12-tf', framing: '2x12x16-tf', joist: '2x12x12-tf', beam: 'microlam', post: '6x6' },
  stairPosts: { left: 1, middle: 2, right: 1, center: 0 },
  materialTier: 'premium',
  addons: [{ id: 'stairs', name: 'Stairs', enabled: true, qty: 3, basePrice: 95, priceOverride: 110 }],
  selectedMarkup: 'better',
};

describe('Deck shared project mapping', () => {
  it('sends the complete Deck form as scope and preserves project IDs and identity on restore', () => {
    const project = deckProjectFromState(state);
    assert.equal(project.sourceId, state.sourceId);
    assert.equal(project.clientSourceId, state.clientSourceId);
    assert.deepEqual(project.scope, state);
    assert.equal(project.firstName, state.jobDetails.firstName);
    assert.equal(project.lastName, state.jobDetails.lastName);
    assert.equal(project.projectName, state.jobDetails.jobTitle);

    const restored = deckStateFromProject(project);
    assert.deepEqual(restored, state);
  });
});