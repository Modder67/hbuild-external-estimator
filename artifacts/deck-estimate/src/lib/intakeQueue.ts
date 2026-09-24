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

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hbuild-estimator-intake', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('deliveries', { keyPath: 'key' });
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