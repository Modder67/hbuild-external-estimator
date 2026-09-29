import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { estimatorAuth as auth } from '@/lib/supabaseAuth';
import { loadIntake, type PendingIntake } from '@/lib/intakeQueue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EstimatorProject } from './project';
import type { Calculation } from './types';

const pendingLocatorPrefix = 'hbuild-estimator-intake-project:';

function pendingLocatorKey(projectSourceId: string) {
  return `${pendingLocatorPrefix}${projectSourceId}`;
}

/**
 * ModulePage can use this before reset/new-job actions. It fails closed if browser
 * storage is unavailable and also detects older queue records created before the
 * localStorage locator was added.
 */
export async function hasPendingIntakeForProject(projectSourceId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !projectSourceId) {
    throw new Error('Cannot check pending intake without a browser and project source ID.');
  }
  if (window.localStorage.getItem(pendingLocatorKey(projectSourceId))) return true;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('hbuild-estimator-intake', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('deliveries')) {
        request.result.createObjectStore('deliveries', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read saved intake deliveries.'));
  });
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const request = db.transaction('deliveries', 'readonly').objectStore('deliveries').getAllKeys();
      request.onsuccess = () => resolve(request.result.some(key =>
        typeof key === 'string' && key.endsWith(`:${projectSourceId}`)));
      request.onerror = () => reject(request.error ?? new Error('Could not read saved intake deliveries.'));
    });
  } finally {
    db.close();
  }
}

export function ModuleIntakePanel<T>({
  project, calculation, estimatorType,
}: {
  project: EstimatorProject<T>;
  calculation: Calculation;
  estimatorType: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [queue, setQueue] = useState<PendingIntake | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState('');
  const [working, setWorking] = useState(false);
  const [authError, setAuthError] = useState('');

  const queueKey = session && project.sourceId ? `${session.user.id}:${project.sourceId}` : null;

  useEffect(() => {
    if (!auth) return;
    let current = true;
    void auth.auth.getSession()
      .then(({ data }) => { if (current) setSession(data.session); })
      .catch(() => { if (current) setAuthError('Could not read sign-in session for historical intake receipts.'); });
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setQueue(null);
      setQueueError('');
      setAuthError('');
    });
    return () => {
      current = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let current = true;
    setQueue(null);
    setQueueError('');
    setQueueLoading(Boolean(queueKey));
    if (queueKey) {
      void loadIntake(queueKey).then(record => {
        if (current) setQueue(record ?? null);
      }).catch(() => {
        if (current) setQueueError('Could not read the preserved legacy delivery record from browser storage.');
      }).finally(() => {
        if (current) setQueueLoading(false);
      });
    } else {
      setQueueLoading(false);
    }
    return () => { current = false; };
  }, [queueKey]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    setAuthError('');
    setWorking(true);
    try {
      const { error: failure } = await auth.auth.signInWithPassword({ email, password });
      if (failure) throw failure;
    } catch (failure) {
      setAuthError(failure instanceof Error ? failure.message : 'Sign-in failed.');
    } finally {
      setPassword('');
      setWorking(false);
    }
  };

  return (
    <section className="md:col-span-2 rounded-lg border border-border bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">HBUILD intake · {estimatorType}</strong>
        {session && <Button type="button" variant="ghost" size="sm" onClick={() => void auth?.auth.signOut()}>Sign out</Button>}
      </div>
      <p className="text-xs text-muted-foreground">
        Legacy direct-payload sending is permanently disabled: HBUILD accepts estimator imports only from immutable issued quote revisions. Use the shared quote panel to issue or recover a frozen revision. Existing browser queue data and accepted receipt statuses are preserved below; nothing is verified or released here.
      </p>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Client: {project.firstName} {project.lastName}</p>
        <p>Project: {project.projectName}</p>
        <p className="break-all">Stable project source ID: {project.sourceId}</p>
      </div>
      {!auth ? (
        <p className="text-sm text-amber-400" role="status">Historical receipt lookup requires configured estimator sign-in.</p>
      ) : !session ? (
        <form onSubmit={signIn} className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" autoComplete="username" aria-label="HBUILD email" placeholder="HBUILD email" value={email} onChange={event => setEmail(event.target.value)} required />
          <Input type="password" autoComplete="current-password" aria-label="Password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required />
          <Button type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in to view saved receipt statuses'}</Button>
        </form>
      ) : (
        <div className="space-y-1 text-xs text-muted-foreground" role="status" aria-label="Legacy intake receipt statuses">
          {queueLoading ? <p>Loading preserved legacy receipt statuses…</p> : (
            <>
              <p>Identity receipt: {queue?.identityDone ? 'Accepted by Ledger; project mapping unverified' : 'Not accepted'}</p>
              <p>Proposal receipt: {queue?.proposalDone ? 'Accepted by Ledger; H Docs readback unverified' : queue ? 'Pending / not accepted' : 'No legacy snapshot'}</p>
              <p>Takeoff receipt: {queue?.takeoffDone ? 'Accepted by Ledger; H Docs readback unverified' : queue?.takeoffJson ? 'Pending / not accepted' : 'No legacy snapshot'}</p>
            </>
          )}
        </div>
      )}
      {queueError && <p className="text-sm text-destructive" role="alert">{queueError}</p>}
      {authError && <p className="text-sm text-destructive" role="alert">{authError}</p>}
      {calculation.issues.length > 0 && <p className="text-xs text-muted-foreground">Current estimate has {calculation.issues.length} pricing or scope issue(s); local authoring and exports remain available.</p>}
      <p className="text-xs text-muted-foreground">Legacy request bodies are not resent, replaced, or deleted. Accepted receipts do not imply readback verification, approval, or client release.</p>
    </section>
  );
}