# Build prompt: HBUILD Flooring and Door Quick Estimator

Build a production-ready EXTERNAL flooring and door estimator that hands identity and PDFs to HBUILD through signed Ledger intake. Client, project, and estimate authoring belong to the external estimator, not H DRAFT or another HBUILD app. Reuse the chosen external application's stack and components; no framework is mandated here. First read local instructions and the integration requirements below. The accompanying flooring UI concept illustrates layout only; it does not depict the door option or establish that the estimator runs inside HBUILD.

## HBUILD environment and delivery

Read [the shared external integration requirements](skills/estimation-calculators/references/external-environment.md) and [the supplied intake contract](skills/estimation-calculators/references/intake-contract.md) before implementing the adapter. These are part of this build specification. Contract evidence is dated 2026-09-25 and is not proof of current production availability; recheck actual Ledger routes and RELEASE.md before connecting.

Keep all section quantities, rates, direct costs, markups, and estimate revisions in the external estimator. Send client/project identity first to POST /api/intake/v1/projects, then actual PDF bytes to POST /api/intake/v1/documents. Only proposal, takeoff, laborsheet, and timeline are supported document types; declare only outputs actually produced. Do not add structured estimate lines/totals, recipient fields, or document URLs to strict intake JSON.

H LEDGER owns provider accounts and external ID mappings; H FORESIGHT owns the internal project and scheduling; H DOCS owns file versions and release; H PANEL presents released information. Identity import does not create a Ledger money job or publish a schedule. No direct HBUILD database access, retired Draft enrollment, or manual HBUILD client/project creation. Staff release is separate from upload and storage verification. Retain PDFs upstream until verified delivery, and expose per-output pending/review/failed/verified statuses.

## Outcome

An estimator selects a flooring package and existing floor type, enters each room's measured square footage and baseboard linear feet, and receives an automatically itemized estimate. Support multiple rooms, demolition and no-demolition jobs, mixed flooring, optional accessories, saved drafts, and fixed quote revisions. Deliver functioning behavior, not a static mockup.

## Interface

Use a responsive three-step flow: Client & project, Measure & price, Review. On desktop use a wide section-entry column and a sticky cost summary; on mobile stack them with an accessible total/review action. Keep the measured SQFT and baseboard LFT inputs prominent. Use clear labels, visible units, keyboard navigation, accessible error messages, and comfortable touch targets.

1. Client & project: select or create client in the external estimator; capture first/last name, phone, email, job address, project type, and designated estimator. Retain stable source IDs. Types: Tile Shower, Solid Surface Shower, Flooring Remodel, General Remodeling/Additions. Route specialized types to configured upstream estimators; general remodeling supports multiple estimator modules. These selections do not assign H FORESIGHT crews. Do not fabricate assignments or duplicate source clients. Implement flooring and doors in this scope and reuse existing external routing for other modules. Leads without real projects stay upstream; never create placeholder HBUILD jobs.
2. Measure & price: select a project-default flooring package. Add named sections with measured SQFT, existing flooring, demolition yes/no, substrate, new flooring package, baseboard mode and LFT. Default demolition and installation quantities from measured area. Allow independent overrides under Adjust quantities. Disabling demolition removes demolition charges but preserves installation. New sections inherit the project package; duplicate copies selections but clears measurements. Provide undo for section deletion.
3. Optional details: collapsible material waste, transitions, T-molding, stair nosing, stairs and step count, preparation, disposal, furniture/appliance moving, and manual extras. Use counts only for defined standard pieces; otherwise capture lengths. Each additional scope can be included in package, separately priced, excluded, or pending inspection. Prevent duplicate charges for included items.
4. Review: show section totals and itemized charges, internal direct costs and markup breakdown, and a customer-facing preview that omits internal cost/markup categories. Include assumptions, exclusions, pending inspection items, and tax status. Do not claim that an incomplete draft is a firm completed quote.

## Pricing policy

Use ADDITIVE markups, each calculated against the same eligible direct-cost subtotal. This is the working interpretation of the supplied percentages, not permission to compound them:

- Company 35%
- Incidentals 20%
- Accidents/contingency 50%
- Sales 7%
- Total markup 112%; selling price before tax = direct cost × 2.12.

Sales is a markup on cost, not a commission on revenue. Store the markup method and each percentage in a versioned pricing policy. Show the method explicitly in settings. Apply markups once; avoid applying line markups and marking up the subtotal again. Tax is separate, follows configured jurisdiction and line taxability, and is not silently assumed to be zero when unconfigured. Do not invent local tax rules.

## Initial rates and units

Treat supplied material/labor rates as direct costs. Store rates centrally, never scattered through UI code.

Demolition:
- Carpet $1/SQFT.
- LVP $1/SQFT.
- Tile $4/SQFT; $6/SQFT when total applicable demolition area is below 50 SQFT.
- Hardwood $4/SQFT; $6/SQFT below 50 SQFT.
- Linoleum $3/SQFT; $5/SQFT below 50 SQFT.
- Other requires description and custom rate.

