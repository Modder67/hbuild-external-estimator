import {
  loadAllIntakeRecords,
  deleteIntakeRecord,
  saveIssuedQuoteDelivery,
  saveQuoteQueueConnectionRecord,
  type IssuedQuoteDelivery,
  type IssuedQuoteQueueState,
  type QuoteQueueConnectionRecord,
} from './intakeQueue';

export type QuoteQueueConnection = {
  paused: boolean;
  reason?: 'estimator_sync_disabled';
  retryAt?: string;
};

export function quoteConnectionKey(userId: string) {
  return `quote-connection:${userId}`;
}

export function isQuoteQueueConnectionRecord(value: unknown): value is QuoteQueueConnectionRecord {
  return Boolean(value && typeof value === 'object' &&
    (value as QuoteQueueConnectionRecord).kind === 'quote-connection');
}

export async function persistQuoteQueueConnection(
  userId: string,
  connection: QuoteQueueConnection,
): Promise<void> {
  const key = quoteConnectionKey(userId);
  if (!connection.paused) {
    await deleteIntakeRecord(key);
    const oldMarkers = (await loadAllIntakeRecords())
      .filter(isQuoteQueueConnectionRecord)
      .filter(record => record.userId === userId);
    for (const marker of oldMarkers) {
      if (marker.key !== key) await deleteIntakeRecord(marker.key);
    }
    return;
  }
  const record: QuoteQueueConnectionRecord = {
    key,
    kind: 'quote-connection',
    userId,
    paused: true,
    reason: connection.reason,
    retryAt: connection.retryAt,
  };
  // The record uses the same durable object store and never overwrites delivery records.
  await saveQuoteQueueConnectionRecord(record);
}

