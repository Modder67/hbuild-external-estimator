import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateForSlug, deckIssueReadiness, totalsForSlug, validateDeckScope } from "@workspace/estimator-core";
import { deckProposalRows, deckTakeoffRows } from "./estimateDelivery";

function validDeckScope() {
  return {
    sourceId: "11111111-1111-1111-1111-111111111111",
    clientSourceId: "22222222-2222-2222-2222-222222222222",
    jobDetails: {
      salesperson: "", firstName: "Sam", lastName: "Deck", jobCode: "",
      addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "",
      customerName: "Sam Deck", customerAddress: "", jobTitle: "Back deck", date: "2026-10-01",
    },
    measurements: {
      ledger: [20], framing: [16], pictureFrame: [0], deckArea: [100], joistCount: [0],
      beam: [0], postCount: [0], caissons: [0], rail8: [1], rail10: [0],
      stair6: [0], stair8: [0], stair10: [0],
    },
    joistSize: "",
    lumberSelections: { ledger: "2x10x20-tf", framing: "2x12x16-tf", joist: "2x12x16-tf", beam: "", post: "" },
    stairPosts: { left: 0, middle: 0, right: 0, center: 0 },
    materialTier: "premium",
    addons: [
      { id: "stairs", name: "Stairs (per step)", enabled: true, qty: 2, basePrice: 95, priceOverride: 95 },
      { id: "footings", name: "Post Footings / Concrete", enabled: false, qty: 1, basePrice: 285, priceOverride: 285 },
      { id: "lighting", name: "Lighting Package", enabled: false, qty: 1, basePrice: 850, priceOverride: 850, isFlat: true },
      { id: "underdeck", name: "Under-Deck Ceiling", enabled: false, qty: 1, basePrice: 12, priceOverride: 12, isPerSqFt: true },
      { id: "privacy", name: "Privacy Screen / Lattice", enabled: false, qty: 1, basePrice: 28, priceOverride: 28, isPerLf: true },
      { id: "stain", name: "Custom Stain / Paint", enabled: false, qty: 1, basePrice: 650, priceOverride: 650, isFlat: true },
      { id: "removal", name: "Removal of Old Deck", enabled: false, qty: 1, basePrice: 4.5, priceOverride: 4.5, isPerSqFt: true },
    ],
    selectedMarkup: "better",
  };
}

test("deck calculation reproduces measurement, add-on, lumber takeoff, and pre-tax markup math", () => {
  const scope = validDeckScope();
  const calculation = calculateForSlug("deck", scope);
  assert.deepEqual(calculation.issues, []);
  assert.equal(calculation.lines.find(line => line.id === "deckArea")?.quantity, 15);
  assert.equal(calculation.lines.find(line => line.id === "deckArea")?.unitCostCents, 26933);
  assert.equal(calculation.lines.find(line => line.id === "stairs")?.totalCents, 19000);
  assert.deepEqual(calculation.takeoff.find(item => item.id === "lumber-ledger"), {
    id: "lumber-ledger", group: "Lumber", label: "2×10×20 True Frame", quantity: 2, unit: "EA",
  });
  assert.ok(!calculation.takeoff.some(item => item.id === "missing-joist"));
  assert.ok(!calculation.takeoff.some(item => item.id === "ledger-reference" || item.id === "framing-reference"));
  assert.equal(calculation.takeoff.find(item => item.id === "lumber-framing")?.quantity, 3);
  assert.equal(calculation.takeoff.find(item => item.id === "lumber-joist")?.quantity, 15);

  const totals = totalsForSlug("deck", calculation, scope);
  const direct = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);
  assert.equal(totals.directCents, direct);
  assert.equal(totals.beforeTaxCents, direct + Math.round(direct * 0.42));
  assert.equal(totals.companyCents + totals.incidentalsCents + totals.accidentsCents + totals.salesCents, 0);
});

test("deck rejects canonical project linkage and malformed numeric, override, and add-on input", () => {
  const linked = { ...validDeckScope(), projectId: "canonical-project" };
  assert.match(validateDeckScope(linked) ?? "", /canonical project/);
  assert.ok(calculateForSlug("deck", linked).issues.length);

  const negative = validDeckScope();
  negative.measurements.deckArea = [-1];
  assert.match(validateDeckScope(negative) ?? "", /finite, nonnegative/);

  const invalidOverride = validDeckScope();
  invalidOverride.addons[0].priceOverride = Number.NaN;
  assert.match(validateDeckScope(invalidOverride) ?? "", /invalid quantity, override/);

  const invalidAddon = validDeckScope();
  invalidAddon.addons[0].id = "unrecognized";
  assert.match(validateDeckScope(invalidAddon) ?? "", /Unrecognized deck add-on ID/);

  const invalidSourceId = validDeckScope();
  invalidSourceId.sourceId = "not-a-uuid";
  assert.match(validateDeckScope(invalidSourceId) ?? "", /sourceId must be a valid UUID/);
});

