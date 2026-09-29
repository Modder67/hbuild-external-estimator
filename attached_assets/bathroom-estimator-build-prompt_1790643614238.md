# Build prompt: HBUILD Bathroom Estimator

Create a bathroom module in an EXTERNAL estimator that integrates with HBUILD through signed Ledger intake. Client, project, and estimate authoring remain upstream, not inside H DRAFT or other HBUILD applications. Reuse the chosen external estimator's client/project records, components, rate books, permissions, calculation engine, and revisions. Read workspace instructions before implementation. This specifies future implementation; do not claim a working application or deploy/send real quotes as part of this build.

## HBUILD environment and delivery

Read [the shared external integration requirements](skills/estimation-calculators/references/external-environment.md) and [the supplied intake contract](skills/estimation-calculators/references/intake-contract.md). Both are part of this specification. The supplied evidence is dated 2026-09-25; recheck actual routes and Ledger RELEASE.md before connection, without assuming production deployment.

Keep bathroom measurements, package contents, pricing, markup breakdowns, and structured takeoffs in the external estimator. Send client/project identity to POST /api/intake/v1/projects before delivering PDF bytes to POST /api/intake/v1/documents. Allowed types are proposal, takeoff, laborsheet, timeline; declare only expected outputs actually produced. No structured bathroom fields, prices, document URLs, or recipients belong in the strict intake JSON.

H LEDGER owns provider accounts/mappings, H FORESIGHT owns project identity and scheduling, H DOCS owns files/versions/release, and H PANEL presents released information. No direct HBUILD database writes or retired manual creation/enrollment endpoints. Uploaded PDFs start staff-only; verified storage is not client acceptance or release. Import creates no Ledger money job, assignments, or calendar events. Display independent import/document statuses and retain source PDFs until storage is verified.

## Outcome and interface

An estimator enters bathroom wall measurements and tub/pan details, selects fixtures and optional work, and receives an itemized estimate and purchasing takeoff. Support multiple named bathrooms, bathroom-only projects, and bathroom scope within a general remodel. Keep demolition, new installation, and purchased quantities separate.

Use a responsive form with these collapsible sections and a live summary:
1. Bathroom name and tub/shower configuration.
2. Demolition and wall/pan measurements.
3. Standard installation materials and finish selection.
4. Niche and drywall repair.
5. Vanity, plumbing, lighting, and accessories.
6. Scope review, takeoff, and customer quote preview.

Keep wall SQFT, wall height, and tub/pan inputs prominent. Show units beside every input. Use project defaults with local bathroom overrides, accessible labels, keyboard entry, duplicate-with-cleared-measurements, and undo deletion. Show known-cost subtotal separately from missing pricing; never display an incomplete subtotal as a complete bathroom price.

## Standard installation material package

User-supplied source: https://www.homedepot.com/list/view/details/shared/c6bf3e10-b217-11f1-a0c7-8b6134acb95f

The list was inaccessible through the web tool during specification creation. Its products, quantities, availability, and prices are UNVERIFIED. Keep this source attached to the package; do not invent its contents or claim it has been imported. Provide manual package setup/import once the contents are available.

Each component records description, SKU/source, unit, unit cost, package size/coverage, quantity basis, price verification date, and included-versus-separate scope. Quantity bases include fixed per bathroom, per fixture, wall SQFT, pan SQFT, linear feet, or manual. A supplier shopping-list quantity is not automatically the correct quantity for every bathroom.

Map automatic tile and backerboard quantities to package components rather than adding duplicate material charges. Snapshot package/rates on issued revisions. Explicitly resolve applicable waterproofing, mortar, grout, fasteners, sealants, drain, tub/pan, and trim coverage; these are review categories, not assertions about what the linked list contains.

## Tub and shower branch

Capture Tub Yes/No. Proposed interpretation pending confirmation:
- Yes: capture tub dimensions and drain side (left/right/other, with viewing reference). Hide the new shower-pan input. Keep separate existing pan demolition measurements if this is a conversion.
- No: allow shower pan dimensions when a shower is in scope; otherwise continue without pan charges. No tub does not by itself require installing a shower.

