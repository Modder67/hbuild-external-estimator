import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { deliverSignedIntake } from "./signedIntake";

const keyId = "stub-key";
const secret = "stub-secret";
const deliveryId = "saved-delivery-key";
const payload = { source: { id: "source-1" }, project: { externalId: "project-1" } };
let server: Server;
let baseUrl: URL;
let nextResponse: {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
};

before(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const timestamp = request.headers["x-hbuild-timestamp"];
      const keyHash = createHash("sha256").update(secret).digest("hex");
      const expected = createHmac("sha256", keyHash).update(`${timestamp}.${raw}`).digest("hex");
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/intake/v1/projects");
      assert.equal(request.headers["x-hbuild-key"], keyId);
      assert.equal(request.headers["idempotency-key"], deliveryId);
      assert.equal(request.headers["x-hbuild-signature"], expected);
      assert.deepEqual(JSON.parse(raw), payload);

      response.writeHead(nextResponse.status, {
        "content-type": "application/json",
        ...nextResponse.headers,
      });
      response.end(JSON.stringify(nextResponse.body));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = new URL(`http://127.0.0.1:${address.port}`);
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
});

async function deliver() {
  return deliverSignedIntake({ url: baseUrl, keyId, secret }, "projects", deliveryId, payload);
}

test("forwards the paused marker and bounds its Retry-After", async () => {
  nextResponse = {
    status: 503,
    headers: { "Retry-After": "999999" },
    body: { ok: false, error: { details: { reason: "estimator_sync_disabled" } } },
  };
  assert.deepEqual(await deliver(), {
    status: 503,
    error: "H Ledger synchronization is paused by the office. Keep this delivery and retry after synchronization resumes.",
    paused: true,
    reason: "estimator_sync_disabled",
    retryAfterSeconds: 86400,
  });
});

test("ordinary 503 and 429 expose bounded Retry-After without pausing", async () => {
  nextResponse = { status: 503, headers: { "Retry-After": "20" }, body: { ok: false } };
  assert.deepEqual(await deliver(), {
    status: 503,
    error: "H Ledger intake is unavailable; this delivery can be retried.",
    retryAfterSeconds: 20,
  });

  nextResponse = { status: 429, headers: { "Retry-After": "0" }, body: { ok: false } };
  assert.deepEqual(await deliver(), {
    status: 429,
    error: "H Ledger is rate-limiting deliveries; retry later with this same saved delivery.",
    retryAfterSeconds: 1,
  });
});

test("preserves applied replay and stale outcomes", async () => {
  nextResponse = {
    status: 200,
    headers: { "Idempotent-Replayed": "true" },
    body: { ok: true, data: { outcome: "applied" } },
  };
  assert.deepEqual(await deliver(), { outcome: "applied", replayed: true });

  nextResponse = { status: 200, body: { ok: true, data: { outcome: "stale" } } };
  assert.deepEqual(await deliver(), { outcome: "stale", replayed: false });
});

test("401 and 409 remain attention results, not pause results", async () => {
  nextResponse = { status: 401, body: { ok: false, error: { details: { reason: "revoked" } } } };
  assert.deepEqual(await deliver(), {
    status: 401,
    error: "H Ledger denied the intake account; ask an administrator to review its grant.",
  });

  nextResponse = { status: 409, body: { ok: false, error: { code: "conflict" } } };
  assert.deepEqual(await deliver(), {
    status: 409,
    error: "H Ledger requires review of this mapping or delivery. No new job was created here.",
  });
});

test("pause is detected only by the parsed details reason marker", async () => {
  nextResponse = { status: 503, body: { ok: false, error: { message: "estimator_sync_disabled" } } };
  const result = await deliver();
  assert.ok("status" in result);
  assert.equal(result.paused, undefined);
});

test("contradictory status and body combinations follow HTTP status precedence", async () => {
  nextResponse = {
    status: 401,
    body: {
      ok: true,
      data: { outcome: "applied" },
      error: { details: { reason: "estimator_sync_disabled" } },
    },
  };
  assert.deepEqual(await deliver(), {
    status: 401,
    error: "H Ledger denied the intake account; ask an administrator to review its grant.",
  });

  nextResponse = {
    status: 409,
    body: { ok: true, data: { outcome: "applied" } },
  };
  assert.deepEqual(await deliver(), {
    status: 409,
    error: "H Ledger requires review of this mapping or delivery. No new job was created here.",
  });

  nextResponse = {
    status: 503,
    headers: { "Retry-After": "30" },
    body: { ok: true, data: { outcome: "applied" } },
  };
  assert.deepEqual(await deliver(), {
    status: 503,
    error: "H Ledger intake is unavailable; this delivery can be retried.",
    retryAfterSeconds: 30,
  });

  nextResponse = {
    status: 200,
    body: { ok: false, error: { details: { reason: "estimator_sync_disabled" } } },
  };
  const non503PauseMarker = await deliver();
  assert.ok("status" in non503PauseMarker);
  assert.equal(non503PauseMarker.paused, undefined);
});