import { Button } from '@/components/ui/button';
import type { IssuedQuoteDelivery } from '@/lib/intakeQueue';
import { queueSummary, stateLabel, type QuoteQueueConnection } from '@/lib/issuedQuoteQueue';

function ageLabel(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function IssuedQuoteQueuePanel({
  deliveries, connection, configured, working, syncMessage, onCheckSync,
}: {
  deliveries: IssuedQuoteDelivery[];
  connection: QuoteQueueConnection;
  configured: boolean | null;
  working: boolean;
  syncMessage: string;
  onCheckSync: () => void;
}) {
  const summary = queueSummary(deliveries);
  const paused = connection.paused;
  const retryAt = deliveries.reduce<string | undefined>((earliest, item) => {
    if (!item.retryAt) return earliest;
    return !earliest || Date.parse(item.retryAt) < Date.parse(earliest) ? item.retryAt : earliest;
  }, undefined);
  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-background/40 p-4" aria-label="Issued quote HBUILD sync queue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-medium">Issued quote delivery queue · {summary.count} deliveries waiting</h4>
          <p className="text-xs text-muted-foreground">Oldest waiting delivery: {ageLabel(summary.oldestAgeMs)} ago.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={working} onClick={onCheckSync}>
          {working ? 'Checking…' : 'Check HBUILD sync'}
        </Button>
      </div>
      {configured === false ? (
        <p className="text-sm text-amber-200" role="status">
          HBUILD intake is not provisioned. {summary.count} deliveries remain queued locally; no intake request was sent.
        </p>
      ) : configured === null ? (
        <p className="text-xs text-muted-foreground" role="status">Checking HBUILD intake provisioning. Queue records remain local until provisioned.</p>
      ) : null}
      {paused ? (
        <p className="text-sm text-amber-200" role="status">
          HBUILD sync paused by the office — {summary.count} deliveries waiting
          {connection.retryAt ? ` · server retry-after ${new Date(connection.retryAt).toLocaleString()}` : ''}.
          No delivery is verified or released.
        </p>
      ) : null}
      {configured === true && !paused && retryAt ? (
        <p className="text-xs text-muted-foreground" role="status">
          A temporary HBUILD response requested a bounded wait until {new Date(retryAt).toLocaleString()}. Check sync manually after that time.
        </p>
      ) : null}
      {configured === true && !paused && !retryAt ? (
        <p className="text-xs text-muted-foreground" role="status">
          Queue records are durable in this browser. Sync starts only when you choose Check HBUILD sync; receipts are not readback verification or release.
        </p>
      ) : null}
      {syncMessage && <p className="text-sm text-muted-foreground" role="status">{syncMessage}</p>}
      {deliveries.length > 0 && (
        <ul className="space-y-2">
          {deliveries.slice().sort((a, b) => b.revision - a.revision).map(item => (
            <li key={item.key} className="rounded border border-border/70 p-3 text-xs" data-testid={`row-issued-queue-${item.revision}`}>
              <p className="font-medium">{item.slug} · Revision {item.revision} · {stateLabel(item.state)}</p>
              <p>Identity: {item.identityDone ? 'receipt accepted' : item.identityStale ? 'stale' : item.identityAttention ? 'needs attention' : 'waiting'}</p>
              <p>Proposal: {item.proposalDone ? 'receipt accepted' : item.proposalStale ? 'stale' : item.proposalAttention ? 'needs attention' : 'waiting'}</p>
              <p>Takeoff: {item.takeoffDone ? 'receipt accepted' : item.takeoffStale ? 'stale' : item.takeoffAttention ? 'needs attention' : 'waiting'}</p>
              {item.lastError && <p className="mt-1 text-amber-200">{item.lastError}</p>}
              <p className="mt-1 text-muted-foreground">Frozen at {new Date(item.createdAt).toLocaleString()} · acceptance does not mean readback verified or released.</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Frozen request bodies, PDF bytes, and delivery IDs are retained. HBUILD receipt acceptance is not verification, approval, or client release.</p>
    </section>
  );
}