import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQuoteBaselinePayload, QUOTE_BASELINE_CONTRACT } from "./quoteBaseline";

const base = {
  sourceId: "85ddb0f1-bd0b-4243-bc11-631cd94419ed",
  revision: 2,
  slug: "deck",
  issuedAt: "2026-10-10T17:00:00.000Z",
  policyVersion: "HBUILD-2026-09-additive-v1",
  rateBookVersion: "HBUILD-rates-2026-09-v1",
};

test("builds the §2 contract from the immutable totals: selling, direct cost, profit = difference", () => {
  const out = buildQuoteBaselinePayload({ ...base, totals: { directCents: 1400000, beforeTaxCents: 2000000 } });
  assert.ok("payload" in out, JSON.stringify(out));
  const q = (out.payload as { quote: Record<string, unknown> }).quote;
  assert.equal((out.payload as { contract: string }).contract, QUOTE_BASELINE_CONTRACT);
  assert.equal(q.sellingTotalCents, 2000000);
  assert.equal(q.directCostCents, 1400000);
  assert.equal(q.estimatedProfitCents, 600000);
  assert.equal(q.taxTreatment, "pre_tax_selling");
  assert.equal(q.externalQuoteId, `deck-estimate:quote:${base.sourceId}`);
  assert.equal(q.revision, 2);
  assert.equal((q as Record<string, unknown>).laborCostCents, undefined, "no fabricated labor split");
  assert.equal((q as Record<string, unknown>).materialCostCents, undefined);
});

test("refuses incomplete or inconsistent stored totals instead of inventing numbers", () => {
  assert.ok("error" in buildQuoteBaselinePayload({ ...base, totals: { beforeTaxCents: 2000000 } }));
  assert.ok("error" in buildQuoteBaselinePayload({ ...base, totals: { directCents: 1400000 } }));
  assert.ok("error" in buildQuoteBaselinePayload({ ...base, totals: { directCents: 100, beforeTaxCents: 0 } }));
  assert.ok("error" in buildQuoteBaselinePayload({ ...base, totals: { directCents: 2000000, beforeTaxCents: 1400000 } }), "selling below direct cost needs staff review");
  assert.ok("error" in buildQuoteBaselinePayload({ ...base, totals: { directCents: 1.5, beforeTaxCents: 2000000 } }), "non-integer cents refused");
  assert.ok("error" in buildQuoteBaselinePayload({ ...base, issuedAt: "not-a-time", totals: { directCents: 1, beforeTaxCents: 2 } }));
});
