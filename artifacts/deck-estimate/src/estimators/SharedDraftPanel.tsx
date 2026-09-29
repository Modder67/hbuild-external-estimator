import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { estimatorAuth } from '@/lib/supabaseAuth';
import {
  loadAllIntakeRecords,
  resumePausedIssuedQuoteDelivery,
  saveIssuedQuoteDelivery,
  type IssuedQuoteDelivery,
} from '@/lib/intakeQueue';
import {
  buildIssuedQuoteDelivery,
  decideIntakeResponse,
  deliveriesForConnection,
  intakePauseFromStatus,
  intakeIsConfigured,
  isIssuedQuoteDelivery,
  isQuoteQueueConnectionRecord,
  latestRetryDeadline,
  markDeliverySent,
  nextPendingDelivery,
  pendingDeliveryCount,
  persistQuoteQueueConnection,
  persistIssuedQuoteDelivery,
  planManualSync,
  retryDeadlineExpired,
  transitionAfterResponse,
  type QuoteQueueConnection,
  withExclusiveQuoteSender,
} from '@/lib/issuedQuoteQueue';
import { IssuedQuoteQueuePanel } from './IssuedQuoteQueuePanel';
import type { EstimatorProject } from './project';
import { money, totals, type Calculation } from './types';
import { totalsForSlug } from '@workspace/estimator-core';

type EstimateTotals = ReturnType<typeof totals>;

export type EstimateDraft<T = unknown> = {
  id: string;
  slug: string;
  version: number;
  project: T;
  calculation: Calculation;
  totals: EstimateTotals;
  policyVersion: string;
  rateBookVersion: string;
  updatedAt: string;
  createdAt: string;
};

export type IssuedQuote<T = unknown> = {
  id: string;
  draftId: string;
  revision: number;
  draftVersion: number;
  project: T;
  calculation: Calculation;
  totals: EstimateTotals;
  policyVersion: string;
  rateBookVersion: string;
  issuedAt: string;
  issuedBy: string;
};

type Props<T> = {
  slug: 'deck' | 'flooring' | 'bathroom' | 'basement';
  project: EstimatorProject<T>;
  calculation: Calculation;
  localDrafts: EstimatorProject<T>[];
  onLoadProject: (project: EstimatorProject<T>) => void;
  onLoadLocalProject: (project: EstimatorProject<T>) => void;
  issuanceBlockReason?: string;
};

type DeliveryMetadata = {
  revision: number;
  deliveryId: string;
  draftId: string;
  projectId: string;
  proposalDocumentId: string;
  takeoffDocumentId: string;
  proposalSha256Prefix: string;
  takeoffSha256Prefix: string;
};

function nestedString(value: unknown, ...path: string[]): string {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}

function hashPrefix(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value.slice(0, 12) : '';
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

async function requestJson<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let result: { error?: unknown } | T;
  try {
    result = await response.json() as { error?: unknown } | T;
  } catch {
    throw new Error('Estimates service returned an unreadable response.');
  }
  if (!response.ok) {
    const detail = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : `Estimates request failed (${response.status}).`;
    if (response.status === 409) throw new Error(`Version conflict (409): ${detail}`);
    throw new Error(detail);
  }
  return result as T;
}

