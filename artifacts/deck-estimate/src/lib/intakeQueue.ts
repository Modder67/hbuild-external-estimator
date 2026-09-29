export type PendingIntake = {
  key: string;
  fingerprint: string;
  identityJson: string;
  proposalJson: string;
  takeoffJson: string | null;
  identityDone: boolean;
  proposalDone: boolean;
  takeoffDone: boolean;
};

export type IssuedQuoteQueueState = 'queued' | 'sent' | 'paused' | 'needs-attention' | 'stale' | 'superseded' | 'receipts-accepted';

export type IssuedQuoteDelivery = {
  key: string;
  kind: 'issued-quote';
  userId: string;
  slug: 'deck' | 'flooring' | 'bathroom' | 'basement';
  draftId: string;
  revision: number;
  sourceId: string;
  sourceKey: string;
  deliveryId: string;
  identityJson: string;
  proposalJson: string;
  takeoffJson: string;
  issuedAt?: string;
  identityDone: boolean;
  proposalDone: boolean;
  takeoffDone: boolean;
  identitySent?: boolean;
  proposalSent?: boolean;
  takeoffSent?: boolean;
  identityStale?: boolean;
  proposalStale?: boolean;
  takeoffStale?: boolean;
  identityAttention?: string;
  proposalAttention?: string;
  takeoffAttention?: string;
  resumeGeneration?: number;
  state: IssuedQuoteQueueState;
  createdAt: string;
  retryAt?: string;
  lastError?: string;
};

export type QuoteQueueConnectionRecord = {
  key: string;
  kind: 'quote-connection';
  userId: string;
  paused: boolean;
  reason?: 'estimator_sync_disabled';
  retryAt?: string;
};

