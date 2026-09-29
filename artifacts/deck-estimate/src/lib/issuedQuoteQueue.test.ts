import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeIssuedQuoteProgress, resumedIssuedQuoteDelivery, type IssuedQuoteDelivery } from './intakeQueue';
import {
  activeDeliveryRecords,
  decideIntakeResponse,
  deliveriesForConnection,
  latestRetryDeadline,
  intakeIsConfigured,
  intakePauseFromStatus,
  markDeliverySent,
  nextPendingDelivery,
  nextDeliveryPart,
  planManualSync,
  quoteConnectionKey,
  queueSummary,
  supersedeOlderUnsent,
  supersedeIncomingIfNewerQueued,
  transitionAfterResponse,
  withExclusiveLock,
} from './issuedQuoteQueue';

function record(revision: number, overrides: Partial<IssuedQuoteDelivery> = {}): IssuedQuoteDelivery {
  return {
    key: `quote-${revision}`,
    kind: 'issued-quote',
    userId: 'user',
    slug: 'flooring',
    draftId: 'draft',
    revision,
    sourceId: 'source',
    sourceKey: 'user:source',
    deliveryId: `delivery-${revision}`,
    identityJson: '{}',
    proposalJson: '{}',
    takeoffJson: '{}',
    issuedAt: new Date(revision * 1000).toISOString(),
    identityDone: false,
    proposalDone: false,
    takeoffDone: false,
    state: 'queued',
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('issued quote queue state machine', () => {
  it('recognizes the explicit paused marker but not ordinary 503 responses', () => {
    assert.deepEqual(decideIntakeResponse({
      status: 503,
      body: { paused: true, reason: 'estimator_sync_disabled', retryAfterSeconds: 3600 },
    }), { kind: 'paused', retryAfterSeconds: 3600 });
    assert.deepEqual(decideIntakeResponse({
      status: 503,
      body: { error: 'temporary outage', retryAfterSeconds: 12 },
    }), { kind: 'transient', retryAfterSeconds: 12 });
    assert.equal(decideIntakeResponse({
      status: 200,
      body: { paused: true, reason: 'estimator_sync_disabled' },
    }).kind, 'attention');
    assert.equal(decideIntakeResponse({
      status: 401,
      body: { paused: true, reason: 'estimator_sync_disabled' },
    }).kind, 'attention');
  });

  it('bounds ordinary retry-after and surfaces auth/conflict as attention', () => {
    assert.deepEqual(decideIntakeResponse({ status: 429, body: { retryAfterSeconds: 90000 } }),
      { kind: 'transient', retryAfterSeconds: 3600 });
    assert.equal(decideIntakeResponse({ status: 401, body: { error: 'revoked' } }).kind, 'attention');
    assert.equal(decideIntakeResponse({ status: 409, body: { error: 'key conflict' } }).kind, 'attention');
  });

  it('honors paused Retry-After up to 24 hours and defaults missing pause delay to one hour', () => {
    assert.deepEqual(decideIntakeResponse({
      status: 503,
      body: { paused: true, reason: 'estimator_sync_disabled', retryAfterSeconds: 86_400 },
    }), { kind: 'paused', retryAfterSeconds: 86_400 });
    assert.deepEqual(decideIntakeResponse({
      status: 503,
      body: { paused: true, reason: 'estimator_sync_disabled' },
    }), { kind: 'paused', retryAfterSeconds: 3600 });
    assert.deepEqual(decideIntakeResponse({ status: 429, body: null, retryAfterHeader: '7200' }),
      { kind: 'transient', retryAfterSeconds: 3600 });
  });

  it('preserves frozen paused bytes and delivery IDs while setting a retry window', () => {
    const original = record(1);
    const transition = transitionAfterResponse(original, 'identity', {
      kind: 'paused', retryAfterSeconds: 60,
    }, 0);
    assert.equal(transition.record.identityJson, original.identityJson);
    assert.equal(transition.record.deliveryId, original.deliveryId);
    assert.equal(transition.record.state, 'paused');
    assert.equal(transition.connection?.retryAt, new Date(60_000).toISOString());
  });

  it('only supersedes an untouched queued older revision of the same source', () => {
    const records = [
      record(1),
      record(2, { identityDone: true }),
      record(3, { state: 'paused' }),
      record(4, { sourceKey: 'another-source' }),
      record(5, { identitySent: true, state: 'sent' }),
    ];
    const result = supersedeOlderUnsent(records, record(5));
    assert.equal(result[0].state, 'superseded');
    assert.equal(result[0].identityJson, records[0].identityJson);
    assert.equal(result[1].state, 'queued');
    assert.equal(result[2].state, 'paused');
    assert.equal(result[3].state, 'queued');
    assert.equal(result[4].state, 'sent');
  });

  it('sends identity before documents and counts waiting snapshots without claiming verification', () => {
    const item = record(2);
    assert.equal(nextDeliveryPart(item), 'identity');
    const acceptedIdentity = transitionAfterResponse(item, 'identity', { kind: 'accepted', replayed: true }).record;
    assert.equal(nextDeliveryPart(acceptedIdentity), 'proposal');
    assert.deepEqual(queueSummary([item], 120_000), { count: 3, oldestAgeMs: 120_000 });
  });

  it('probes only the globally oldest pending part across estimator modules', () => {
    const newerBathroom = record(2, {
      slug: 'bathroom',
      key: 'bathroom-new',
      issuedAt: new Date(20_000).toISOString(),
      identityDone: true,
      proposalDone: true,
    });
    const oldestFlooring = record(1, {
      slug: 'flooring',
      key: 'flooring-old',
      issuedAt: new Date(10_000).toISOString(),
      identityDone: true,
    });
    const plan = planManualSync([newerBathroom, oldestFlooring], true, new Date(0).toISOString(), 50_000);
    assert.equal(plan.kind, 'probe');
    if (plan.kind === 'probe') {
      assert.equal(plan.next.record.key, 'flooring-old');
      assert.equal(plan.next.part, 'proposal');
    }
    assert.deepEqual(activeDeliveryRecords([newerBathroom, oldestFlooring]).map(item => item.key),
      ['flooring-old', 'bathroom-new']);
  });

  it('recovers an in-flight sent request by resending its same pending part', () => {
    const beforeCrash = markDeliverySent(record(1), 'identity');
    const recovered = nextPendingDelivery([beforeCrash]);
    assert.equal(recovered?.record.key, beforeCrash.key);
    assert.equal(recovered?.record.identityJson, beforeCrash.identityJson);
    assert.equal(recovered?.record.deliveryId, beforeCrash.deliveryId);
    assert.equal(recovered?.part, 'identity');
    assert.equal(beforeCrash.identitySent, true);
  });

  it('prevents an old recovered revision from sending after a newer queued revision', () => {
    const newer = record(8, { issuedAt: new Date(20_000).toISOString() });
    const recoveredOlder = record(1, { issuedAt: new Date(10_000).toISOString() });
    assert.equal(supersedeIncomingIfNewerQueued([newer], recoveredOlder).state, 'superseded');
    assert.equal(supersedeIncomingIfNewerQueued([newer], record(1, {
      issuedAt: new Date(10_000).toISOString(), identitySent: true, state: 'sent',
    })).state, 'sent');
  });

  it('atomically merges progress without regressing accepted receipt flags', () => {
    const accepted = record(1, { identityDone: true, identitySent: true });
    const staleTab = record(1, { state: 'queued' });
    const merged = mergeIssuedQuoteProgress(accepted, staleTab);
    assert.equal(merged.identityDone, true);
    assert.equal(merged.identitySent, true);
    assert.equal(mergeIssuedQuoteProgress(
      record(2, { identitySent: true, state: 'sent' }),
      record(2, { state: 'superseded' }),
    ).state, 'sent');
    assert.throws(() => mergeIssuedQuoteProgress(accepted, {
      ...staleTab,
      proposalJson: '{"different":true}',
    }), /different frozen request bodies/);
  });

  it('resumes paused records atomically without stale saves re-pausing them', () => {
    const paused = record(1, { state: 'paused', retryAt: new Date(60_000).toISOString() });
    const resumed = resumedIssuedQuoteDelivery(paused);
    assert.equal(resumed.state, 'queued');
    assert.equal(resumed.retryAt, undefined);
    assert.equal(resumed.resumeGeneration, 1);
    const staleTabSave = mergeIssuedQuoteProgress(resumed, paused);
    assert.equal(staleTabSave.state, 'queued');
    assert.equal(staleTabSave.resumeGeneration, 1);
    assert.equal(nextPendingDelivery([staleTabSave])?.part, 'identity');
    assert.equal(planManualSync([staleTabSave], false).kind, 'drain');
    const subsequentPause = mergeIssuedQuoteProgress(resumed, {
      ...resumed,
      state: 'paused',
      retryAt: new Date(120_000).toISOString(),
    });
    assert.equal(subsequentPause.state, 'paused');
  });

  it('fails closed without an exclusive sender lock and runs only under a claim', async () => {
    let ran = false;
    assert.equal(await withExclusiveLock(null, 'test', async () => { ran = true; }), false);
    assert.equal(ran, false);
    const denied = { request: async (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null) };
    assert.equal(await withExclusiveLock(denied as never, 'test', async () => { ran = true; }), false);
    assert.equal(ran, false);
    const granted = { request: async (_name: string, _options: unknown, callback: (lock: {}) => Promise<void>) => callback({}) };
    assert.equal(await withExclusiveLock(granted as never, 'test', async () => { ran = true; }), true);
    assert.equal(ran, true);
  });

  it('shares one pause marker key across all estimator modules and gates unprovisioned intake', () => {
    assert.equal(quoteConnectionKey('user'), 'quote-connection:user');
    const mixedModules = [
      record(1, { slug: 'flooring' }),
      record(2, { slug: 'bathroom' }),
      record(3, { slug: 'basement' }),
      record(4, { userId: 'someone-else', slug: 'flooring' }),
    ];
    assert.deepEqual(deliveriesForConnection(mixedModules, 'user').map(item => item.slug),
      ['flooring', 'bathroom', 'basement']);
    assert.equal(intakeIsConfigured({ configured: true }), true);
    assert.equal(intakeIsConfigured({ configured: false }), false);
    assert.equal(intakeIsConfigured({}), false);
    assert.deepEqual(intakePauseFromStatus({ paused: false }, 0), { paused: false });
    const orgPause = intakePauseFromStatus({ paused: true, retryAfterSeconds: 30 }, 0);
    assert.equal(orgPause.retryAt, new Date(30_000).toISOString());
    assert.equal(planManualSync([record(5)], orgPause.paused, orgPause.retryAt, 1_000).kind, 'wait');
    assert.equal(intakePauseFromStatus({ paused: true }, 0).retryAt,
      new Date(3_600_000).toISOString());
  });

  it('waits for the full pause Retry-After before allowing one probe', () => {
    const waiting = planManualSync([record(1)], true, new Date(86_400_000).toISOString(), 60_000);
    assert.equal(waiting.kind, 'wait');
    const ready = planManualSync([record(1)], true, new Date(86_400_000).toISOString(), 86_400_000);
    assert.equal(ready.kind, 'probe');
    const missingLegacyDeadline = planManualSync([record(1)], true, undefined, 0);
    assert.equal(missingLegacyDeadline.kind, 'wait');
    if (missingLegacyDeadline.kind === 'wait') {
      assert.equal(missingLegacyDeadline.retryAt, new Date(3_600_000).toISOString());
    }
    assert.equal(latestRetryDeadline([
      new Date(60_000).toISOString(),
      new Date(3_600_000).toISOString(),
    ]), new Date(3_600_000).toISOString());
  });

  it('retains other document work after one document is reported stale', () => {
    const identityAccepted = transitionAfterResponse(
      record(3), 'identity', { kind: 'accepted', replayed: false },
    ).record;
    const proposalStale = transitionAfterResponse(
      identityAccepted, 'proposal', { kind: 'stale' },
    ).record;
    assert.equal(proposalStale.state, 'queued');
    assert.equal(nextDeliveryPart(proposalStale), 'takeoff');
    const allResolved = transitionAfterResponse(
      proposalStale, 'takeoff', { kind: 'accepted', replayed: false },
    ).record;
    assert.equal(allResolved.state, 'stale');
    assert.equal(allResolved.proposalJson, record(3).proposalJson);
  });
});