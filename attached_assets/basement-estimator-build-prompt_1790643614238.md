# Build prompt: HBUILD Basement Remodeling Estimator

Build a basement remodeling calculator in the EXTERNAL estimator, composing the existing flooring/door and bathroom calculators. This is an implementation specification, not a claim of working software. Reuse the external app's stack and data model; do not recreate estimate authoring inside HBUILD or deploy as part of this task.

## Required module specifications

- [Flooring, baseboard, and doors](flooring-estimator-build-prompt.md).
- [Bathrooms](bathroom-estimator-build-prompt.md).
- [Basement rules](skills/estimation-calculators/references/basement-estimator.md).
- [External HBUILD environment](skills/estimation-calculators/references/external-environment.md) and [signed intake contract](skills/estimation-calculators/references/intake-contract.md).

These files are part of this build specification. Preserve their supplied rates, versioning, unresolved pricing decisions, and completeness checks. The basement reference is the authoritative location for the new basement formulas; do not maintain conflicting copies of its rate schedule.

## User experience

Use one project of type Basement Remodeling, one client identity, one estimate revision, and multiple named rooms. Present a short project setup and these expandable work sections:

1. Existing conditions: egress Yes/No and optional existing panel photo.
2. Walls: Add perimeter wall, Add segment, length, required wall-height question, drywall sheet length, and finished faces. Do not assume height; allow applying an entered height to multiple selected segments with local overrides.
3. Soffits: Add soffit, length, width, drop height, and exposed faces.
4. Electrical: panel work, labor days, and fixture counts.
5. Flooring and doors: existing reusable section/door forms, linked to rooms.
6. Bathrooms: Add bathroom, reuse full bathroom form, link its floor and door scope to shared modules.
7. Review: combined proposal, material takeoff, optional labor sheets, and completeness issues.

A sticky summary shows direct costs by module, one combined markup breakdown, before-tax selling price, tax status, and unresolved items. On mobile use a reachable summary/review action. Hide inactive branches without losing deliberately saved draft inputs; excluded branches contribute no cost. Use explicit units and readable quantity formulas. Door-only or bathroom-only areas within the basement must not require irrelevant flooring data.

## Composition and scope ownership

Each child calculator returns unmarked direct-cost lines, takeoff lines, assumptions, and issues. It may show a contextual standalone preview, but its marked-up subtotal is never summed into the basement total.

Use stable room, physical scope, assembly, and component IDs. Assign each physical work item one pricing owner:
- Basement: perimeter framing/drywall, soffits, egress cut, basement electrical.
- Flooring: all installed floor areas and baseboard, including bathroom floors when selected.
- Doors: opening specifications, casing takeoff, and order-level shipping.
- Bathroom: tub/shower wall systems, demolition, plumbing, vanity, and selected bathroom accessories.

Bathroom lighting can be priced by the bathroom package OR basement electrical, never both for the same fixture/scope. A light already included in the bathroom's combined allowance must not automatically get a second fixture labor/material/wire charge. If genuinely distinct rough-in work is needed, identify and price it separately with explicit scope. Do not silently force one calculator's rate over another.

Likewise, distinguish bathroom touchup/repair from drywall already included in basement wall work. Track wet-wall backerboard/tile surfaces separately from drywall faces, rather than putting both on the same surface by default. If the wall's fixed LFT package includes material that will be omitted or substituted, require an explicit package/override policy; do not invent a drywall deduction.

Reuse room IDs for flooring and bathrooms, but never infer floor area or baseboard perimeter from the sum of wall segments. Collect their actual measurements. Aggregate eligible standard doors across the estimate for the existing proposed door-tier rule, while applying shipping per explicit order, not per module. Preserve the unresolved two-door boundary.

## Calculation and records

Compose deterministic module calculations on the external server. Add a scope registry to detect duplicate physical charges and allow users to choose their pricing owner. Group takeoff items only when SKU/specification, unit, and purchasing policy match. Retain source-room attribution, included-material flags, and each line's pricing-policy version.

```text
direct cost = egress + wall packages + soffit charges
            + electrical + flooring + baseboards + doors
            + bathrooms + other explicitly priced scope

company = direct cost × 35%
incidentals = direct cost × 20%
accidents = direct cost × 50%
sales = direct cost × 7%
selling price before tax = direct cost × 2.12
```

This inherits the existing ADDITIVE markup interpretation; apply it once. Keep tax separate and unresolved when unconfigured. Material takeoff quantities included in a fixed package do not create additional charges. Missing pricing is not zero. A pending module makes the combined estimate incomplete even when other module totals are valid.

Persist draft inputs, policy versions, module outputs, overrides, scope ownership, attachments, and source revisions upstream. Recalculate without duplicate lines; preserve manual extras. Snapshot issued revisions and enforce concurrency/permissions as in the component specifications. Do not hard-code rates in UI components.

## HBUILD delivery

Use one stable source project identity for the basement, not a new HBUILD project per bathroom/module. Keep structured costs and measurements upstream. Deliver identity first to signed Ledger project intake, then combined proposal/takeoff PDFs and any genuinely produced labor-sheet/timeline PDFs through document intake. No nested module JSON, images, recipients, or totals are added to the strict API schema.

The optional electrical panel photo is an upstream project attachment; it is not a supported standalone intake document type. Keep it source-side, or include it intentionally in an appropriate staff PDF with size checks. Do not invent photo upload endpoints or automatically include it in the customer proposal.

HBUILD imports stay staff-only until staff release. A verified PDF does not assign crews, publish a timeline, approve budgets, or create a Ledger money job. Use the existing retry/idempotency and readback-status rules, retaining source files until verified. Check actual implementation/deployment before connecting; the supplied intake evidence is historical.

## Verification and delivery

Run the numerical checks in the basement reference and the relevant inherited module cases. Also verify that toggling a child module changes the total once, shared bathroom lighting has one pricing owner, bathroom floors appear once, door shipping is not repeated, package takeoff materials are not recharged, and combined markups are applied once. Missing rates or unresolved dimension policies must remain visible after composition.

Test identity/PDF delivery with disposable fixtures only when implementing the adapter. Finish with the working changes and actual validation results, keeping implemented/tested/connected/production-verified status separate. This prompt itself only documents the build.
