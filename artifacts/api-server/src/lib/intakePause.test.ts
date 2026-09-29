import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claimIntakePauseGate,
  describeIntakePause,
  decideIntakePause,
  type IntakePauseRepository,
  type IntakePauseSnapshot,
} from "./intakePause";

const now = new Date("2026-09-29T12:00:00.000Z");

test("pure pause decisions distinguish open, waiting, and probe-claim states", () => {
  assert.deepEqual(decideIntakePause(undefined, now), { kind: "allow" });
  assert.deepEqual(decideIntakePause({
    pausedUntil: new Date(now.getTime() + 15_100),
    probeClaimedUntil: null,
  }, now), { kind: "paused", retryAfterSeconds: 16 });
  assert.deepEqual(decideIntakePause({
    pausedUntil: new Date(now.getTime() - 1),
    probeClaimedUntil: new Date(now.getTime() + 9_000),
  }, now), { kind: "paused", retryAfterSeconds: 9 });
  const due = decideIntakePause({
    pausedUntil: new Date(now.getTime() - 1),
    probeClaimedUntil: null,
  }, now);
  assert.deepEqual(due, {
    kind: "claim-probe",
    claimUntil: new Date(now.getTime() + 60_000),
  });
});

test("read-only pause status exposes a next retry delay without claiming a probe", () => {
  assert.equal(describeIntakePause(undefined, now), undefined);
  assert.deepEqual(describeIntakePause({
    pausedUntil: new Date(now.getTime() + 12_000),
    probeClaimedUntil: null,
  }, now), {
    paused: true,
    reason: "estimator_sync_disabled",
    retryAfterSeconds: 12,
  });
  assert.deepEqual(describeIntakePause({
    pausedUntil: new Date(now.getTime() - 5_000),
    probeClaimedUntil: null,
  }, now), {
    paused: true,
    reason: "estimator_sync_disabled",
    retryAfterSeconds: 1,
  });
  assert.deepEqual(describeIntakePause({
    pausedUntil: new Date(now.getTime() - 5_000),
    probeClaimedUntil: new Date(now.getTime() + 8_000),
  }, now), {
    paused: true,
    reason: "estimator_sync_disabled",
    retryAfterSeconds: 8,
  });
});

test("gate atomically allows only one due probe", async () => {
  let state: IntakePauseSnapshot = {
    pausedUntil: new Date(now.getTime() - 1),
    probeClaimedUntil: null,
  };
  const repository: IntakePauseRepository = {
    async ensure() {},
    async claimProbe(_orgId, at, claimUntil) {
      const decision = decideIntakePause(state, at);
      if (decision.kind !== "claim-probe") return false;
      state = { ...state, probeClaimedUntil: claimUntil };
      return true;
    },
    async read() { return state; },
  };

  const [first, second] = await Promise.all([
    claimIntakePauseGate("org-id", repository, now),
    claimIntakePauseGate("org-id", repository, now),
  ]);
  assert.deepEqual([first.kind, second.kind].sort(), ["allow", "paused"]);
});

test("repository failures fail closed without granting a delivery", async () => {
  let probeClaims = 0;
  const repository: IntakePauseRepository = {
    async ensure() { throw new Error("database unavailable"); },
    async claimProbe() { probeClaims += 1; return true; },
    async read() { return undefined; },
  };

  assert.deepEqual(await claimIntakePauseGate("org-id", repository, now), { kind: "unavailable" });
  assert.equal(probeClaims, 0);
});