Distinguish existing assembly from proposed assembly so conversions remain possible. Tub material, tub removal, tub installation, new pan material, and pan installation rates have not been supplied. Require applicable package pricing or explicit exclusion rather than substituting demolition rates.

Pan measurements: label the two horizontal dimensions Width and Depth, in inches, rather than confusing the user's h × w notation with wall height. Preserve the raw drywall-to-drywall measurements and their measurement basis. The requested subtraction of 1 inch is unresolved as to axis/per-side treatment. Store an explicit adjustment policy and show raw and adjusted dimensions; do not enable an assumed correction as confirmed business policy.

If the user confirms subtracting 1 inch TOTAL from EACH dimension, use:

```text
adjusted width inches = entered width inches - 1
adjusted depth inches = entered depth inches - 1
pan SQFT = adjusted width × adjusted depth / 144
```

This is estimating logic only, not a guarantee of product fit. Confirm purchasing dimensions for the selected assembly. Keep demo footprint independent of new pan sizing and explicitly configure whether a correction applies to demo measurements. Reject nonpositive adjusted dimensions.

## Demolition and wall takeoff

- Demo Tile Surround: Yes/No; collect wall demolition SQFT and wall height with explicit units.
- Wall demolition labor = wall demolition SQFT × $4.
- Pan demolition: separate Yes/No; pan demolition labor = confirmed existing pan demo SQFT × $9.
- Wall height is a layout/detail input when SQFT is entered directly; do not multiply entered SQFT by height again. Optionally support deriving wall area from individual wall widths × heights, with a visible manual override.
- New wall installation SQFT defaults from entered wall area but remains editable independently of demolition. A no-demolition job still generates installation materials.
- Backerboard: 5 ft × 3 ft sheet = 15 SQFT coverage. Base sheet count = ceiling(new wall installation SQFT / 15). If a configured waste allowance is used, apply it before rounding. Show both sheet count and area. Height can flag layout/cut review; the area calculation alone is not a verified cutting plan.
- Tile: base takeoff SQFT = new tiled-wall installation SQFT. Apply separately configured material waste and box-coverage rounding when supplied. Do not apply tile waste to demolition labor or backerboard unless its own allowance is configured.
- No universal waste percentage is authorized here. Display the active allowance and mark a zero-waste preliminary takeoff accordingly when no allowance is set.
- Backerboard price, tile price, tile setting labor, backerboard installation labor, waterproofing labor/material, and disposal coverage remain unpriced unless provided by a configured package. Demolition measurements alone do not price complete reconstruction.

## Shower trim and valve

Finish options: Brushed Nickel, Stainless, Chrome, Matte Black, Brushed Gold. Store the selection on the fixture/package and the quote. Do not invent finish premiums.

Preserve the supplied price statement: “shower valve $380 Fixture Price $750 Install Price.” The allocation is ambiguous. Candidate interpretation: $380 valve/fixture material and $750 installation labor, but this is NOT confirmed. Store it as pending pricing configuration, not two invented material items or a committed labor rate. Ask which amount covers valve, trim/fixture, and installation. Once clarified, generate each confirmed charge exactly once when the relevant shower replacement scope is enabled.

## Niche and drywall

- Niche Yes/No. If Yes, collect quantity and dimensions; material and labor rates are missing. Flag required pricing and whether a prefab niche/package includes waterproofing. Avoid charging included components twice.
- Drywall Repair Yes/No. If No, cost $0. If Yes, require exactly one repair category: Simple touchups $535, or Other drywall repair $1,600.
- These two drywall amounts are mutually exclusive, not cumulative. Treat them as fixed scope allowances per bathroom for this specification; label per-bathroom scope as an assumption pending confirmation. Their labor/material allocation has not been supplied; retain as unsplit direct-cost allowances.

## Vanity and plumbing