Preserve these initial thresholds even though they cause a pricing discontinuity. Aggregate demolition quantity by material across the estimate before choosing its rate, so splitting rooms does not alter pricing. Exactly 50 SQFT uses the standard rate. Document this aggregation as an implementation assumption. Support a future configurable minimum-charge policy, but do not invent or activate a minimum charge.

Substrate is separate from removed flooring: concrete/slab, wood subfloor, other, unknown. Actual slab demolition requires custom pricing.

New flooring:
- LVP Median: material $3.50/SQFT, installation $2/SQFT.
- LVP High End: material $4.50/SQFT, installation $2/SQFT.
- Tile Median: material $3.50/SQFT; installation rate missing.
- Tile High End: material $6.50/SQFT; installation rate missing.
- Carpet Median: supplied material rate $9.50; SQFT versus SQYD needs confirmation.
- Carpet High End: supplied material rate $36.50; SQFT versus SQYD needs confirmation.
- Carpet installation $7/SQYD; SQYD = SQFT / 9.
- Carpet pad options 7 lb and 10 lb require configured rates.

Missing rates or unconfirmed units are not zero-cost items. Allow saving incomplete drafts but block issuing a complete priced quote until required pricing is resolved or the affected scope is explicitly excluded. Carpet material quantities support roll-layout overrides. Pad derives from new carpet installation area, never demolition area. Required tile supplies and installation components must be configured or flagged incomplete.

Baseboard:
- Modes: none, new baseboard, reinstall existing.
- New baseboard paint/install labor $5.00/LFT.
- New baseboard material and paint $1.25/LFT.
- Direct cost $6.25/LFT; with additive markups selling price $13.25/LFT before tax.
- Price reinstall-existing separately; do not invent a rate.
- Define removal/disposal and unusual profiles separately unless explicitly included.
- Always use entered LFT; do not infer perimeter from floor area.

## Door option

Add an optional Doors section alongside flooring. Support door-only estimates without requiring flooring measurements. Use Add door to create one opening record; allow duplication of specifications while requiring a distinct location label. Group identical specifications for takeoff presentation without losing individual opening identities.

Capture for each opening:
- Location/name and related room if applicable.
- Pocket door: Yes/No.
- Exterior door: Yes/No.
- Interior opening width: 24, 30, 32, or 36 inches. Record whether the measurement describes a door slab or rough opening; do not treat these as interchangeable purchasing dimensions. Record height and jamb depth when needed to finalize purchasing.
- Door swing selection for hinged doors: left/right handing and inward/outward swing, with the viewing side explicitly labeled and a diagram or location note. Confirm supplier handing before purchase. Pocket doors use slide direction instead of hinge swing and clear stale swing values.
- Hardware: New/Reuse. New hardware needs a selected package/rate; reuse needs suitability confirmation and any separately scoped modification work.
- Trim color: named color or code, with project default and per-door override. Capture door paint color separately if different.
- Door order/group identifier; start with one draft order group and allow explicit splits for separate orders.

Pricing for standard, non-pocket interior doors:
- Material: $150 per door.
- Labor includes hanging, casing installation, and painting. Supplied rule: fewer than 2 doors = $250 per door; more than 2 doors = $175 per door. Exactly 2 doors is UNRESOLVED; do not silently choose a tier. Show an incomplete-pricing issue for that count until configured.
- Proposed tier scope is the combined eligible standard interior-door count across the estimate, not each room or individual row. This is an explicit implementation assumption pending business confirmation. Pocket/exterior doors must not silently count toward this tier.
- Pocket or exterior selection requires its own configured material/labor package or explicit override. Do not apply standard interior pricing automatically. If both are selected, require a custom reviewed package rather than calculating from incompatible defaults.

Casing takeoff:
- Each door generates 6 sticks of 8-foot casing = 48 LFT. Thus N doors generate 6N sticks and 48N LFT.
- Keep door casing separate from baseboard; do not apply the $5/LFT baseboard labor rate because casing installation is already in door labor.
- Casing material rate and paint supply coverage are not supplied. Explicitly configure whether they are included in the $150 door material price or separately priced; do not assume free material or reuse the baseboard material rate.
- Generate the requested takeoff for each door; flag pocket/exterior takeoffs for package review rather than silently changing the six-stick rule.

Shipping and handling:
- Minimum $475 per nonempty door order, not per door or room.
- For each order use max($475, entered shipping/handling amount); if no higher amount is entered use $475 as the minimum estimate, not a confirmed supplier quote.
- Empty order groups charge $0. Multiple explicit orders each incur their own minimum. Use order ID + shipping charge type as the stable line identity so recalculation cannot duplicate shipping.
- Include shipping in direct cost under the existing additive markup assumption; do not add a second markup at the order level.