export type IssuedRevision = { draftId: string; revision: number; issuedAt: string };
export type FrozenDelivery = {
  identityJson: unknown;
  proposalJson: unknown;
  takeoffJson: unknown;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function buildIssuedQuoteDelivery(
  frozen: FrozenDelivery,
  owner: { userId: string; slug: IssuedQuoteDelivery['slug'] },
  quote: IssuedRevision,
  now = new Date().toISOString(),
): IssuedQuoteDelivery {
  const identity = objectValue(frozen.identityJson);
  const proposal = objectValue(frozen.proposalJson);
  const takeoff = objectValue(frozen.takeoffJson);
  const sourceId = identity?.sourceId;
  const deliveryId = identity?.deliveryId;
  if (typeof sourceId !== 'string' || !sourceId || typeof deliveryId !== 'string' || !deliveryId ||
      !proposal || !takeoff || !objectValue(proposal.document) || !objectValue(takeoff.document)) {
    throw new Error('The issued revision returned an incomplete frozen HBUILD delivery. It was not queued or sent.');
  }
  if (typeof proposal.deliveryId !== 'string' || typeof takeoff.deliveryId !== 'string' ||
      !proposal.deliveryId || !takeoff.deliveryId ||
      proposal.sourceId !== sourceId || takeoff.sourceId !== sourceId) {
    throw new Error('The frozen delivery is missing its original document delivery IDs. It was not queued or sent.');
  }
  return {
    key: `issued-quote:${owner.userId}:${quote.draftId}:${quote.revision}`,
    kind: 'issued-quote',
    userId: owner.userId,
    slug: owner.slug,
    draftId: quote.draftId,
    revision: quote.revision,
    sourceId,
    sourceKey: `${owner.userId}:${sourceId}`,
    deliveryId,
    identityJson: JSON.stringify(frozen.identityJson),
    proposalJson: JSON.stringify(frozen.proposalJson),
    takeoffJson: JSON.stringify(frozen.takeoffJson),
    issuedAt: quote.issuedAt,
    identityDone: false,
    proposalDone: false,
    takeoffDone: false,
    state: 'queued',
    createdAt: now,
  };
}

export function isIssuedQuoteDelivery(value: unknown): value is IssuedQuoteDelivery {
  return Boolean(value && typeof value === 'object' && (value as IssuedQuoteDelivery).kind === 'issued-quote');
}

export function deliveriesForConnection(
  records: unknown[],
  userId: string,
): IssuedQuoteDelivery[] {
  return records.filter(isIssuedQuoteDelivery).filter(record => record.userId === userId);
}

export function hasReceipts(record: IssuedQuoteDelivery): boolean {
  return record.identityDone || record.proposalDone || record.takeoffDone;
}

function immutableIssueTime(record: IssuedQuoteDelivery): number {
  return Date.parse(record.issuedAt ?? record.createdAt);
}

export function supersedeOlderUnsent(
  records: IssuedQuoteDelivery[],
  incoming: IssuedQuoteDelivery,
): IssuedQuoteDelivery[] {
  if (incoming.state !== 'queued') return records;
  const incomingAt = immutableIssueTime(incoming);
  return records.map(record => {
    const recordAt = immutableIssueTime(record);
    if (record.sourceKey !== incoming.sourceKey || !Number.isFinite(recordAt) ||
        !Number.isFinite(incomingAt) || recordAt >= incomingAt ||
        record.state !== 'queued' || record.retryAt || record.lastError || hasReceipts(record) ||
        record.identitySent || record.proposalSent || record.takeoffSent ||
        record.identityStale || record.proposalStale || record.takeoffStale ||
        record.identityAttention || record.proposalAttention || record.takeoffAttention) return record;
    return { ...record, state: 'superseded' };
  });
}

export function persistIssuedQuoteDelivery(incoming: IssuedQuoteDelivery): Promise<void> {
  return loadAllIntakeRecords().then(async all => {
    const existing = all.filter(isIssuedQuoteDelivery);
    const queuedIncoming = supersedeIncomingIfNewerQueued(existing, incoming);
    const superseded = supersedeOlderUnsent(existing, queuedIncoming);
    // Commit the replacement first so an interrupted write can never strand the old item alone.
    await saveIssuedQuoteDelivery(queuedIncoming);
    for (const record of superseded) {
      const previous = existing.find(item => item.key === record.key);
      if (previous && record.state !== previous.state) await saveIssuedQuoteDelivery(record);
    }
  });
}

export function supersedeIncomingIfNewerQueued(
  existing: IssuedQuoteDelivery[],
  incoming: IssuedQuoteDelivery,
): IssuedQuoteDelivery {
  if (incoming.state !== 'queued' || hasReceipts(incoming) || incoming.identitySent ||
      incoming.proposalSent || incoming.takeoffSent || incoming.retryAt || incoming.lastError) return incoming;
  const incomingAt = immutableIssueTime(incoming);
  const newerQueued = Number.isFinite(incomingAt) && existing.some(record =>
    record.sourceKey === incoming.sourceKey &&
    Number.isFinite(immutableIssueTime(record)) &&
    immutableIssueTime(record) > incomingAt &&
    ['queued', 'sent', 'paused'].includes(record.state) &&
    pendingDeliveryCount(record) > 0);
  return newerQueued ? { ...incoming, state: 'superseded' } : incoming;
}

export function intakeIsConfigured(value: unknown): boolean {
  return objectValue(value)?.configured === true;
}

export function intakePauseFromStatus(value: unknown, now = Date.now()): QuoteQueueConnection {
  const body = objectValue(value);
  if (body?.paused !== true) return { paused: false };
  const retry = body.retryAfterSeconds;
  const retryAfterSeconds = typeof retry === 'number' && Number.isFinite(retry) && retry >= 0
    ? Math.min(86_400, Math.ceil(retry))
    : 3600;
  return {
    paused: true,
    reason: 'estimator_sync_disabled',
    retryAt: retryDeadline(now, retryAfterSeconds),
  };
}

export function queueSummary(records: IssuedQuoteDelivery[], now = Date.now()) {
  const waiting = records.filter(record => pendingDeliveryCount(record) > 0);
  const count = waiting.reduce((total, record) => total + pendingDeliveryCount(record), 0);
  const oldest = waiting.reduce<number | null>((value, record) => {
    const created = Date.parse(record.createdAt);
    return Number.isFinite(created) && (value === null || created < value) ? created : value;
  }, null);
  return { count, oldestAgeMs: oldest === null ? null : Math.max(0, now - oldest) };
}

export function activeDeliveryRecords(records: IssuedQuoteDelivery[]): IssuedQuoteDelivery[] {
  return records
    .filter(record => ['queued', 'sent', 'paused'].includes(record.state))
    .sort((a, b) => immutableIssueTime(a) - immutableIssueTime(b) ||
      a.key.localeCompare(b.key));
}

export function nextDeliveryPart(record: IssuedQuoteDelivery): 'identity' | 'proposal' | 'takeoff' | null {
  if (record.identityStale) return null;
  if (!record.identityDone) return 'identity';
  if (!record.proposalDone && !record.proposalStale) return 'proposal';
  if (!record.takeoffDone && !record.takeoffStale) return 'takeoff';
  return null;
}

export function pendingDeliveryCount(record: IssuedQuoteDelivery): number {
  if (record.state === 'superseded' || record.state === 'stale' || record.state === 'receipts-accepted') return 0;
  return Number(!record.identityDone && !record.identityStale) +
    Number(!record.proposalDone && !record.proposalStale) +
    Number(!record.takeoffDone && !record.takeoffStale);
}

export function nextPendingDelivery(records: IssuedQuoteDelivery[]) {
  const first = records
    .filter(record => pendingDeliveryCount(record) > 0)
    .sort((a, b) => immutableIssueTime(a) - immutableIssueTime(b) || a.key.localeCompare(b.key))[0];
  if (!first || first.state === 'needs-attention') return null;
  const part = nextDeliveryPart(first);
  return part ? { record: first, part } : null;
}

export function planManualSync(
  records: IssuedQuoteDelivery[],
  paused: boolean,
  retryAt?: string,
  now = Date.now(),
):
  | { kind: 'wait'; retryAt: string }
  | { kind: 'attention' }
  | { kind: 'empty' }
  | { kind: 'probe'; next: NonNullable<ReturnType<typeof nextPendingDelivery>> }
  | { kind: 'drain'; next: NonNullable<ReturnType<typeof nextPendingDelivery>> } {
  if (paused) {
    const effectiveRetryAt = retryAt && Number.isFinite(Date.parse(retryAt))
      ? retryAt : retryDeadline(now, 3600);
    if (!retryDeadlineExpired(effectiveRetryAt, now)) return { kind: 'wait', retryAt: effectiveRetryAt };
  }
  const next = nextPendingDelivery(records);
  if (!next) return records.some(record => pendingDeliveryCount(record) > 0)
    ? { kind: 'attention' } : { kind: 'empty' };
  return paused ? { kind: 'probe', next } : { kind: 'drain', next };
}

export function markDeliverySent(
  record: IssuedQuoteDelivery,
  part: 'identity' | 'proposal' | 'takeoff',
): IssuedQuoteDelivery {
  return { ...record, state: 'sent', [`${part}Sent`]: true };
}

export async function withExclusiveQuoteSender(
  userId: string,
  action: () => Promise<void>,
): Promise<boolean> {
  const manager = typeof navigator === 'undefined' ? null : navigator.locks;
  return withExclusiveLock(manager, `hbuild-intake-sender:${userId}`, action);
}

export async function withExclusiveLock(
  manager: Pick<LockManager, 'request'> | null | undefined,
  name: string,
  action: () => Promise<void>,
): Promise<boolean> {
  if (!manager) return false;
  let acquired = false;
  await manager.request(
    name,
    { mode: 'exclusive', ifAvailable: true },
    async lock => {
      if (!lock) return;
      acquired = true;
      await action();
    },
  );
  return acquired;
}

export type IntakeResponseDecision =
  | { kind: 'accepted'; replayed: boolean }
  | { kind: 'stale' }
  | { kind: 'paused'; retryAfterSeconds: number }
  | { kind: 'transient'; retryAfterSeconds: number }
  | { kind: 'attention'; message: string };

export function decideIntakeResponse(input: {
  status: number;
  body: unknown;
  retryAfterHeader?: string | null;
}): IntakeResponseDecision {
  const body = objectValue(input.body);
  const pausedResponse = input.status === 503 &&
    body?.paused === true && body.reason === 'estimator_sync_disabled';
  const retry = typeof body?.retryAfterSeconds === 'number'
    ? body.retryAfterSeconds
    : parseRetryAfter(input.retryAfterHeader);
  const maxRetry = pausedResponse ? 86_400 : 3_600;
  const fallback = pausedResponse ? 3_600 : 60;
  const boundedRetry = Math.max(1, Math.min(maxRetry, Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : fallback));
  if (input.status === 401 || input.status === 409) {
    const error = body?.error;
    const message = typeof error === 'string' ? error
      : typeof objectValue(error)?.message === 'string' ? String(objectValue(error)?.message)
        : `HBUILD requires attention (HTTP ${input.status}).`;
    return { kind: 'attention', message };
  }
  if (pausedResponse) {
    return { kind: 'paused', retryAfterSeconds: boundedRetry };
  }
  if (!input.status || input.status === 429 || input.status === 503 || input.status >= 500) {
    return { kind: 'transient', retryAfterSeconds: boundedRetry };
  }
  if (input.status < 200 || input.status >= 300) {
    const error = body?.error;
    return { kind: 'attention', message: typeof error === 'string' ? error : `HBUILD rejected delivery (HTTP ${input.status}).` };
  }
  if (body?.outcome === 'stale') return { kind: 'stale' };
  if (body?.outcome === 'applied') return { kind: 'accepted', replayed: body.replayed === true };
  return { kind: 'attention', message: 'HBUILD returned an unknown receipt. Acceptance is unconfirmed.' };
}

function parseRetryAfter(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : Number.NaN;
}

export function retryDeadline(now: number, retryAfterSeconds: number): string {
  return new Date(now + retryAfterSeconds * 1000).toISOString();
}

export function retryDeadlineExpired(retryAt: string | undefined, now = Date.now()): boolean {
  return Boolean(retryAt && Number.isFinite(Date.parse(retryAt)) && Date.parse(retryAt) <= now);
}

export function latestRetryDeadline(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

export function transitionAfterResponse(
  record: IssuedQuoteDelivery,
  part: 'identity' | 'proposal' | 'takeoff',
  decision: IntakeResponseDecision,
  now = Date.now(),
): { record: IssuedQuoteDelivery; connection?: QuoteQueueConnection } {
  const next = { ...record };
  if (decision.kind === 'paused') {
    next.state = 'paused';
    next.retryAt = retryDeadline(now, decision.retryAfterSeconds);
    next.lastError = undefined;
    return {
      record: next,
      connection: {
        paused: true,
        reason: 'estimator_sync_disabled',
        retryAt: next.retryAt,
      },
    };
  }
  if (decision.kind === 'transient') {
    next.state = 'queued';
    next.retryAt = retryDeadline(now, decision.retryAfterSeconds);
    next.lastError = `Temporary HBUILD response. Try again after ${next.retryAt}.`;
    return { record: next };
  }
  if (decision.kind === 'attention') {
    next.state = 'needs-attention';
    next.retryAt = undefined;
    next[`${part}Attention`] = decision.message;
    next.lastError = decision.message;
    return { record: next };
  }
  if (decision.kind === 'stale') {
    next[`${part}Stale`] = true;
    next.retryAt = undefined;
    next.lastError = `HBUILD marked the ${part} delivery stale.`;
    next.state = part === 'identity' || nextDeliveryPart(next) === null ? 'stale' : 'queued';
    return { record: next };
  }
  next[`${part}Done`] = true;
  next.retryAt = undefined;
  const allResolved = (next.identityDone || next.identityStale) &&
    (next.proposalDone || next.proposalStale) && (next.takeoffDone || next.takeoffStale);
  const hasStale = Boolean(next.identityStale || next.proposalStale || next.takeoffStale);
  if (allResolved && hasStale) {
    next.state = 'stale';
  } else if (allResolved) {
    next.state = 'receipts-accepted';
    next.lastError = undefined;
  } else {
    next.state = 'queued';
    next.lastError = undefined;
  }
  return { record: next };
}

export function stateLabel(state: IssuedQuoteQueueState): string {
  switch (state) {
    case 'queued': return 'Queued';
    case 'sent': return 'Sending · retry-safe recovery retained';
    case 'paused': return 'Paused';
    case 'needs-attention': return 'Needs attention';
    case 'stale': return 'Stale';
    case 'superseded': return 'Superseded by newer queued revision';
    case 'receipts-accepted': return 'Receipts accepted · readback unverified';
  }
}