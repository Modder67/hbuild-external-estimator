import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { estimatorAuth as auth } from '@/lib/supabaseAuth';
import { loadIntake, saveIntake, type PendingIntake } from '@/lib/intakeQueue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EstimatorProject } from './project';
import type { Calculation } from './types';
import { modulePdf } from './exports';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jobCodePattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
const pendingLocatorPrefix = 'hbuild-estimator-intake-project:';

function pendingLocatorKey(projectSourceId: string) {
  return `${pendingLocatorPrefix}${projectSourceId}`;
}

function intakeProjectType(estimatorType: string): 'Flooring' | 'Bathroom' | 'Basement' | null {
  const normalized = estimatorType.trim().toLowerCase();
  if (normalized === 'flooring' || normalized === 'flooring & doors') return 'Flooring';
  if (normalized === 'bathroom') return 'Bathroom';
  if (normalized === 'basement' || normalized === 'basement remodeling') return 'Basement';
  return null;
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

async function pdfPayload(blob: Blob, type: 'proposal' | 'takeoff', originalName: string) {
  if (blob.size > 8 * 1024 * 1024) throw new Error(`${type} PDF exceeds the 8 MiB intake limit.`);
  const buffer = await blob.arrayBuffer();
  if (new TextDecoder().decode(buffer.slice(0, 5)) !== '%PDF-') {
    throw new Error(`${type} PDF generation produced an invalid file.`);
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode the PDF.'));
    reader.readAsDataURL(blob);
  });
  return { type, originalName, mime: 'application/pdf' as const, sha256, contentBase64 };
}