export type IntakeQueueRecord = PendingIntake | IssuedQuoteDelivery | QuoteQueueConnectionRecord;

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hbuild-estimator-intake', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('deliveries')) {
        request.result.createObjectStore('deliveries', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadIntake(key: string): Promise<PendingIntake | undefined> {
  const db = await openQueue();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readonly');
      const request = tx.objectStore('deliveries').get(key);
      request.onsuccess = () => resolve(request.result as PendingIntake | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveIntake(delivery: PendingIntake): Promise<void> {
  const db = await openQueue();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      tx.objectStore('deliveries').put(delivery);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function loadAllIntakeRecords(): Promise<IntakeQueueRecord[]> {
  const db = await openQueue();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('deliveries', 'readonly').objectStore('deliveries').getAll();
      request.onsuccess = () => resolve(request.result as IntakeQueueRecord[]);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveIssuedQuoteDelivery(delivery: IssuedQuoteDelivery): Promise<IssuedQuoteDelivery> {
  const db = await openQueue();
  try {
    return await new Promise<IssuedQuoteDelivery>((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      const store = tx.objectStore('deliveries');
      const request = store.get(delivery.key);
      let committed: IssuedQuoteDelivery | undefined;
      request.onsuccess = () => {
        const previous = request.result as IssuedQuoteDelivery | undefined;
        if (previous?.kind === 'issued-quote') {
          let merged: IssuedQuoteDelivery;
          try {
            merged = mergeIssuedQuoteProgress(previous, delivery);
          } catch (failure) {
            tx.abort();
            reject(failure);
            return;
          }
          store.put(merged);
          committed = merged;
        } else {
          store.put(delivery);
          committed = delivery;
        }
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Could not compare the existing frozen queue record.'));
        tx.abort();
      };
      tx.oncomplete = () => resolve(committed ?? delivery);
      tx.onerror = () => reject(tx.error ?? new Error('Could not save issued quote queue progress.'));
      tx.onabort = () => reject(tx.error ?? new Error('Issued quote queue save was aborted.'));
    });
  } finally { db.close(); }
}

export function resumedIssuedQuoteDelivery(delivery: IssuedQuoteDelivery): IssuedQuoteDelivery {
  if (delivery.state !== 'paused') return delivery;
  return {
    ...delivery,
    state: 'queued',
    retryAt: undefined,
    lastError: undefined,
    resumeGeneration: (delivery.resumeGeneration ?? 0) + 1,
  };
}

export async function resumePausedIssuedQuoteDelivery(key: string): Promise<IssuedQuoteDelivery | undefined> {
  const db = await openQueue();
  try {
    return await new Promise<IssuedQuoteDelivery | undefined>((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      const store = tx.objectStore('deliveries');
      const request = store.get(key);
      let committed: IssuedQuoteDelivery | undefined;
      request.onsuccess = () => {
        const previous = request.result as IssuedQuoteDelivery | undefined;
        if (previous?.kind !== 'issued-quote') return;
        committed = previous.state === 'paused' ? resumedIssuedQuoteDelivery(previous) : previous;
        if (committed !== previous) store.put(committed);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Could not read paused issued quote queue progress.'));
        tx.abort();
      };
      tx.oncomplete = () => resolve(committed);
      tx.onerror = () => reject(tx.error ?? new Error('Could not resume paused issued quote delivery.'));
      tx.onabort = () => reject(tx.error ?? new Error('Paused issued quote resume was aborted.'));
    });
  } finally { db.close(); }
}

export function mergeIssuedQuoteProgress(
  previous: IssuedQuoteDelivery,
  incoming: IssuedQuoteDelivery,
): IssuedQuoteDelivery {
  if (previous.key !== incoming.key ||
      previous.identityJson !== incoming.identityJson ||
      previous.proposalJson !== incoming.proposalJson ||
      previous.takeoffJson !== incoming.takeoffJson ||
      previous.deliveryId !== incoming.deliveryId ||
      (previous.issuedAt && incoming.issuedAt && previous.issuedAt !== incoming.issuedAt)) {
    throw new Error('Refusing to replace an issued quote queue key with different frozen request bodies or IDs.');
  }
  const merged: IssuedQuoteDelivery = {
    ...incoming,
    identityDone: previous.identityDone || incoming.identityDone,
    proposalDone: previous.proposalDone || incoming.proposalDone,
    takeoffDone: previous.takeoffDone || incoming.takeoffDone,
    identitySent: previous.identitySent || incoming.identitySent,
    proposalSent: previous.proposalSent || incoming.proposalSent,
    takeoffSent: previous.takeoffSent || incoming.takeoffSent,
    identityStale: previous.identityStale || incoming.identityStale,
    proposalStale: previous.proposalStale || incoming.proposalStale,
    takeoffStale: previous.takeoffStale || incoming.takeoffStale,
    identityAttention: previous.identityAttention || incoming.identityAttention,
    proposalAttention: previous.proposalAttention || incoming.proposalAttention,
    takeoffAttention: previous.takeoffAttention || incoming.takeoffAttention,
    resumeGeneration: Math.max(previous.resumeGeneration ?? 0, incoming.resumeGeneration ?? 0) || undefined,
    createdAt: previous.createdAt,
    issuedAt: previous.issuedAt || incoming.issuedAt,
  };
  if (previous.state === 'receipts-accepted' || previous.state === 'stale' || previous.state === 'superseded') {
    merged.state = previous.state;
  } else if ((previous.resumeGeneration ?? 0) > (incoming.resumeGeneration ?? 0)) {
    merged.state = previous.state;
    merged.retryAt = previous.retryAt;
    merged.lastError = previous.lastError;
  } else if (incoming.state === 'superseded' &&
      (previous.identityDone || previous.proposalDone || previous.takeoffDone ||
       previous.identitySent || previous.proposalSent || previous.takeoffSent ||
       previous.identityStale || previous.proposalStale || previous.takeoffStale ||
       previous.identityAttention || previous.proposalAttention || previous.takeoffAttention)) {
    merged.state = previous.state;
  } else if (previous.state === 'needs-attention' &&
      !(incoming.identityAttention || incoming.proposalAttention || incoming.takeoffAttention)) {
    merged.state = previous.state;
    merged.lastError = previous.lastError;
  } else if (previous.state === 'paused' && incoming.state === 'queued') {
    merged.state = previous.state;
  }
  return merged;
}

export async function saveQuoteQueueConnectionRecord(record: QuoteQueueConnectionRecord): Promise<void> {
  const db = await openQueue();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      tx.objectStore('deliveries').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function deleteIntakeRecord(key: string): Promise<void> {
  const db = await openQueue();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('deliveries', 'readwrite');
      tx.objectStore('deliveries').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}