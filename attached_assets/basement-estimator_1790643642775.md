# HBUILD basement rules and integration

Use for the HBUILD basement remodeling calculator. Rates below are supplied by the user, not researched market prices. Reuse flooring/door and bathroom modules; preserve their unresolved rates. Later explicit user decisions override assumptions.

## Existing site conditions

Egress Window Yes/No: Yes adds no cut fee; No adds $2,500 Egress Window Cut fee once for the default one-opening scope. This is a cut allowance, not a priced complete window/well/drainage installation or a compliance determination. Additional openings and other work require explicit scope/rates. Retain the amount as an unsplit direct charge because its labor/material allocation is unspecified.

## Perimeter walls

Each perimeter wall has named segments. Capture segment length with explicit units, wall height, stud specification/length, drywall sheet choice, and finished face count. Confirmed user instruction: ASK for wall height; do not assume a default. Require it for the sheet takeoff. Allow the user to apply an entered height to selected walls/segments, retaining local overrides. Store physical segments independently from UI grouping.

User rule: one stud every 16 inches plus two extra backing studs per segment. A proposed end-inclusive calculation for a positive segment is:

```text
length inches = length feet × 12
spacing intervals = ceiling(length inches / 16)
layout studs = spacing intervals + 1
segment studs = layout studs + 2 backing studs
```

The endpoint +1 is an explicit estimating assumption, not wording supplied by the user; keep it visible/configurable pending confirmation. Zero-length entries contribute nothing and are not active walls. Sum per physical segment; do not add two backing studs merely because a display row wraps. Shared corners, openings, headers, plates, and unusual framing need explicit details; the spacing count is not a complete structural layout.

Drywall lengths: 120 inches (10 ft) or 96 inches (8 ft). Sheet width was not supplied: expose it, with 48 inches only as a clearly labeled proposed default pending confirmation. Do not confuse sheet length with sheet coverage or assume wall height equals sheet length.

```text
wall area = sum(segment length ft × wall height ft × finished faces)
sheet coverage SQFT = sheet length inches × sheet width inches / 144
sheet count = ceiling(eligible wall area × (1 + configured waste) / sheet coverage)
```

Define opening deductions and purchasing/waste policy explicitly. With no approved waste use base coverage counts labeled preliminary. Area-based rounding is a minimum coverage estimate, not an optimized cutting layout. Aggregate compatible sheets per purchasing group before rounding when sharing stock is permitted; keep room attribution. Default perimeter finished faces may be proposed as 1 but must be visible/editable. Do not include ceilings or wet-wall backerboard surfaces automatically.

Wall pricing uses physical wall LFT once, not board area or number of faces:
- Framing and drywall labor: $4/LFT combined.
- Material: $12/LFT.
- Known wall direct cost = LFT × $16.

Treat stud and drywall quantities as informational takeoff under this fixed wall material allowance, not additional material charges. Exact $12 package coverage still needs confirmation. If itemized material pricing is later selected, replace the allowance for that scope rather than adding both. Extra faces, heights, insulation, finishes/paint, ceilings, partitions, permits, and other unpriced scope must be explicitly included, excluded, allowed for, or flagged.

## Soffits

Capture length, width, drop height, exposed faces, and measurement units. Width/drop are necessary to describe coverage; length alone cannot verify plywood width or drywall area.

- Supplied plywood rule: one 8-foot piece per 8-foot soffit section. Base pieces = ceiling(soffit length ft / 8). Required piece width/thickness and coverage compatibility remain unspecified; do not silently translate a piece to a standard 4 × 8 sheet.
- Confirmed lumber rule: six 2×4s per 8-foot section, including a partial final section. Section count = ceiling(soffit length ft / 8); lumber piece count = 6 × section count. Base stock is 2×4×8; any longer stock requirement is specified separately below.
- User requests longer 2×4 stock for soffits over 8 ft, up to 20 ft. Keep the confirmed six-per-section piece count separate from stock-length selection. Store required run length and selected available stock length. Which of the counted pieces must span the longer run remains a layout detail; do not automatically upsize all 18 pieces of a 17-ft soffit to long stock or add a second set of six. Select configured stock at least as long as each identified required run, at most 20 ft. Do not invent availability or fractional stock sizes. Runs over 20 ft or unavailable lengths require a reviewed segmented layout.
- Whether $4 labor + $12 material/LFT applies to soffits is unresolved. Do not silently price a soffit at wall rates. Soffit labor/material rates, drywall coverage, and plywood/lumber package inclusion require explicit configuration.

