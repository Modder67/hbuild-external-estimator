/**
 * HEstimate → H LEDGER quote baseline payload (contract
 * `hbuild-quote-baseline-1`, tools brief §2). Built SERVER-SIDE from the
 * immutable issued revision, never from client-sent money.
 *
 * Verified semantics (rate book HBUILD-rates-2026-09-v1): `totals.directCents`
 * is the internal direct cost and `totals.beforeTaxCents` the pre-tax selling
 * total; the difference is the estimated quote profit (markup/policy buckets).
 * No module produces a labor/material split, so those fields are OMITTED —
 * the receiver shows them as unknown, never 0.
 */
export const QUOTE_BASELINE_CONTRACT = "hbuild-quote-baseline-1";

export type QuoteBaselineInput = {
  sourceId: string;
  revision: number;
  slug: string;
  issuedAt: string; // ISO instant
  totals: Record<string, number>;
  policyVersion: string;
  rateBookVersion: string;
};

const isCents = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < 100_000_000_000;

export function buildQuoteBaselinePayload(input: QuoteBaselineInput):
  | { payload: Record<string, unknown> }
  | { error: string } {
  const direct = input.totals.directCents;
  const selling = input.totals.beforeTaxCents;
  if (!isCents(direct) || !isCents(selling) || selling <= 0) {
    return { error: "The issued revision's stored totals are incomplete; its baseline cannot be delivered." };
  }
  if (selling < direct) {
    // Possible only if a stored total predates the current policy; refuse
    // rather than deliver a negative-profit baseline nobody authored.
    return { error: "The issued revision's selling total is below its direct cost; staff review is needed before delivery." };
  }
  if (!Number.isFinite(Date.parse(input.issuedAt))) {
    return { error: "The issued revision has no valid issue time." };
  }
  const completedAt = new Date(input.issuedAt).toISOString();
  return {
    payload: {
      contract: QUOTE_BASELINE_CONTRACT,
      source: { updatedAt: completedAt, revision: `rev-${input.revision}` },
      project: { externalId: `deck-estimate:project:${input.sourceId}` },
      quote: {
        externalQuoteId: `deck-estimate:quote:${input.sourceId}`,
        revision: input.revision,
        status: "completed",
        completedAt,
        currency: "USD",
        taxTreatment: "pre_tax_selling",
        sellingTotalCents: selling,
        directCostCents: direct,
        estimatedProfitCents: selling - direct,
        estimatorSlug: input.slug,
        policyVersion: input.policyVersion,
        rateBookVersion: input.rateBookVersion,
      },
    },
  };
}
