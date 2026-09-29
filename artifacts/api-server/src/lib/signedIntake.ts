import { createHash, createHmac } from "node:crypto";

export type SignedIntakeConfig = {
  url: URL;
  keyId: string;
  secret: string;
};

export type SignedIntakeResult =
  | { outcome: "applied" | "stale"; replayed: boolean }
  | {
      status: number;
      error: string;
      paused?: true;
      reason?: "estimator_sync_disabled";
      retryAfterSeconds?: number;
    };

const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;
export const DEFAULT_PAUSE_RETRY_AFTER_SECONDS = 3600;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let seconds: number;
  if (/^\d+$/.test(trimmed)) {
    seconds = Number(trimmed);
  } else {
    const at = Date.parse(trimmed);
    if (!Number.isFinite(at)) return undefined;
    seconds = Math.ceil((at - now) / 1000);
  }
  if (!Number.isFinite(seconds)) return undefined;
  return Math.max(1, Math.min(MAX_RETRY_AFTER_SECONDS, Math.floor(seconds)));
}

/**
 * Send the exact JSON body covered by H Ledger's signed-intake convention and
 * translate its response into an estimator-safe result.
 */
export async function deliverSignedIntake(
  config: SignedIntakeConfig,
  endpoint: "projects" | "documents",
  deliveryId: string,
  payload: object,
  fetcher: typeof fetch = fetch,
): Promise<SignedIntakeResult> {
  const raw = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  // H Ledger's current convention uses the SHA256 hex *string* as the HMAC key.
  const keyHash = createHash("sha256").update(config.secret).digest("hex");
  const signature = createHmac("sha256", keyHash).update(`${timestamp}.${raw}`).digest("hex");
  const url = new URL(`/api/intake/v1/${endpoint}`, config.url);
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hbuild-key": config.keyId,
      "x-hbuild-timestamp": timestamp,
      "x-hbuild-signature": signature,
      "Idempotency-Key": deliveryId,
    },
    body: raw,
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });

  let result: Record<string, unknown> = {};
  try {
    result = record(await response.json()) ?? {};
  } catch {
    // An invalid or empty body is treated as an unrecognized upstream receipt.
  }
  const error = record(result.error);
  const details = record(error?.details);
  const data = record(result.data);
  const outcome = data?.outcome;

  const retryAfter = retryAfterSeconds(response.headers.get("Retry-After"));
  if (response.status === 401 || response.status === 403) {
    return { status: response.status, error: "H Ledger denied the intake account; ask an administrator to review its grant." };
  }
  if (response.status === 409) {
    return { status: 409, error: "H Ledger requires review of this mapping or delivery. No new job was created here." };
  }
  if (response.status === 503 && details?.reason === "estimator_sync_disabled") {
    return {
      status: 503,
      error: "H Ledger synchronization is paused by the office. Keep this delivery and retry after synchronization resumes.",
      paused: true,
      reason: "estimator_sync_disabled",
      retryAfterSeconds: retryAfter ?? DEFAULT_PAUSE_RETRY_AFTER_SECONDS,
    };
  }

  if (response.status >= 500 && response.status <= 599) {
    return {
      status: 503,
      error: "H Ledger intake is unavailable; this delivery can be retried.",
      ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    };
  }

  if (response.status >= 200 && response.status < 300 && result.ok === true &&
      (outcome === "applied" || outcome === "stale")) {
    return {
      outcome,
      replayed: response.headers.get("Idempotent-Replayed")?.toLowerCase() === "true",
    };
  }

  if (error?.code === "conflict") {
    return { status: 409, error: "H Ledger requires review of this mapping or delivery. No new job was created here." };
  }
  if (response.status === 429) {
    return {
      status: 429,
      error: "H Ledger is rate-limiting deliveries; retry later with this same saved delivery.",
      ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    };
  }
  if (response.status === 400 || response.status === 422) {
    return { status: 400, error: "H Ledger rejected this snapshot. Check the client and project details." };
  }
  if (response.status >= 200 && response.status < 300) {
    return { status: 503, error: "H Ledger returned an unrecognized receipt; check Ledger before retrying." };
  }
  return {
    status: 503,
    error: "H Ledger intake is unavailable; this delivery can be retried.",
    ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
  };
}