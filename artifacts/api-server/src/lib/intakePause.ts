import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db, estimatorIntakeConnectionsTable } from "@workspace/db";

const PROBE_LEASE_MS = 60_000;

export type IntakePauseSnapshot = {
  pausedUntil: Date | null;
  probeClaimedUntil: Date | null;
};

export type IntakePauseDecision =
  | { kind: "allow" }
  | { kind: "paused"; retryAfterSeconds: number }
  | { kind: "claim-probe"; claimUntil: Date };

export type IntakePauseGateResult =
  | { kind: "allow"; probe: boolean }
  | { kind: "paused"; retryAfterSeconds: number }
  | { kind: "unavailable" };

export type IntakePauseRepository = {
  ensure(orgId: string): Promise<void>;
  claimProbe(orgId: string, now: Date, claimUntil: Date): Promise<boolean>;
  read(orgId: string): Promise<IntakePauseSnapshot | undefined>;
};

function secondsUntil(at: Date, now: Date) {
  return Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 1000));
}

export function decideIntakePause(
  state: IntakePauseSnapshot | undefined,
  now: Date,
  probeLeaseMs = PROBE_LEASE_MS,
): IntakePauseDecision {
  if (!state?.pausedUntil) return { kind: "allow" };
  if (state.pausedUntil.getTime() > now.getTime())
    return { kind: "paused", retryAfterSeconds: secondsUntil(state.pausedUntil, now) };
  if (state.probeClaimedUntil && state.probeClaimedUntil.getTime() > now.getTime())
    return { kind: "paused", retryAfterSeconds: secondsUntil(state.probeClaimedUntil, now) };
  return { kind: "claim-probe", claimUntil: new Date(now.getTime() + probeLeaseMs) };
}

export function describeIntakePause(
  state: IntakePauseSnapshot | undefined,
  now = new Date(),
): { paused: true; reason: "estimator_sync_disabled"; retryAfterSeconds: number } | undefined {
  if (!state?.pausedUntil) return undefined;
  const nextProbeAt = state.probeClaimedUntil &&
    state.probeClaimedUntil.getTime() > state.pausedUntil.getTime()
    ? state.probeClaimedUntil
    : state.pausedUntil;
  return {
    paused: true,
    reason: "estimator_sync_disabled",
    retryAfterSeconds: secondsUntil(nextProbeAt, now),
  };
}

export async function claimIntakePauseGate(
  orgId: string,
  repository: IntakePauseRepository = databaseRepository,
  now = new Date(),
): Promise<IntakePauseGateResult> {
  try {
    await repository.ensure(orgId);
    if (await repository.claimProbe(orgId, now, new Date(now.getTime() + PROBE_LEASE_MS)))
      return { kind: "allow", probe: true };

    let state = await repository.read(orgId);
    let decision = decideIntakePause(state, now);
    if (decision.kind === "claim-probe") {
      if (await repository.claimProbe(orgId, now, decision.claimUntil))
        return { kind: "allow", probe: true };
      state = await repository.read(orgId);
      decision = decideIntakePause(state, now);
      // A due pause that could not be claimed indicates a racing or unhealthy
      // repository. Refuse the request rather than sending without ownership.
      if (decision.kind === "claim-probe") return { kind: "unavailable" };
    }
    if (decision.kind === "paused") return decision;
    return { kind: "allow", probe: false };
  } catch {
    return { kind: "unavailable" };
  }
}

const databaseRepository: IntakePauseRepository = {
  async ensure(orgId) {
    await db.insert(estimatorIntakeConnectionsTable)
      .values({ orgId })
      .onConflictDoNothing({ target: estimatorIntakeConnectionsTable.orgId });
  },

  async claimProbe(orgId, now, claimUntil) {
    const claimed = await db.update(estimatorIntakeConnectionsTable)
      .set({ probeClaimedUntil: claimUntil, updatedAt: now })
      .where(and(
        eq(estimatorIntakeConnectionsTable.orgId, orgId),
        lte(estimatorIntakeConnectionsTable.pausedUntil, now),
        or(
          isNull(estimatorIntakeConnectionsTable.probeClaimedUntil),
          lte(estimatorIntakeConnectionsTable.probeClaimedUntil, now),
        ),
      ))
      .returning({ orgId: estimatorIntakeConnectionsTable.orgId });
    return claimed.length === 1;
  },

  async read(orgId) {
    const [state] = await db.select({
      pausedUntil: estimatorIntakeConnectionsTable.pausedUntil,
      probeClaimedUntil: estimatorIntakeConnectionsTable.probeClaimedUntil,
    }).from(estimatorIntakeConnectionsTable)
      .where(eq(estimatorIntakeConnectionsTable.orgId, orgId))
      .limit(1);
    return state;
  },
};

export async function readIntakePauseStatus(
  orgId: string,
  now = new Date(),
): Promise<ReturnType<typeof describeIntakePause>> {
  const [state] = await db.select({
    pausedUntil: estimatorIntakeConnectionsTable.pausedUntil,
    probeClaimedUntil: estimatorIntakeConnectionsTable.probeClaimedUntil,
  }).from(estimatorIntakeConnectionsTable)
    .where(eq(estimatorIntakeConnectionsTable.orgId, orgId))
    .limit(1);
  return describeIntakePause(state, now);
}

export async function persistIntakePause(orgId: string, retryAfterSeconds: number): Promise<void> {
  const now = new Date();
  const until = new Date(now.getTime() + retryAfterSeconds * 1000);
  await db.insert(estimatorIntakeConnectionsTable)
    .values({ orgId, pausedUntil: until, probeClaimedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: estimatorIntakeConnectionsTable.orgId,
      set: { pausedUntil: until, probeClaimedUntil: null, updatedAt: now },
    });
}

export async function clearIntakePause(orgId: string): Promise<void> {
  const now = new Date();
  await db.update(estimatorIntakeConnectionsTable)
    .set({ pausedUntil: null, probeClaimedUntil: null, updatedAt: now })
    .where(eq(estimatorIntakeConnectionsTable.orgId, orgId));
}