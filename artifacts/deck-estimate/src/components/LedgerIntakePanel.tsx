import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { estimatorAuth as auth } from '@/lib/supabaseAuth';
import type { PricingBreakdown, EstimateState } from '@/lib/pricing';
import { generateEstimatePDF } from '@/lib/pdfExport';
import { generateLumberTakeoffPDF } from '@/lib/pdfLumberTakeoff';
import { loadIntake, saveIntake, type PendingIntake } from '@/lib/intakeQueue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

async function pdfPayload(blob: Blob, type: 'proposal' | 'takeoff', originalName: string) {
  if (blob.size > 8 * 1024 * 1024) throw new Error(`${type} PDF exceeds the 8 MiB intake limit.`);
  const buffer = await blob.arrayBuffer();
  if (new TextDecoder().decode(buffer.slice(0, 5)) !== '%PDF-') throw new Error('PDF generation produced an invalid file.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { type, originalName, mime: 'application/pdf' as const, sha256, contentBase64 };
}

async function sendDelivery(path: string, body: string, token: string) {
  const response = await fetch(`/api/intake/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'H Ledger did not accept this delivery.');
  if (!['applied', 'stale'].includes(result.outcome)) throw new Error('H Ledger returned an unknown receipt.');
}

function allDone(record: PendingIntake) {
  return record.identityDone && record.proposalDone && (record.takeoffDone || record.takeoffJson === null);
}

export function LedgerIntakePanel({
  state, pricing, onClientSourceIdChange,
}: {
  state: EstimateState;
  pricing: PricingBreakdown;
  onClientSourceIdChange: (id: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<PendingIntake | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const queueKey = session && state.sourceId ? `${session.user.id}:${state.sourceId}` : null;

  useEffect(() => {
    fetch('/api/intake/status').then(r => r.json()).then(r => setConfigured(r.configured === true))
      .catch(() => setConfigured(false));
    if (!auth) return;
    void auth.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => setSession(null));
    const { data: { subscription } } = auth.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setQueue(null);
      setMessage('');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let current = true;
    setQueue(null);
    if (queueKey) void loadIntake(queueKey).then(record => {
      if (current) setQueue(record ?? null);
    }).catch(() => {
      if (current) setError('Local delivery queue is unavailable. Do not send until browser storage works.');
    });
    return () => { current = false; };
  }, [queueKey]);

  const signIn = async (event: React.FormEvent) => {
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
    if (!session || !queueKey || !state.sourceId || !configured || state.projectId) return;
    setError('');
    setMessage('');
    setWorking(true);
    try {
      const { jobDetails: job } = state;
      let record = await loadIntake(queueKey);
      const fingerprint = JSON.stringify(state);
      if (record && allDone(record) && record.fingerprint === fingerprint) {
        setMessage('This snapshot was already submitted. Check H Ledger and H Docs for verification.');
        setQueue(record);
        return;
      }
      if (record && allDone(record) && record.fingerprint !== fingerprint)
        throw new Error('Earlier PDF deliveries have receipts but H Docs readback is unconfirmed. Keep their saved bytes and confirm verification before sending a revision.');
      if (!record || allDone(record)) {
        if (!job.firstName?.trim() || !job.lastName?.trim() || !job.jobTitle.trim())
          throw new Error('Enter the client first and last name and a project name.');
        if (!state.clientSourceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.clientSourceId) ||
            state.clientSourceId === state.sourceId)
          throw new Error('Enter a valid, distinct estimator client ID.');
        if (job.jobCode && !/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(job.jobCode))
          throw new Error('Job code must be at most 20 letters, digits, or hyphens.');
        const source = { updatedAt: new Date().toISOString() };
        const estimate = await generateEstimatePDF(state, pricing, { download: false });
        const hasLumber = Object.values(pricing.lumber).some(value =>
          value && typeof value === 'object' && 'qty' in value && value.qty > 0);
        const takeoff = hasLumber ? await generateLumberTakeoffPDF(state, pricing, { download: false }) : null;
        const address = {
          line1: job.addressLine1?.trim() || undefined,
          line2: job.addressLine2?.trim() || undefined,
          city: job.city?.trim() || undefined,
          state: job.region?.trim() || undefined,
          postalCode: job.postalCode?.trim() || undefined,
        };
        record = {
          key: queueKey,
          fingerprint,
          identityJson: JSON.stringify({
            sourceId: state.sourceId,
            clientSourceId: state.clientSourceId,
            deliveryId: crypto.randomUUID(),
            source,
            client: {
              firstName: job.firstName.trim(),
              lastName: job.lastName.trim(),
              ...(Object.values(address).some(Boolean) ? { address } : {}),
            },
            project: {
              projectType: 'Deck',
              name: job.jobTitle.trim(),
              ...(job.jobCode ? { jobCode: job.jobCode } : {}),
            },
            expectedDocuments: ['proposal', 'takeoff'],
          }),
          proposalJson: JSON.stringify({
            sourceId: state.sourceId,
            deliveryId: crypto.randomUUID(),
            source,
            document: await pdfPayload(estimate.blob, 'proposal', estimate.filename),
          }),
          takeoffJson: takeoff ? JSON.stringify({
            sourceId: state.sourceId,
            deliveryId: crypto.randomUUID(),
            source,
            document: await pdfPayload(takeoff.blob, 'takeoff', takeoff.filename),
          }) : null,
          identityDone: false,
          proposalDone: false,
          takeoffDone: false,
        };
        // Commit all immutable payloads before the first network write. Retries reuse these bytes and IDs.
        await saveIntake(record);
      }
      setQueue({ ...record });
      if (record.fingerprint !== fingerprint && !allDone(record))
        setMessage('Retrying the earlier saved snapshot first. Current edits are not part of this delivery.');
      const token = session.access_token;
      if (!record.identityDone) {
        await sendDelivery('projects', record.identityJson, token);
        record.identityDone = true;
        await saveIntake(record);
        setQueue({ ...record });
      }
      if (!record.proposalDone) {
        await sendDelivery('documents', record.proposalJson, token);
        record.proposalDone = true;
        await saveIntake(record);
        setQueue({ ...record });
      }
      if (record.takeoffJson && !record.takeoffDone) {
        await sendDelivery('documents', record.takeoffJson, token);
        record.takeoffDone = true;
        await saveIntake(record);
        setQueue({ ...record });
      }
      setMessage(record.takeoffJson
        ? 'Both PDF receipts accepted by H Ledger. H Docs readback is unconfirmed; nothing has been released.'
        : 'Proposal receipt accepted. Takeoff is still missing; H Docs readback is unconfirmed.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Delivery failed. Retry this saved snapshot.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-background/40 p-4 space-y-3">
      <div className="flex justify-between gap-2 items-center">
        <strong className="text-sm">HBUILD intake</strong>
        {session && <Button type="button" variant="ghost" size="sm" onClick={() => void auth?.auth.signOut()}>Sign out</Button>}
      </div>
      <p className="text-xs text-muted-foreground">New jobs are sent to H Ledger. H Ledger provisions the canonical project and H Docs folders. Uploads start staff-only; a receipt is not a release or verification.</p>
      {!state.projectId && (
        <div className="space-y-1">
          <label htmlFor="client-source-id" className="text-xs text-muted-foreground">Estimator client ID (reuse the exact ID for a returning client; never match by name)</label>
          <Input id="client-source-id" value={state.clientSourceId ?? ''} onChange={e => onClientSourceIdChange(e.target.value)}
            disabled={Boolean(queue)} className="font-mono text-xs" />
        </div>
      )}
      {state.projectId ? (
        <p className="text-sm text-amber-400" role="alert">
          This saved estimate was linked to an existing HBUILD project ({state.projectName || state.projectId}).
          Download a copy if needed, then use Clear to start a new job before importing. It will not be sent as a duplicate.
        </p>
      ) : !auth || configured === false ? (
        <p className="text-sm text-amber-400" role="status">H Ledger intake is not provisioned here yet. PDF and Excel downloads remain available.</p>
      ) : configured === null ? (
        <p className="text-sm text-muted-foreground" role="status">Checking H Ledger connection…</p>
      ) : !session ? (
        <form onSubmit={signIn} className="flex flex-col sm:flex-row gap-2">
          <Input type="email" autoComplete="username" aria-label="HBUILD email" placeholder="HBUILD email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input type="password" autoComplete="current-password" aria-label="Password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <Button type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      ) : (
        <>
          <Button type="button" onClick={() => void send()} disabled={working}>
            {working ? 'Sending…' : queue && !allDone(queue) ? 'Retry saved delivery' : queue ? 'Review submitted snapshot' : 'Send new job and PDFs to HBUILD'}
          </Button>
          <div className="text-xs text-muted-foreground space-y-1" role="status">
            <p>Client and project: {queue?.identityDone ? 'Ledger receipt accepted; mapping review needed' : 'Not delivered'}</p>
            <p>Estimate PDF: {queue?.proposalDone ? 'Ledger receipt accepted; H Docs readback unconfirmed' : 'Not delivered'}</p>
            <p>Takeoff PDF: {queue?.takeoffDone ? 'Ledger receipt accepted; H Docs readback unconfirmed' : queue?.takeoffJson ? 'Pending delivery' : 'Missing until lumber is selected'}</p>
          </div>
        </>
      )}
      {message && <p className="text-sm text-amber-200" role="status">{message}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">Pending PDF bytes are kept in this browser for manual retry. Clearing browser storage removes unsent deliveries; keep your local downloads until HBUILD verifies them.</p>
    </div>
  );
}