test("deck issue readiness rejects missing measured lumber and wholly unselected priced takeoffs", () => {
  const measuredSections = validDeckScope();
  measuredSections.lumberSelections.ledger = "";
  measuredSections.lumberSelections.joist = "";
  measuredSections.measurements.beam = [10];
  measuredSections.measurements.postCount = [2];
  const incompleteCalculation = calculateForSlug("deck", measuredSections);
  assert.ok(incompleteCalculation.issues.length > 0);
  const missing = deckIssueReadiness(measuredSections, incompleteCalculation);
  assert.match(missing ?? "", /ledger, joist, beam, post/);

  const areaOnly = validDeckScope();
  areaOnly.measurements.ledger = [0];
  areaOnly.measurements.framing = [0];
  areaOnly.measurements.deckArea = [100];
  areaOnly.lumberSelections = { ledger: "", framing: "", joist: "", beam: "", post: "" };
  const noSelectionsCalculation = calculateForSlug("deck", areaOnly);
  assert.ok(noSelectionsCalculation.issues.length > 0);
  const unselected = deckIssueReadiness(areaOnly, noSelectionsCalculation);
  assert.match(unselected ?? "", /at least one lumber option/);

  measuredSections.lumberSelections.ledger = "2x10x20-tf";
  measuredSections.lumberSelections.joist = "2x12x16-tf";
  measuredSections.lumberSelections.beam = "microlam";
  measuredSections.lumberSelections.post = "6x6";
  const completeCalculation = calculateForSlug("deck", measuredSections);
  assert.equal(completeCalculation.issues.length, 0);
  assert.equal(deckIssueReadiness(measuredSections, completeCalculation), undefined);
});

test("deck proposal and takeoff rows freeze identity and list only selected ordering quantities", () => {
  const scope = validDeckScope();
  scope.lumberSelections.joist = "2x12x16-tf";
  const calculation = calculateForSlug("deck", scope);
  const project = { projectName: "Back deck", firstName: "Sam", lastName: "Deck", scope };
  const totals = totalsForSlug("deck", calculation, scope);
  const proposal = deckProposalRows(project, calculation, totals.beforeTaxCents, 3, "2026-10-02T12:00:00.000Z");
  const takeoff = deckTakeoffRows(project, calculation, 3, "2026-10-02T12:00:00.000Z");
  assert.ok(proposal.includes("Project: Back deck"));
  assert.ok(proposal.includes("Client: Sam Deck"));
  assert.ok(proposal.includes("Estimate date: 2026-10-01"));
  assert.ok(proposal.includes("Issued at (UTC): 2026-10-02T12:00:00.000Z"));
  assert.ok(takeoff.includes("Issued at (UTC): 2026-10-02T12:00:00.000Z"));
  assert.ok(proposal.includes("Revision: 3"));
  assert.ok(proposal.includes("Selected markup: better (42%) on pre-tax subtotal"));
  assert.ok(proposal.some(row => row.includes("Unit amount")));
  const directSubtotal = calculation.lines.reduce((sum, line) => sum + line.totalCents, 0);
  const markupAmount = totals.beforeTaxCents - directSubtotal;
  assert.ok(proposal.includes(`Direct subtotal: $${(directSubtotal / 100).toFixed(2)}`));
  assert.ok(proposal.includes(`Selected tier markup (42%): $${(markupAmount / 100).toFixed(2)}`));
  assert.ok(proposal.includes(`Before-tax total: $${(totals.beforeTaxCents / 100).toFixed(2)}`));
  assert.ok(proposal.includes("Tax: Not calculated"));
  assert.ok(proposal.includes("Calculation assumptions"));
  assert.ok(proposal.some(row => row.includes("16 inches on center")));
  assert.ok(takeoff.includes("Calculation assumptions"));
  assert.ok(proposal.includes("Not released to client"));
  assert.ok(takeoff.some(row => row.includes("0.75×5.5×20 deck boards: 15 EA")));
  assert.ok(takeoff.some(row => row.includes("2×12×16 True Frame")));
  assert.ok(takeoff.some(row => row.includes("Ordering quantities only")));
  assert.ok(takeoff.some(row => row.includes("no nominal reference quantities")));
  assert.ok(!takeoff.some(row => row.includes("MISSING") || row.includes("Ledger coverage") || row.includes("Framing coverage")));
});