Capture existing vanity width and Replace Vanity Yes/No (normalize the user's Y/S entry to Yes/No).

When replacing:
- New width choices in inches: 24, 30, 32, 34, 36, 38, or Custom numeric input.
- Default sink count to 1; permit explicit count adjustment rather than silently deriving it from vanity width.
- Add 1 P-trap plumbing allowance of $130 for the default one-sink scope. Labor-only versus combined labor/material coverage is unresolved; show that scope issue.
- Add 1 faucet at $250 combined installation labor/material for the default one-sink scope. Do not additionally charge its included labor/material.
- If multiple sinks are selected, propose one P-trap and faucet per sink and expose the quantities; treat this multiplication as a stated estimating assumption until adopted.
- Vanity, countertop/sink inclusion, cabinet removal, and cabinet installation have no supplied rates; configure their package or flag missing scope/pricing. Do not treat the faucet and trap allowances as the complete vanity replacement price.

When not replacing, do not auto-add trap or faucet charges. Permit separately selected fixture-only replacement scope without forcing cabinet replacement. Toggling replacement off removes only its derived charges, preserving separately selected work.

## Lights and accessories

- New vanity light installation: $75 labor each. Fixture material is separate unless included by the chosen package.
- Towel bars: $25 labor each; collect integer quantity. Material price/owner-supplied status must be explicit.
- Mirror installation: $125 labor each; collect quantity. Mirror material price/owner-supplied status must be explicit.
- Additional light: $375 each combined labor/material; collect integer quantity.
- Keep a new vanity-light installation distinct from an additional light; do not auto-charge both for one physical light. Combined allowances remain combined unless a real cost split is supplied.

## Pricing, persistence, and integration

Use the existing working pricing assumption: additive Company 35%, Incidentals 20%, Accidents 50%, Sales 7%, each on the same eligible direct-cost subtotal. Total multiplier 2.12, applied once. These percentages are inherited; additive treatment remains an explicitly stated interpretation. Treat supplied bathroom prices as direct-cost inputs consistent with the existing estimator. Tax is separate and requires configured rules.

Generate stable lines keyed by bathroom ID + scope/component ID. Recalculation replaces derived lines and preserves manual extras. Combine bathroom, flooring, and door direct costs before applying project markups, without duplicate package or cross-module charges. A bathroom floor must not be estimated twice by bathroom and flooring modules.

Use decimal-safe calculations, explicit units, cents rounding, authoritative calculation on the external estimator's server, saved draft status, permissions, concurrent-edit protection, and immutable source revisions. Save measurement adjustment policy, material package/rate versions, finishes, assumptions, quantity overrides, and completeness issues upstream. Persist immutable serialized intake deliveries, stable IDs, genuine source times, and returned HBUILD references. Allow incomplete draft saves; do not issue a complete priced quote with unresolved required rates or measurement policy. Never treat proposal selling totals as H LEDGER actual costs or approved budgets.

## Numerical acceptance checks

Example A, partial demolition/material takeoff only:
- 90 SQFT tile-surround demolition at $4 = $360 labor.
- Independently confirmed existing pan demolition footprint of 15 SQFT at $9 = $135 labor.
- Known demolition subtotal = $495; with 2.12 multiplier = $1,049.40 before tax, explicitly not a complete bathroom estimate.
- New wall installation 90 SQFT with no waste or box rounding: 6 backerboard sheets and 90 SQFT tile. An entered 8-foot wall height does not multiply the 90 SQFT again.

Example B, independent known optional allowances:
- Simple drywall touchups $535 + one $130 P-trap allowance + one $250 combined faucet allowance + one $75 vanity-light labor + two towel-bar installs $50 + one mirror install $125 + one additional light $375 = $1,540 known direct cost.
- Before-tax marked-up known subtotal = $3,264.80. This omits unpriced materials/scopes, and P-trap coverage still needs clarification; do not label it a complete quote.

Conditional measurement check, only after the stated adjustment is confirmed: entered 60 × 36 inches less 1 inch total on each dimension gives 59 × 35 / 144 = approximately 14.34027778 SQFT. Do not use 15 SQFT or subtract the inch again. Keep this test separate from the independently measured demolition example.

Verify branches for tub/no tub/no shower, no demolition with new tile, independent old/new pan areas, zero/negative dimensions, 15 versus 15.1 SQFT sheet rounding, no double multiplication by wall height, mutually exclusive drywall categories, finish changes without duplicate fixtures, vanity replacement off, custom widths, accessory integer counts, overlapping light scope, package deduplication, missing-price issuance checks, and stable historical rates. Report actual implementation and tests separately from this specification.