Door direct cost = standard/custom door materials + applicable door labor + separately priced casing/paint/hardware/extras + order shipping. Apply existing estimate markups once to the combined flooring/door direct cost. Keep unpriced required components visible and block a complete priced quote until resolved.

UI: each door row/card shows location, width, swing/slide direction, pocket/exterior toggles, hardware, and trim color. Put purchasing dimensions and overrides in expanded details. Show automatic casing sticks/LFT and one shipping summary per order. Surface unresolved two-door pricing near the labor subtotal. Preserve door/order/package snapshots in quote revisions.

Acceptance examples (known-cost subtotals only; casing/paint/hardware coverage remains unresolved):
- 1 standard door, 1 order: $150 material + $250 labor + $475 shipping = $875 known direct cost; 6 sticks / 48 LFT casing.
- 3 standard doors, 1 order: $450 material + $525 labor + $475 shipping = $1,450 known direct cost; 18 sticks / 144 LFT casing.
- 2 standard doors: incomplete labor pricing until the boundary is resolved.
- 0 doors: no casing and no shipping charge.
- Verify splitting rooms does not change the tier or duplicate shipping; splitting an actual order adds another order minimum; $600 entered shipping remains $600; entering less than $475 yields the minimum; deleting the last door clears its shipping line; pocket/exterior and new hardware do not silently use absent rates.

## Quantities and calculation

Keep measured, demolished, installed, and purchased quantities distinct. Material quantity = installed area × (1 + configured waste), rounded up to package size when available. Labor uses installed area, not waste-adjusted purchased quantity. Baseboard defaults to entered LFT × the supplied rates; do not silently add baseboard waste. Waste is configurable per package and visible. Use 10% only for the demo sample, not as an approved universal business rate.

Calculation order: validate input and rate completeness; resolve rate/policy versions; calculate demolition; materials/waste/package quantities; flooring labor and pad; baseboards; door counts, tiers, materials, casing, hardware, and per-order shipping; accessories and extras; direct-cost subtotal; additive markups; applicable taxes; final total.

Use decimal-safe money calculations and explicit units. Define one rounding rule, calculate currency line amounts to cents, and make displayed totals reconcile to displayed lines. Preserve sufficient quantity precision for SQFT/SQYD conversion. Distinguish missing values from zero. Reject negative/nonfinite quantities and invalid percentages. An active flooring section requires positive installation area; zero baseboard is valid.

## Architecture and persistence

Use a pure deterministic calculation module with no UI or database dependencies. Reuse it for live preview and authoritative server-side recalculation before persistence/issuance. Never trust client-submitted totals.

External-estimator entities: source project/client records; estimate; estimate revision; measured sections; flooring packages and components; rate-book versions; pricing-policy versions; generated charge lines; separately stored manual extras and audited overrides; immutable serialized intake deliveries and returned HBUILD mappings/status references. Do not create estimator tables in HBUILD or write its mappings directly. Follow the signed intake contract.

Each generated line has a stable source identity (section ID + charge type + component ID). Recalculation replaces derived lines rather than appending duplicates; preserve manual extras. Record override author, reason, old/new values, and timestamp. Use optimistic revision checks to prevent silent concurrent overwrites. Autosave with visible saving/saved/error status and recoverable retry behavior. Quote issuance must be idempotent.

Snapshot quantities, rates, units, package definitions, policy, assumptions, and computed totals on issued revisions. Later rate edits must not mutate old quotes. Repricing a draft requires an explicit price-change preview. Editing an issued quote creates a new revision. Reuse application roles; restrict rate/policy edits to authorized users and enforce permissions on the server.

## Demonstration data and acceptance criteria

Seed a clearly labeled sample, not a real client: Living room, 200 SQFT carpet demolition, 200 SQFT median LVP installation, 10% material waste, 60 LFT new baseboard, no packaging adjustment, extras excluded for sample, tax not calculated.

Expected values:
- Demo $200.00.
- LVP material: 220 × $3.50 = $770.00.
- LVP labor: 200 × $2 = $400.00.
- Baseboard labor: 60 × $5 = $300.00.
- Baseboard material/paint: 60 × $1.25 = $75.00.
- Direct cost $1,745.00.
- Company $610.75; incidentals $349.00; accidents $872.50; sales $122.15.
- Estimate before tax $3,699.40.

Verify meaningful behavior: no-demo installation, mixed rooms/packages, pad tied to new carpet, SQYD conversion, baseboard calculations, 49/50 SQFT tier boundary, identical demolition totals after splitting a section, waste excluded from labor, missing pricing blocks issuance, repeat recalculation without duplicates, manual extras preserved, autosave failure recovery, concurrent-edit detection, unauthorized pricing edits denied, and issued revisions unaffected by rate changes.

Deliver the working module, relevant schema/API changes, focused tests, and a concise implementation report stating what runs, what was tested, and any remaining configuration. Do not deploy or modify production data as part of this build prompt. Avoid claiming unimplemented controls work.