async function sendDelivery(path: 'projects' | 'documents', body: string, token: string) {
  const response = await fetch(`/api/intake/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
  let result: { outcome?: unknown; error?: unknown } | null;
  try {
    const parsed: unknown = await response.json();
    result = parsed && typeof parsed === 'object'
      ? parsed as { outcome?: unknown; error?: unknown }
      : null;
  } catch {
    throw new Error('H Ledger returned an unreadable response. Retry the exact saved delivery.');
  }
  if (!response.ok) {
    const detail = typeof result?.error === 'string' ? result.error : 'H Ledger did not accept this delivery.';
    if (response.status === 409) throw new Error(`Review required: ${detail}`);
    throw new Error(detail);
  }
  if (result?.outcome === 'stale') {
    throw new Error('Stale delivery: H Ledger reports an older snapshot. Review the existing mapping/version; this is not accepted.');
  }
  if (result?.outcome !== 'applied') {
    throw new Error('H Ledger returned an unknown receipt. Acceptance and verification are unconfirmed.');
  }
}

function allAccepted(record: PendingIntake) {
  return record.identityDone && record.proposalDone && record.takeoffDone;
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
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<PendingIntake | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const queueKey = session && project.sourceId ? `${session.user.id}:${project.sourceId}` : null;
  const snapshot = JSON.stringify({ estimatorType, project, calculation });

  useEffect(() => {
    let current = true;
    fetch('/api/intake/status')
      .then(async response => {
        if (!response.ok) throw new Error('Could not check H Ledger intake status.');
        return response.json() as Promise<{ configured?: unknown }>;
      })
      .then(result => { if (current) setConfigured(result.configured === true); })
      .catch(() => { if (current) setConfigured(false); });

    if (!auth) return () => { current = false; };
    void auth.auth.getSession()
      .then(({ data }) => { if (current) setSession(data.session); })
      .catch(() => { if (current) setSession(null); });
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setQueue(null);
      setConfirmed(false);
      setMessage('');
      setError('');
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
        if (current) setQueueError('Local delivery queue is unavailable. Do not send until browser storage works.');
      }).finally(() => {
        if (current) setQueueLoading(false);
      });
    }
    return () => { current = false; };
  }, [queueKey]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    setError('');
    setWorking(true);
    try {
      const { error: failure } = await auth.auth.signInWithPassword({ email, password });
      if (failure) throw failure;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in failed.');
    } finally {
      setPassword('');
      setWorking(false);
    }
  };

  const send = async () => {
    if (!session || !queueKey || !configured || queueLoading) return;
    setError('');
    setMessage('');
    setWorking(true);
    try {
      let record = await loadIntake(queueKey);
      if (record) window.localStorage.setItem(pendingLocatorKey(project.sourceId), 'pending');
      if (record && record.fingerprint !== snapshot) {
        if (allAccepted(record)) {
          throw new Error('This project has an earlier snapshot with accepted receipts but no verified readback contract. Changed snapshots are blocked; do not clear or replace the frozen delivery.');
        }
        setMessage('Retrying only the earlier frozen snapshot. Current edits are not included in this delivery.');
      }
      if (!record) {
        const projectType = intakeProjectType(estimatorType);
        if (!projectType) {
          throw new Error('Only Flooring, Bathroom, and Basement estimates are supported for intake.');
        }
        if (calculation.issues.length) throw new Error('Resolve every calculation issue before intake.');
        if (!project.firstName.trim() || !project.lastName.trim() || !project.projectName.trim()) {
          throw new Error('Enter a valid client first name, last name, and project name.');
        }
        if (!uuid.test(project.sourceId) || !uuid.test(project.clientSourceId) ||
            project.sourceId.toLowerCase() === project.clientSourceId.toLowerCase()) {
          throw new Error('Project and client source IDs must be valid, distinct UUIDs.');
        }
        if (project.jobCode && !jobCodePattern.test(project.jobCode)) {
          throw new Error('Job code must be at most 20 letters, digits, or hyphens.');
        }
        if (project.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(project.email.trim())) {
          throw new Error('Enter a valid client email address or leave it blank.');
        }
        if (!confirmed) throw new Error('Confirm that this new project is ready for staff-only intake.');

        const source = { updatedAt: new Date().toISOString() };
        const proposal = modulePdf(estimatorType, project, calculation, 'proposal', false);
        const takeoff = modulePdf(estimatorType, project, calculation, 'takeoff', false);
        const address = {
          line1: project.addressLine1.trim() || undefined,
          line2: project.addressLine2.trim() || undefined,
          city: project.city.trim() || undefined,
          state: project.region.trim() || undefined,
          postalCode: project.postalCode.trim() || undefined,
        };
        record = {
          key: queueKey,
          fingerprint: snapshot,
          identityJson: JSON.stringify({
            sourceId: project.sourceId,
            clientSourceId: project.clientSourceId,
            deliveryId: crypto.randomUUID(),
            source,
            client: {
              firstName: project.firstName.trim(),
              lastName: project.lastName.trim(),
              ...(project.phone.trim() ? { phone: project.phone.trim() } : {}),
              ...(project.email.trim() ? { email: project.email.trim() } : {}),
              ...(Object.values(address).some(Boolean) ? { address } : {}),
            },
            project: {
              projectType,
              name: project.projectName.trim(),
              ...(project.jobCode.trim() ? { jobCode: project.jobCode.trim() } : {}),
            },
            expectedDocuments: ['proposal', 'takeoff'],
          }),
          proposalJson: JSON.stringify({
            sourceId: project.sourceId,
            deliveryId: crypto.randomUUID(),
            source,
            document: await pdfPayload(proposal.blob, 'proposal', proposal.filename),
          }),
          takeoffJson: JSON.stringify({
            sourceId: project.sourceId,
            deliveryId: crypto.randomUUID(),
            source,
            document: await pdfPayload(takeoff.blob, 'takeoff', takeoff.filename),
          }),
          identityDone: false,
          proposalDone: false,
          takeoffDone: false,
        };
        // This locator lets the owning page block reset even if the signed-in user changes.
        window.localStorage.setItem(pendingLocatorKey(project.sourceId), 'pending');
        // Freeze every body, PDF digest, and id in IndexedDB before any intake write.
        await saveIntake(record);
      }

      setQueue({ ...record });
      const token = session.access_token;
      if (!record.identityDone) {
        await sendDelivery('projects', record.identityJson, token);
        record.identityDone = true;
        await saveIntake(record);
        setQueue({ ...record });
      }
      if (!record.proposalDone) {
        if (!record.proposalJson) throw new Error('Frozen proposal payload is missing; do not create a replacement delivery.');
        await sendDelivery('documents', record.proposalJson, token);
        record.proposalDone = true;
        await saveIntake(record);
        setQueue({ ...record });
      }
      if (!record.takeoffDone) {
        if (!record.takeoffJson) throw new Error('Frozen takeoff payload is missing; do not create a replacement delivery.');
        await sendDelivery('documents', record.takeoffJson, token);
        record.takeoffDone = true;
        await saveIntake(record);
        setQueue({ ...record });
      }
      setMessage('All three receipts were accepted by H Ledger. Project mapping and H Docs readback are unverified; nothing has been released.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Delivery failed. Retry this exact saved snapshot.');
      // Reload to ensure the visible status reflects only persisted accepted receipts.
      try {
        const saved = await loadIntake(queueKey);
        setQueue(saved ?? null);
      } catch {
        setQueueError('Could not reload the frozen delivery from browser storage.');
      }
    } finally {
      setWorking(false);
    }
  };

  const hasIssues = calculation.issues.length > 0;
  const supportedType = intakeProjectType(estimatorType) !== null;
  const changedSnapshot = Boolean(queue && queue.fingerprint !== snapshot);
  const retryOnly = Boolean(queue && !allAccepted(queue));

  return (
    <section className="md:col-span-2 rounded-lg border border-border bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">HBUILD intake · {estimatorType}</strong>
        {session && <Button type="button" variant="ghost" size="sm" onClick={() => void auth?.auth.signOut()}>Sign out</Button>}
      </div>
      <p className="text-xs text-muted-foreground">
        Sends a new project and proposal/takeoff PDFs through the guarded HBUILD intake API. Receipts are not verification, approval, or release. Credentials for Ledger are never stored in or sent from this browser.
      </p>

      {hasIssues && (
        <p className="text-sm text-destructive" role="alert">
          {queue
            ? `Current edits cannot be frozen because of calculation issues; retry sends only the saved delivery. ${calculation.issues.join(' ')}`
            : `Intake blocked: resolve all calculation issues first (${calculation.issues.join(' ')})`}
        </p>
      )}
      {!supportedType && (
        <p className="text-sm text-destructive" role="alert">Intake is available only for Flooring, Bathroom, and Basement estimators.</p>
      )}
      {!project.firstName.trim() || !project.lastName.trim() || !project.projectName.trim() ? (
        <p className="text-sm text-amber-400" role="status">A client first name, last name, and project name are required before intake.</p>
      ) : null}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Client: {project.firstName.trim()} {project.lastName.trim()}</p>
        <p>Project: {project.projectName.trim()}</p>
        <p className="break-all">Stable project source ID: {project.sourceId}</p>
        <p className="break-all">Stable client source ID: {project.clientSourceId}</p>
      </div>

      {!auth || configured === false ? (
        <p className="text-sm text-amber-400" role="status">H Ledger intake is not provisioned here. Downloads remain available.</p>
      ) : configured === null ? (
        <p className="text-sm text-muted-foreground" role="status">Checking H Ledger connection…</p>
      ) : !session ? (
        <form onSubmit={signIn} className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" autoComplete="username" aria-label="HBUILD email" placeholder="HBUILD email" value={email} onChange={event => setEmail(event.target.value)} required />
          <Input type="password" autoComplete="current-password" aria-label="Password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required />
          <Button type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      ) : (
        <>
          {!queue && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={working || hasIssues} />
              <span>Confirm this is a new project and these PDFs are ready for staff-only intake. This does not authorize release.</span>
            </label>
          )}
          {changedSnapshot && retryOnly && (
            <p className="text-sm text-amber-200" role="status">
              Current edits differ from the frozen delivery. Retry sends only its saved bodies and IDs; the changed snapshot is not imported.
            </p>
          )}
          <Button
            type="button"
            onClick={() => void send()}
            disabled={working || queueLoading || Boolean(queueError) || (hasIssues && !queue) || !supportedType || (!queue && !confirmed) || (Boolean(queue) && !retryOnly)}
          >
            {working ? 'Sending…' : queueLoading ? 'Loading saved delivery…' : retryOnly ? 'Retry exact saved delivery' : queue ? 'Submitted snapshot is locked' : 'Freeze and send new project'}
          </Button>
          <div className="space-y-1 text-xs text-muted-foreground" role="status" aria-label="Intake receipt statuses">
            <p>Identity receipt: {queue?.identityDone ? 'Accepted by Ledger; project mapping unverified' : 'Not accepted'}</p>
            <p>Proposal receipt: {queue?.proposalDone ? 'Accepted by Ledger; H Docs readback unverified' : queue ? 'Pending / not accepted' : 'Not sent'}</p>
            <p>Takeoff receipt: {queue?.takeoffDone ? 'Accepted by Ledger; H Docs readback unverified' : queue?.takeoffJson ? 'Pending / not accepted' : 'Not sent'}</p>
          </div>
        </>
      )}
      {queueError && <p className="text-sm text-destructive" role="alert">{queueError}</p>}
      {message && <p className="text-sm text-amber-200" role="status">{message}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Frozen PDF bytes and request IDs remain in this browser for exact retries. Readback verification is not implemented, so accepted snapshots remain locked and are never discarded here. Keep local copies until HBUILD confirms storage. Nothing is released to clients.
      </p>
    </section>
  );
}