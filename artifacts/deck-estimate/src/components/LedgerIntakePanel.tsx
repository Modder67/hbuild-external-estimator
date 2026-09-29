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

function downloadFrozenPdf(json: string | null, fallbackName: string) {
  if (!json) return;
  const payload = JSON.parse(json) as {
    document?: { contentBase64?: string; originalName?: string; mime?: string };
  };
  const document = payload.document;
  if (!document?.contentBase64) throw new Error('The saved PDF bytes are unavailable in this local snapshot.');
  const binary = atob(document.contentBase64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: document.mime || 'application/pdf' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = document.originalName || fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [queue, setQueue] = useState<PendingIntake | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const queueKey = session && state.sourceId ? `${session.user.id}:${state.sourceId}` : null;

  useEffect(() => {
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
    setLoadingQueue(Boolean(queueKey));
    if (queueKey) void loadIntake(queueKey).then(record => {
      if (current) {
        setQueue(record ?? null);
        setLoadingQueue(false);
      }
    }).catch(() => {
      if (current) {
        setLoadingQueue(false);
        setError('Local delivery storage is unavailable. The saved snapshot could not be loaded.');
      }
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

  const preserveLocally = async () => {
    if (!session || !queueKey || !state.sourceId || state.projectId) return;
    setError('');
    setMessage('');
    setWorking(true);
    try {
      const { jobDetails: job } = state;
      const record = await loadIntake(queueKey);
      const fingerprint = JSON.stringify(state);
      if (record && record.fingerprint === fingerprint) {
        setMessage('This exact frozen snapshot is already saved locally. Its existing receipt status has been preserved; no network delivery was attempted.');
        setQueue(record);
        return;
      }
      if (record)
        throw new Error('A different frozen snapshot is already saved for this estimate. Its bytes and receipt status were left untouched; this panel cannot replace it or create a revision.');
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
      const frozenRecord: PendingIntake = {
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
      // This frozen local record is for preservation and recovery only. Deck cannot submit it.
      await saveIntake(frozenRecord);
      const saved = frozenRecord;
      setQueue({ ...saved });
      setMessage('A frozen Deck snapshot was saved in this browser for recovery only. It was not sent, and no later delivery is promised.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this local snapshot.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-background/40 p-4 space-y-3">
      <div className="flex justify-between gap-2 items-center">
        <strong className="text-sm">Legacy browser records (not issued quotes)</strong>
        {session && <Button type="button" variant="ghost" size="sm" onClick={() => void auth?.auth.signOut()}>Sign out</Button>}
      </div>
      <p className="text-sm text-amber-400" role="status">
        Legacy browser-only records and their saved PDFs remain available here for readback/recovery. They are never converted, sent, or cleared by the shared server-draft and issued-revision flow below. Only its exact immutable server-issued Deck revision can enter the separate durable quote queue.
      </p>
      {!state.projectId && (
        <div className="space-y-1">
          <label htmlFor="client-source-id" className="text-xs text-muted-foreground">Local client reference ID (reuse the exact ID for a returning client; never match by name)</label>
          <Input id="client-source-id" value={state.clientSourceId ?? ''} onChange={e => onClientSourceIdChange(e.target.value)}
            disabled={Boolean(queue)} className="font-mono text-xs" />
        </div>
      )}
      {state.projectId ? (
        <>
          <p className="text-sm text-amber-400" role="alert">
            This saved estimate was linked to an existing HBUILD project ({state.projectName || state.projectId}).
            Do not submit it as a duplicate. Its legacy local record remains available below; use Clear only to start a separate estimate.
          </p>
          {loadingQueue ? <p className="text-xs text-muted-foreground">Loading legacy local snapshot…</p> : queue ? (
            <>
              <div className="text-xs text-muted-foreground space-y-1" role="status">
                <p>Client and project: {queue.identityDone ? 'Previously accepted Ledger receipt; preserved unchanged' : 'Saved locally only; not delivered'}</p>
                <p>Estimate PDF: {queue.proposalDone ? 'Previously accepted Ledger receipt; readback unconfirmed' : 'Saved locally only; not delivered'}</p>
                <p>Takeoff PDF: {queue.takeoffDone ? 'Previously accepted Ledger receipt; readback unconfirmed' : queue.takeoffJson ? 'Saved locally only; not delivered' : 'Missing in this legacy snapshot'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {queue.proposalJson && <Button type="button" variant="outline" size="sm" onClick={() => {
                  try { downloadFrozenPdf(queue.proposalJson, 'deck-estimate.pdf'); }
                  catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not recover the saved proposal PDF.'); }
                }}>Download saved proposal PDF</Button>}
                {queue.takeoffJson && <Button type="button" variant="outline" size="sm" onClick={() => {
                  try { downloadFrozenPdf(queue.takeoffJson, 'deck-takeoff.pdf'); }
                  catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not recover the saved takeoff PDF.'); }
                }}>Download saved takeoff PDF</Button>}
              </div>
            </>
          ) : !loadingQueue && <p className="text-xs text-muted-foreground">No legacy local snapshot exists for this source ID.</p>}
        </>
      ) : !auth ? (
        <p className="text-sm text-amber-400" role="status">Local snapshot storage requires estimator sign-in, which is unavailable here. PDF and Excel downloads remain available.</p>
      ) : !session ? (
        <form onSubmit={signIn} className="flex flex-col sm:flex-row gap-2">
          <Input type="email" autoComplete="username" aria-label="HBUILD email" placeholder="HBUILD email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input type="password" autoComplete="current-password" aria-label="Password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <Button type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      ) : (
        <>
          <Button type="button" onClick={() => void preserveLocally()} disabled={working || loadingQueue || Boolean(queue)}>
            {working ? 'Saving local snapshot…' : loadingQueue ? 'Loading saved snapshot…' : queue ? 'Frozen snapshot saved locally' : 'Save frozen local snapshot'}
          </Button>
          <div className="text-xs text-muted-foreground space-y-1" role="status">
            <p>Client and project: {queue?.identityDone ? 'Previously accepted Ledger receipt; preserved unchanged' : queue ? 'Saved locally only; not delivered' : 'No saved snapshot'}</p>
            <p>Estimate PDF: {queue?.proposalDone ? 'Previously accepted Ledger receipt; readback unconfirmed' : queue ? 'Saved locally only; not delivered' : 'No saved snapshot'}</p>
            <p>Takeoff PDF: {queue?.takeoffDone ? 'Previously accepted Ledger receipt; readback unconfirmed' : queue?.takeoffJson ? 'Saved locally only; not delivered' : 'Missing until lumber is selected'}</p>
          </div>
          {queue && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => {
                try { downloadFrozenPdf(queue.proposalJson, 'deck-estimate.pdf'); }
                catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not recover the saved proposal PDF.'); }
              }}>Download saved proposal PDF</Button>
              {queue.takeoffJson && <Button type="button" variant="outline" size="sm" onClick={() => {
                try { downloadFrozenPdf(queue.takeoffJson, 'deck-takeoff.pdf'); }
                catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not recover the saved takeoff PDF.'); }
              }}>Download saved takeoff PDF</Button>}
            </div>
          )}
        </>
      )}
      {message && <p className="text-sm text-amber-200" role="status">{message}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">Legacy saved PDF bytes remain in this browser and can be downloaded for recovery; this panel never uploads them. Clearing browser storage removes the local copy. Server-issued revisions and durable queued deliveries are shown separately in Shared drafts & fixed quotes.</p>
    </div>
  );
}