export function SharedDraftPanel<T>({
  slug, project, calculation, localDrafts, onLoadProject, onLoadLocalProject, issuanceBlockReason,
}: Props<T>) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [drafts, setDrafts] = useState<EstimateDraft<EstimatorProject<T>>[]>([]);
  const [active, setActive] = useState<EstimateDraft<EstimatorProject<T>> | null>(null);
  const [revisions, setRevisions] = useState<IssuedQuote<EstimatorProject<T>>[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [delivery, setDelivery] = useState<DeliveryMetadata | null>(null);
  const [conflictDraftId, setConflictDraftId] = useState('');
  const [quoteQueue, setQuoteQueue] = useState<IssuedQuoteDelivery[]>([]);
  const [queueConnection, setQueueConnection] = useState<QuoteQueueConnection>({ paused: false });
  const [queueLoadingError, setQueueLoadingError] = useState('');
  const [syncWorking, setSyncWorking] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [intakeConfigured, setIntakeConfigured] = useState<boolean | null>(null);
  const [serverPause, setServerPause] = useState<QuoteQueueConnection>({ paused: false });
  const queueOwnerRef = useRef('');
  const sourceIdRef = useRef(project.sourceId);
  sourceIdRef.current = project.sourceId;

  useEffect(() => {
    if (!estimatorAuth) {
      setLoading(false);
      return;
    }
    let current = true;
    void estimatorAuth.auth.getSession().then(({ data }) => {
      if (current) setSession(data.session);
    }).catch(() => {
      if (current) setError('Could not read sign-in session for shared estimates.');
    });
    const { data: { subscription } } = estimatorAuth.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setDrafts([]);
      setActive(null);
      setRevisions([]);
      setDelivery(null);
      setConflictDraftId('');
      setRevisionError('');
      if (!next || next.user.id !== queueOwnerRef.current) {
        setQuoteQueue([]);
        setQueueConnection({ paused: false });
        setQueueLoadingError('');
        setSyncMessage('');
        setIntakeConfigured(null);
        setServerPause({ paused: false });
      }
      setError('');
      setNotice('');
      setLoading(Boolean(next));
    });
    return () => {
      current = false;
      subscription.unsubscribe();
    };
  }, []);

  const reloadQuoteQueue = useCallback(async (userId: string) => {
    try {
      const records = await loadAllIntakeRecords();
      let owned = deliveriesForConnection(records, userId);
      for (const record of owned) {
        const sourceKey = `${userId}:${record.sourceId}`;
        if (record.sourceKey !== sourceKey) {
          await saveIssuedQuoteDelivery({ ...record, sourceKey });
        }
      }
      if (owned.some(record => record.sourceKey !== `${userId}:${record.sourceId}`)) {
        const updated = await loadAllIntakeRecords();
        owned = updated.filter(isIssuedQuoteDelivery).filter(record => record.userId === userId);
      }
      setQuoteQueue(owned);
      const pauseMarkers = records.filter(isQuoteQueueConnectionRecord)
        .filter(record => record.userId === userId && record.paused);
      const paused = owned.some(record => record.state === 'paused');
      const retryAt = latestRetryDeadline([
        ...pauseMarkers.map(record => record.retryAt),
        ...owned.filter(record => record.state === 'paused').map(record => record.retryAt),
      ]);
      setQueueConnection(paused
        ? { paused: true, reason: 'estimator_sync_disabled', retryAt }
        : pauseMarkers.length > 0 ? { paused: true, reason: 'estimator_sync_disabled', retryAt }
        : { paused: false });
      setQueueLoadingError('');
    } catch {
      setQuoteQueue([]);
      setQueueConnection({ paused: false });
      setQueueLoadingError('Browser delivery storage is unavailable. Issued quote snapshots will not be sent until durable storage is available.');
    }
    queueOwnerRef.current = userId;
  }, []);

  const refreshIntakeProvisioning = useCallback(async () => {
    const response = await fetch('/api/intake/status');
    if (!response.ok) throw new Error(`Could not check HBUILD intake provisioning (HTTP ${response.status}).`);
    const body = await response.json() as unknown;
    const configured = intakeIsConfigured(body);
    const pause = intakePauseFromStatus(body);
    setIntakeConfigured(configured);
    setServerPause(pause);
    return { configured, pause };
  }, []);

  const loadServerDrafts = useCallback(async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await requestJson<{ drafts: EstimateDraft<EstimatorProject<T>>[] }>('/api/estimates', token);
      const filtered = response.drafts.filter(item => item.slug === slug);
      setDrafts(filtered);
      const sameSource = filtered.find(item => item.project?.sourceId === sourceIdRef.current);
      setActive(previous => (previous && filtered.find(item => item.id === previous.id)) ?? sameSource ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load shared estimates.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!session) {
      setDrafts([]);
      setActive(null);
      setRevisions([]);
      setRevisionError('');
      setDelivery(null);
      setLoading(false);
      return;
    }
    void loadServerDrafts(session.access_token);
  }, [session?.user.id, session?.access_token, loadServerDrafts]);

  useEffect(() => {
    if (!session) {
      queueOwnerRef.current = '';
      setQuoteQueue([]);
      setQueueConnection({ paused: false });
      setQueueLoadingError('');
      setIntakeConfigured(null);
      setServerPause({ paused: false });
      return;
    }
    void reloadQuoteQueue(session.user.id);
    void refreshIntakeProvisioning().catch(() => setIntakeConfigured(null));
  }, [session?.user.id, reloadQuoteQueue, refreshIntakeProvisioning]);

  const matching = useMemo(
    () => drafts.find(item => item.project?.sourceId === project.sourceId) ?? null,
    [drafts, project.sourceId],
  );
  const sameAsServer = Boolean(active && stableStringify(active.project) === stableStringify(project));
  const localTotalsResult = useMemo(
    () => {
      try {
        return {
          totals: slug === 'deck'
            ? totalsForSlug(slug, calculation, project.scope)
            : totals(calculation),
          error: '',
        };
      } catch (failure) {
        return {
          totals: { directCents: 0, companyCents: 0, incidentalsCents: 0, accidentsCents: 0, salesCents: 0, beforeTaxCents: 0 },
          error: failure instanceof Error ? failure.message : 'Local totals are unavailable for this scope.',
        };
      }
    },
    [slug, calculation, project.scope],
  );
  const localTotals = localTotalsResult.totals;
  const serverCalculationMatches = Boolean(active && stableStringify(active.calculation) === stableStringify(calculation));
  const serverTotalsMatch = Boolean(active && !localTotalsResult.error && stableStringify(active.totals) === stableStringify(localTotals));
  const serverHasIssues = Boolean(active?.calculation.issues.length);
  const authoritativeMatch = sameAsServer && serverCalculationMatches && serverTotalsMatch;
  const revisionsFor = useCallback(async (draftId: string, token: string) => {
    setRevisionError('');
    try {
      const response = await requestJson<{ revisions: IssuedQuote<EstimatorProject<T>>[] }>(
        `/api/estimates/${encodeURIComponent(draftId)}/revisions`, token,
      );
      setRevisions(response.revisions);
    } catch (failure) {
      setRevisions([]);
      setRevisionError(failure instanceof Error ? failure.message : 'Could not load issued revisions.');
    }
  }, []);

  useEffect(() => {
    if (!session || !active) {
      setRevisions([]);
      return;
    }
    void revisionsFor(active.id, session.access_token);
  }, [active?.id, session?.user.id, session?.access_token, revisionsFor]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!estimatorAuth) return;
    setError('');
    setWorking(true);
    try {
      const { error: failure } = await estimatorAuth.auth.signInWithPassword({ email, password });
      if (failure) throw failure;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in failed.');
    } finally {
      setPassword('');
      setWorking(false);
    }
  };

  const tokenNow = async () => {
    if (!estimatorAuth) throw new Error('Shared estimates sign-in is not configured.');
    const { data, error: failure } = await estimatorAuth.auth.getSession();
    if (failure) throw failure;
    if (!data.session) throw new Error('Sign in to use shared estimates.');
    return data.session.access_token;
  };

  const queueRevisionSnapshot = async (
    quote: IssuedQuote<EstimatorProject<T>>,
    token: string,
    recover = false,
  ) => {
    if (!session) throw new Error('Sign in to queue the issued quote delivery.');
    const key = `issued-quote:${session.user.id}:${quote.draftId}:${quote.revision}`;
    const all = await loadAllIntakeRecords();
    const alreadyQueued = all.filter(isIssuedQuoteDelivery).find(record => record.key === key);
    if (alreadyQueued) {
      const canonicalSourceKey = `${session.user.id}:${alreadyQueued.sourceId}`;
      if (!alreadyQueued.issuedAt || alreadyQueued.sourceKey !== canonicalSourceKey) {
        await saveIssuedQuoteDelivery({
          ...alreadyQueued,
          issuedAt: quote.issuedAt,
          sourceKey: canonicalSourceKey,
        });
      }
      await reloadQuoteQueue(session.user.id);
      return;
    }
    const frozen = await requestJson<{
      identityJson: unknown;
      proposalJson: unknown;
      takeoffJson: unknown;
    }>(`/api/estimates/${encodeURIComponent(quote.draftId)}/revisions/${quote.revision}/delivery`, token);
    const record = buildIssuedQuoteDelivery(frozen, { userId: session.user.id, slug }, quote);
    // Persist frozen JSON and IDs before any HBUILD intake request can be attempted.
    await persistIssuedQuoteDelivery(record);
    await reloadQuoteQueue(session.user.id);
    if (recover) {
      setSyncMessage(`Revision ${quote.revision} was recovered from its immutable server snapshot and saved in this browser queue. No delivery was sent.`);
    }
  };

  const checkHbuildSync = async () => {
    if (!session || syncWorking) return;
    setSyncWorking(true);
    setSyncMessage('');
    try {
      const acquired = await withExclusiveQuoteSender(session.user.id, async () => {
        try {
          const intakeStatus = await refreshIntakeProvisioning();
          if (!intakeStatus.configured) {
            setSyncMessage('HBUILD intake is not provisioned. Issued quote deliveries remain queued locally; no intake request was sent.');
            return;
          }
          let all = await loadAllIntakeRecords();
          let records = deliveriesForConnection(all, session.user.id);
          setQuoteQueue(records);
          const markers = all.filter(isQuoteQueueConnectionRecord)
            .filter(record => record.userId === session.user.id && record.paused);
          const paused = intakeStatus.pause.paused || markers.length > 0 || records.some(record => record.state === 'paused');
          const pauseRetryAt = latestRetryDeadline([
            intakeStatus.pause.retryAt,
            ...markers.map(record => record.retryAt),
            ...records.filter(record => record.state === 'paused').map(record => record.retryAt),
          ]);
          const plan = planManualSync(records, paused, pauseRetryAt);
          if (plan.kind === 'empty') {
            setSyncMessage('No pending issued-quote deliveries. Receipt-accepted revisions remain retained and unverified.');
            return;
          }
          if (plan.kind === 'attention') {
            setSyncMessage('The oldest pending issued-quote delivery needs attention. No newer delivery was sent.');
            return;
          }
          if (plan.kind === 'wait') {
            if (paused && !pauseRetryAt) {
              const migratedPause = { paused: true as const, reason: 'estimator_sync_disabled' as const, retryAt: plan.retryAt };
              await persistQuoteQueueConnection(session.user.id, migratedPause);
              setQueueConnection(migratedPause);
            }
            setSyncMessage(`HBUILD sync is paused by the office. Manual probe is available after ${new Date(plan.retryAt).toLocaleString()}; no request was sent.`);
            return;
          }
          const first = plan.next;
          if (first.record.retryAt && !retryDeadlineExpired(first.record.retryAt)) {
            setSyncMessage(`A temporary HBUILD response requested waiting until ${new Date(first.record.retryAt).toLocaleString()}. No request was sent.`);
            return;
          }

          let probing = plan.kind === 'probe';
          let halted = false;
          const sendPart = async (
            queued: IssuedQuoteDelivery,
            part: 'identity' | 'proposal' | 'takeoff',
          ) => {
            const proposedSent = markDeliverySent(queued, part);
            const sent = await saveIssuedQuoteDelivery(proposedSent);
            all = await loadAllIntakeRecords();
            records = deliveriesForConnection(all, session.user.id);
            setQuoteQueue(records);
            if (sent.state !== 'sent' || sent[`${part}Done`] || sent[`${part}Stale`] || sent[`${part}Attention`]) {
              setSyncMessage('This queue item changed in another tab and was not sent. Reloaded durable queue progress safely.');
              halted = true;
              return { kind: 'attention' as const, message: 'Queue item changed concurrently.' };
            }
            const token = await tokenNow();
            let status = 0;
            let payload: unknown = null;
            let retryAfterHeader: string | null = null;
            try {
              const response = await fetch(`/api/intake/${part === 'identity' ? 'projects' : 'documents'}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
                body: sent[`${part}Json`],
              });
              status = response.status;
              retryAfterHeader = response.headers.get('Retry-After');
              try { payload = await response.json(); } catch { payload = null; }
            } catch {
              status = 0;
            }
            const decision = decideIntakeResponse({ status, body: payload, retryAfterHeader });
            const transition = transitionAfterResponse(sent, part, decision);
            await saveIssuedQuoteDelivery(transition.record);
            all = await loadAllIntakeRecords();
            records = deliveriesForConnection(all, session.user.id);
            setQuoteQueue(records);

            if (transition.connection) {
              setQueueConnection(transition.connection);
              await persistQuoteQueueConnection(session.user.id, transition.connection);
              setSyncMessage('HBUILD sync paused by the office. Frozen deliveries remain queued; nothing was verified or released.');
              halted = true;
            } else if (decision.kind === 'transient') {
              if (!probing) setQueueConnection({ paused: false });
              setSyncMessage(`Temporary HBUILD response. This exact delivery is retained for a manual retry after ${transition.record.retryAt ? new Date(transition.record.retryAt).toLocaleString() : 'the retry-after period'}.`);
              halted = true;
            } else if (decision.kind === 'attention') {
              setSyncMessage(`HBUILD needs attention: ${decision.message} This delivery will not be retried automatically.`);
              halted = true;
            } else if (decision.kind === 'accepted' || decision.kind === 'stale') {
              if (probing) {
                await persistQuoteQueueConnection(session.user.id, { paused: false });
                for (const pausedRecord of records.filter(record => record.state === 'paused')) {
                  await resumePausedIssuedQuoteDelivery(pausedRecord.key);
                }
                all = await loadAllIntakeRecords();
                records = deliveriesForConnection(all, session.user.id);
                setQuoteQueue(records);
                setQueueConnection({ paused: false });
                setServerPause({ paused: false });
                probing = false;
              }
              setSyncMessage(decision.kind === 'stale'
                ? `HBUILD marked revision ${transition.record.revision} ${part} stale. The frozen snapshot remains retained; no verification or release is implied.`
                : `HBUILD accepted the ${part} receipt for revision ${transition.record.revision}; readback remains unverified.`);
            }
            return decision;
          };

          if (probing) {
            const result = await sendPart(first.record, first.part);
            if (result.kind !== 'accepted' && result.kind !== 'stale') halted = true;
          }

          // After a successful one-request probe, drain all modules in immutable quote-issued order.
          while (!halted) {
            const next = nextPendingDelivery(records);
            if (!next) {
              if (records.some(record => pendingDeliveryCount(record) > 0)) {
                setSyncMessage('The oldest pending issued-quote delivery needs attention. No newer delivery was sent.');
                halted = true;
              }
              break;
            }
            if (next.record.retryAt && !retryDeadlineExpired(next.record.retryAt)) {
              setSyncMessage(`A temporary HBUILD response requested waiting until ${new Date(next.record.retryAt).toLocaleString()}. No later delivery was sent.`);
              break;
            }
            await sendPart(next.record, next.part);
          }
          if (!halted && !nextPendingDelivery(records)) {
            setSyncMessage('Queue check complete. Accepted receipts remain unverified and nothing has been released.');
          }
        } catch (failure) {
          setSyncMessage(failure instanceof Error ? failure.message : 'Could not check the issued quote queue.');
        }
      });
      if (!acquired) {
        setSyncMessage('HBUILD queue sync is unavailable or already running in another tab. This browser fails closed without an exclusive sender lock.');
      }
    } catch (failure) {
      setSyncMessage(failure instanceof Error ? failure.message : 'Could not claim the HBUILD sender lock.');
    } finally {
      setSyncWorking(false);
    }
  };

  const loadServer = async (item: EstimateDraft<EstimatorProject<T>>) => {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const token = await tokenNow();
      const fetched = await requestJson<EstimateDraft<EstimatorProject<T>>>(
        `/api/estimates/${encodeURIComponent(item.id)}`, token,
      );
      onLoadProject(fetched.project);
      setActive(fetched);
      setDrafts(previous => [fetched, ...previous.filter(item => item.id !== fetched.id)]);
      setDelivery(null);
      setConflictDraftId('');
      setNotice(`Loaded server draft version ${fetched.version}. Your previous local version remains in this browser's local draft history.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load server draft.');
    } finally {
      setWorking(false);
    }
  };

  const saveLocal = async (localProject: EstimatorProject<T>) => {
    setWorking(true);
    setError('');
    setNotice('');
    setConflictDraftId('');
    try {
      const token = await tokenNow();
      const serverMatch = drafts.find(item => item.project?.sourceId === localProject.sourceId);
      const saved = serverMatch
        ? await requestJson<EstimateDraft<EstimatorProject<T>>>(
          `/api/estimates/${encodeURIComponent(serverMatch.id)}`, token, 'PUT',
          { expectedVersion: serverMatch.version, project: localProject },
        )
        : await requestJson<EstimateDraft<EstimatorProject<T>>>('/api/estimates', token, 'POST',
          { slug, project: localProject });
      setActive(saved);
      setDelivery(null);
      setDrafts(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      setNotice(`Saved to shared estimates · version ${saved.version}.`);
      setConflictDraftId('');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not save shared draft.';
      setError(message);
      if (message.includes('409')) {
        const conflict = drafts.find(item => item.project?.sourceId === localProject.sourceId);
        setConflictDraftId(conflict?.id ?? '');
      }
    } finally {
      setWorking(false);
    }
  };

  const reloadConflict = async () => {
    const target = drafts.find(item => item.id === conflictDraftId) ?? active;
    if (target) await loadServer(target);
  };

  const issueQuote = async () => {
    if (!active || !authoritativeMatch || calculation.issues.length || serverHasIssues || issuanceBlockReason) return;
    if (!window.confirm('Issue an immutable quote revision using this saved server version? BEFORE TAX ONLY: tax is not calculated, this is not a tax-inclusive final amount, and it is not released to the client.')) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const token = await tokenNow();
      const quote = await requestJson<IssuedQuote<EstimatorProject<T>>>(
        `/api/estimates/${encodeURIComponent(active.id)}/issue`, token, 'POST',
        { expectedVersion: active.version },
      );
      setNotice(`Issued fixed quote revision ${quote.revision} from draft version ${quote.draftVersion}. BEFORE TAX ONLY; not tax-inclusive and not released to the client.`);
      try {
        await queueRevisionSnapshot(quote, token);
        setNotice(previous => `${previous} Frozen delivery bodies and IDs are safely queued in this browser; sync has not been attempted.`);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Quote issued, but its frozen delivery could not be queued. Use the revision recovery action.');
      }
      await revisionsFor(active.id, token);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not issue quote revision.';
      setError(message);
      if (message.includes('409')) setConflictDraftId(active.id);
    } finally {
      setWorking(false);
    }
  };

  const downloadFixedPdf = async (quote: IssuedQuote<EstimatorProject<T>>, type: 'proposal' | 'takeoff') => {
    setWorking(true);
    setError('');
    try {
      const token = await tokenNow();
      const response = await fetch(
        `/api/estimates/${encodeURIComponent(quote.draftId)}/revisions/${quote.revision}/pdf/${type}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        let detail = `Fixed PDF request failed (${response.status}).`;
        try {
          const payload = await response.json() as { error?: unknown };
          if (typeof payload.error === 'string') detail = payload.error;
        } catch { /* retain explicit status error */ }
        throw new Error(detail);
      }
      const blob = await response.blob();
      if (blob.type && !blob.type.includes('pdf')) throw new Error('Estimates service returned a non-PDF document.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `estimate-revision-${quote.revision}-${type}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not download fixed PDF.');
    } finally {
      setWorking(false);
    }
  };

  const loadDelivery = async (quote: IssuedQuote<EstimatorProject<T>>) => {
    setWorking(true);
    setError('');
    try {
      const token = await tokenNow();
      const response = await requestJson<unknown>(
        `/api/estimates/${encodeURIComponent(quote.draftId)}/revisions/${quote.revision}/delivery`, token,
      );
      setDelivery({
        revision: quote.revision,
        deliveryId: nestedString(response, 'identityJson', 'deliveryId'),
        draftId: nestedString(response, 'identityJson', 'draftId'),
        projectId: nestedString(response, 'identityJson', 'projectId'),
        proposalDocumentId: nestedString(response, 'proposalJson', 'documentId'),
        takeoffDocumentId: nestedString(response, 'takeoffJson', 'documentId'),
        proposalSha256Prefix: hashPrefix(nestedString(response, 'proposalSha256')),
        takeoffSha256Prefix: hashPrefix(nestedString(response, 'takeoffSha256')),
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load frozen delivery.');
    } finally {
      setWorking(false);
    }
  };

  const recoverRevision = async (quote: IssuedQuote<EstimatorProject<T>>) => {
    setWorking(true);
    setError('');
    setSyncMessage('');
    try {
      const token = await tokenNow();
      await queueRevisionSnapshot(quote, token, true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not recover the frozen issued revision.');
    } finally {
      setWorking(false);
    }
  };

  const serverDiverged = Boolean(matching && stableStringify(matching.project) !== stableStringify(project));
  const estimateMismatch = Boolean(active && (!serverCalculationMatches || !serverTotalsMatch));
  const effectiveQueueConnection = useMemo(() => {
    const retryAt = latestRetryDeadline([queueConnection.retryAt, serverPause.retryAt]);
    return queueConnection.paused || serverPause.paused
      ? { paused: true, reason: 'estimator_sync_disabled' as const, retryAt }
      : { paused: false };
  }, [queueConnection, serverPause]);

  return (
    <section className="rounded-xl border border-primary/25 bg-card/70 p-5 space-y-4" aria-labelledby={`${slug}-shared-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="scroll-mt-32 text-lg font-semibold" id={`${slug}-shared-title`}>Shared drafts & fixed quotes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Local autosave and offline exports remain available. Server changes happen only when you choose an explicit action.</p>
        </div>
        {session && <Button type="button" variant="outline" size="sm" data-testid="button-sign-out-shared" onClick={() => void estimatorAuth?.auth.signOut()}>Sign out</Button>}
      </div>

      {!estimatorAuth ? (
        <p className="text-sm text-amber-300" role="status">Shared estimates are unavailable because sign-in is not configured. Local drafts and downloads remain available.</p>
      ) : !session ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Sign in here, then save or load a server draft. The “Issue before-tax quote revision” button appears with that draft.</p>
          <form onSubmit={signIn} className="flex flex-col gap-2 sm:flex-row" aria-label="Sign in to shared estimates">
            <Input data-testid="input-shared-email" type="email" autoComplete="username" aria-label="HBUILD email" placeholder="HBUILD email" value={email} onChange={event => setEmail(event.target.value)} required />
            <Input data-testid="input-shared-password" type="password" autoComplete="current-password" aria-label="Password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required />
            <Button data-testid="button-sign-in-shared" type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in to load shared drafts'}</Button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground" role="status" data-testid="status-shared-save">
            {loading ? 'Loading shared drafts…' : active
              ? `${sameAsServer ? 'Saved to server' : 'Current local edits are not saved'} · server version ${active.version} · policy ${active.policyVersion} · rates ${active.rateBookVersion}`
              : matching ? `Matching shared draft version ${matching.version} · policy ${matching.policyVersion} · rates ${matching.rateBookVersion}`
              : 'This local draft has not been saved to the server.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" data-testid="button-save-shared-draft" disabled={working || loading} onClick={() => void saveLocal(project)}>
              {working ? 'Working…' : matching ? 'Upload local edits to server' : 'Save local draft to server'}
            </Button>
            <Button type="button" variant="outline" data-testid="button-refresh-shared-drafts" disabled={working} onClick={() => void loadServerDrafts(session.access_token)}>Refresh server list</Button>
          </div>

          {matching && (
            <div className={`rounded-lg border p-3 text-sm ${serverDiverged ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-background/40'}`} data-testid="status-source-reconciliation">
              <strong>Same source ID found.</strong>{' '}
              {serverDiverged
                ? 'Local edits differ from the server copy. Neither version was replaced; choose upload local or load server.'
                : 'Local and server project content currently match.'}
              <p className="mt-1 text-xs text-muted-foreground">Server draft ID: <span className="font-mono break-all">{matching.id}</span> · version {matching.version}</p>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-medium">Server drafts · {drafts.length}</h3>
            {drafts.length === 0 && !loading && <p className="text-sm text-muted-foreground">No shared drafts for this estimator yet.</p>}
            <ul className="space-y-2">
              {drafts.map(item => (
                <li key={item.id} className="flex flex-col justify-between gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center" data-testid={`row-server-draft-${item.id}`}>
                  <div className="min-w-0">
                    <p className="font-medium">{item.project.projectName || 'Untitled project'}</p>
                    <p className="text-xs text-muted-foreground">{item.project.firstName} {item.project.lastName} · version {item.version} · {new Date(item.updatedAt).toLocaleString()}</p>
                    <p className="break-all text-xs text-muted-foreground">Source ID: {item.project.sourceId}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={working} data-testid={`button-load-server-${item.id}`} onClick={() => void loadServer(item)}>Load server copy</Button>
                </li>
              ))}
            </ul>
          </div>

          {localDrafts.length > 1 && (
            <div className="space-y-2">
              <h3 className="font-medium">Local draft history · {localDrafts.length}</h3>
              <ul className="space-y-2">
                {localDrafts.slice(1).map((item, index) => (
                  <li key={`${item.sourceId}-${index}`} className="flex flex-col justify-between gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <p className="font-medium">{item.projectName || 'Untitled project'} · {item.firstName} {item.lastName}</p>
                      <p className="break-all text-xs text-muted-foreground">Source ID: {item.sourceId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => onLoadLocalProject(item)}>Load local copy</Button>
                      <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void saveLocal(item)}>Upload this local copy</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2" data-testid="panel-authoritative-estimate">
                <h3 className="font-medium">Local review vs server-authoritative saved estimate</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-border/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {slug === 'deck' ? 'Deck scope · server-policy comparison (before tax)' : 'Current local calculation'}
                    </p>
                    <p className="mt-1 text-sm">Direct cost: <strong>{localTotalsResult.error ? 'Unavailable' : money(localTotals.directCents)}</strong></p>
                    <p className="text-sm">Before tax: <strong>{localTotalsResult.error ? 'Unavailable' : money(localTotals.beforeTaxCents)}</strong></p>
                    <p className="text-xs">Calculation issues: {calculation.issues.length}</p>
                  </div>
                  <div className="rounded border border-primary/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved on server · version {active.version}</p>
                    <p className="mt-1 text-sm">Direct cost: <strong>{money(active.totals.directCents)}</strong></p>
                    <p className="text-sm">Before tax: <strong>{money(active.totals.beforeTaxCents)}</strong></p>
                    <p className="text-xs">Server calculation issues: {active.calculation.issues.length}</p>
                  </div>
                </div>
                {localTotalsResult.error && (
                  <p className="text-sm text-amber-300" role="alert">
                    Server-policy local totals are unavailable for this scope: {localTotalsResult.error}
                  </p>
                )}
                {active.calculation.issues.length > 0 && (
                  <div className="rounded border border-amber-600/40 bg-amber-500/10 p-3" role="status">
                    <p className="text-sm font-medium">Server-authoritative calculation issues</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {active.calculation.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
                    </ul>
                  </div>
                )}
                {estimateMismatch && (
                  <p className="text-sm text-amber-300" role="alert">
                    The saved server calculation or totals differ from the current local calculation. Review both results and explicitly re-save before issuing; project-field equality alone is not sufficient.
                  </p>
                )}
                {!sameAsServer && (
                  <p className="text-sm text-amber-300" role="status">The current local project differs from this saved server project. Re-save or load a copy before issuance.</p>
                )}
                <p className="text-xs font-bold text-amber-300">
                  BEFORE TAX ONLY — not tax-inclusive, not a final tax-calculated amount, and not released to the client.
                </p>
              </div>
              <div>
                <h3 className="font-medium">Issue immutable quote</h3>
                <p className="text-xs text-muted-foreground">Requires an unchanged saved server version, matching server calculation and totals, and complete pricing. An issued revision is frozen but is not final tax-inclusive or released.</p>
              </div>
              {calculation.issues.length > 0 && <p className="text-sm text-amber-300" role="status">Issuance blocked: resolve all {calculation.issues.length} calculation issue(s).</p>}
              {serverHasIssues && <p className="text-sm text-amber-300" role="status">Issuance blocked: resolve server-authoritative calculation issues and re-save.</p>}
              {!sameAsServer && !estimateMismatch && <p className="text-sm text-amber-300" role="status">Save the current local edits to this server draft before issuing.</p>}
              {issuanceBlockReason && <p className="text-sm text-amber-300" role="alert">{issuanceBlockReason}</p>}
              <Button type="button" data-testid="button-issue-quote" disabled={working || loading || !authoritativeMatch || calculation.issues.length > 0 || serverHasIssues || Boolean(issuanceBlockReason)} onClick={() => void issueQuote()}>
                Issue before-tax quote revision
              </Button>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Issued revision history · {revisions.length}</h4>
                {revisionError && <p className="text-sm text-destructive" role="alert">{revisionError}</p>}
                {revisions.length === 0 && !revisionError && <p className="text-xs text-muted-foreground">No issued revisions.</p>}
                <ul className="space-y-2">
                  {revisions.map(quote => (
                    <li key={quote.id} className="rounded-lg border border-border p-3" data-testid={`row-quote-revision-${quote.revision}`}>
                      <p className="text-sm font-medium">Revision {quote.revision} · draft version {quote.draftVersion} · BEFORE TAX ONLY</p>
                      <p className="text-xs font-semibold text-amber-300">Not tax-inclusive; not released to the client.</p>
                      <p className="text-xs text-muted-foreground">Issued {new Date(quote.issuedAt).toLocaleString()} · {quote.issuedBy} · policy {quote.policyVersion} · rates {quote.rateBookVersion}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void downloadFixedPdf(quote, 'proposal')}>Download fixed proposal PDF</Button>
                        <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void downloadFixedPdf(quote, 'takeoff')}>Download fixed takeoff PDF</Button>
                        <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => void loadDelivery(quote)}>View frozen delivery</Button>
                         <Button type="button" variant="outline" size="sm" disabled={working || queueLoadingError !== ''} onClick={() => void recoverRevision(quote)}>
                           {quoteQueue.some(item => item.draftId === quote.draftId && item.revision === quote.revision)
                             ? 'Confirm local queue copy' : 'Queue frozen delivery for recovery'}
                         </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {delivery && (
                <section className="rounded border border-border p-3 space-y-2" aria-label={`Frozen delivery metadata for revision ${delivery.revision}`}>
                  <h4 className="text-sm font-medium">Frozen delivery metadata · revision {delivery.revision}</h4>
                  <p className="text-xs font-semibold text-amber-300">Readback status: UNVERIFIED. No raw delivery content is displayed.</p>
                  <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
                    <dt>Delivery ID</dt><dd className="break-all font-mono">{delivery.deliveryId || 'Unavailable'}</dd>
                    <dt>Draft ID</dt><dd className="break-all font-mono">{delivery.draftId || 'Unavailable'}</dd>
                    <dt>Project ID</dt><dd className="break-all font-mono">{delivery.projectId || 'Unavailable'}</dd>
                    <dt>Proposal document ID</dt><dd className="break-all font-mono">{delivery.proposalDocumentId || 'Unavailable'}</dd>
                    <dt>Proposal SHA-256 prefix</dt><dd className="font-mono">{delivery.proposalSha256Prefix || 'Unavailable'}</dd>
                    <dt>Takeoff document ID</dt><dd className="break-all font-mono">{delivery.takeoffDocumentId || 'Unavailable'}</dd>
                    <dt>Takeoff SHA-256 prefix</dt><dd className="font-mono">{delivery.takeoffSha256Prefix || 'Unavailable'}</dd>
                  </dl>
                </section>
              )}
            </div>
          )}
          {queueLoadingError && <p className="text-sm text-destructive" role="alert">{queueLoadingError}</p>}
          <IssuedQuoteQueuePanel
            deliveries={quoteQueue}
            connection={effectiveQueueConnection}
            configured={intakeConfigured}
            working={syncWorking || working}
            syncMessage={syncMessage}
            onCheckSync={() => void checkHbuildSync()}
          />
        </div>
      )}
      {error && <div className="flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">{error}</p>
        {conflictDraftId && <Button type="button" variant="outline" size="sm" disabled={working} data-testid="button-reload-conflict" onClick={() => void reloadConflict()}>Reload server copy</Button>}
      </div>}
      {notice && <p className="text-sm text-primary" role="status">{notice}</p>}
    </section>
  );
}