## Electrical

Scope label: Includes rough and trim. Do not double labor by charging the listed fixture rates once for rough and again for trim.

- Panel upgrade: $4,800 fixed selected allowance.
- Subpanel install: $750 fixed selected allowance.
- Standard labor per diem: $200 × entered billable days.
- Recessed can light: $25 material + $175 labor each.
- Outlet: $35 material + $175 labor each.
- Switch: $25 material + $175 labor each.
- Wall light: $25 material + $175 labor each.
- Hanging light/fan: $45 material + $275 labor each.
- Wire: $38 per billable fixture/box.

Capture panel work as None / Upgrade / Subpanel / Both, with Both requiring distinct intended scope so accidental double selection is avoided. Panel allowances have no supplied labor/material split; preserve them unsplit.

Wire basis is the count of distinct billable electrical points, not fixtures plus their associated boxes counted again. Proposed default: one wire charge per listed fixture/outlet/switch/light/fan point. Surface shared/multi-gang boxes and overrides for review; panel/subpanel do not automatically add fixture wire charges. Distinguish physical point ID from display row.

The relationship between $200/day and unit installation labor is not explicit. Proposed mode is an additional standard daily labor fee applied once across electrical scope, not per fixture/room and not per worker unless specified. Label this assumption. Require day input or explicit exclusion; do not default silently to one day. If the owner intends alternative daily billing, switch modes and remove overlapping unit labor.

Panel photo is optional and stored upstream with access controls; its absence never prevents estimating. Do not infer panel capacity, upgrade necessity, or verified electrical scope from a photo. The existing PDF intake does not accept standalone images.

## Composition

Sum unmarked direct costs from basement, flooring/doors, and bathrooms, then apply inherited additive markups once (35% + 20% + 50% + 7% = multiplier 2.12). Shared fixtures, wall surfaces, flooring areas, and door orders require one scope owner. Bathroom combined light allowances must not also get basement fixture/wire charges for the same scope. Keep missing pricing/issues across module boundaries.

## Numerical checks

- One 16-ft segment under the proposed endpoint rule: ceiling(192/16) + 1 + 2 = 15 studs. At 8-ft height and one finished face: 128 SQFT; four 4 × 8 sheets with zero waste. Wall labor $64 + material $192 = $256. Stud/sheet quantities add no extra dollars under the fixed package.
- Egress No: $2,500 cut allowance; Yes: $0 cut fee.
- A 17-ft soffit produces three 8-ft plywood pieces under the supplied length rule and 18 lumber pieces (3 sections × 6). Longer-stock allocation, plywood width/coverage, and soffit pricing remain pending. Do not present a complete soffit subtotal.
- Electrical illustrative fixture mix: 4 cans, 6 outlets, 2 switches, 1 wall light, 1 hanging light/fan = 14 distinct billable points. Material $430; unit labor $2,550; wire $532. Under the proposed additive per-diem mode with 2 days: $400, giving $3,912 electrical direct cost before panel work. Adding a subpanel produces $4,662. These examples depend on the disclosed wire/day assumptions.
- Conditional partial project: $2,500 cut + $256 wall + $3,912 electrical = $6,668; after 2.12 markup = $14,136.16 before tax. Flooring, doors, bathrooms, soffits, and other scope are excluded from this numerical example, so it is not a complete basement quote.

Test 16-inch stud boundaries, zero/negative lengths, real segment breaks, sheet units/heights/faces/rounding, wet-wall exclusions, 8/16/20-plus soffit boundaries, unresolved soffit scope, electrical zero/count/day cases, panel choices, unique wire points, shared bathroom fixtures, module exclusion, fixed allowance versus takeoff deduplication, and one-time markups.
