# External estimator environment for HBUILD calculators

Scope: flooring/doors, bathrooms, and the basement calculator that composes them. Source: user-provided HBUILD-External-Estimator-Skill.zip, whose evidence is dated 2026-09-25, and the local HBUILD update contract. This is specification alignment, not independent verification of APIs, migration deployment, account provisioning, or a live connection. The archive's SKILL.md was read as environment reference, not installed or executed. Preserve all unresolved trade pricing decisions.

## Ownership and boundaries

- External estimator: client/project/estimate authoring, quantities, direct costs, markups, packages, revisions, PDF generation, and durable delivery queue.
- Ledger: owner-provisioned estimator provider accounts, external mappings, identity import, receipts/review state. Account binds organization and acting owner; body cannot choose another organization.
- Foresight/planner: internal project identity, assignments, scheduling. Ledger provisions via its granted gateway capability.
- Docs: immutable files, integrity, audiences, released version. Ledger provisions folders and uploads/readbacks.
- Draft: operational plans/siteplans/timelines over imported projects, not estimator authoring or retired intake.
- Panel: authorized presentation of released versions.

An import does not create a Ledger financial job, approve a budget, mark work sold, publish events, accept a change order, invite recipients, or release documents. Actual financial authority is separate; do not import proposal totals as actual costs. Cross-provider identity requires explicit mapping, never matching by name/email/address/job code. Job code is display only. Leads without projects stay upstream.

## Adapter contract

Read the adjacent intake-contract.md for exact strict schemas, limits, signing, and response fields. Recheck implementation when building the adapter; do not invent additional fields.

1. Owner provisions an estimator account through Ledger. No secrets in browser bundles, Markdown, logs, or PDFs.
2. External server POSTs identity to /api/intake/v1/projects using stable client/project external IDs, genuine source.updatedAt, optional revision label, and only supported fields. Missing names must not be fabricated.
3. Once project import is ready, POST actual PDFs to /api/intake/v1/documents with stable document ID, supported type, source time, application/pdf, SHA-256, and base64 of the same bytes. Maximum 8 MiB PDF / 12 MiB JSON; identity JSON maximum 64 KiB. URL uploads and structured estimates are unsupported.
4. Retain source files until returned document status is verified. Inspect nested statuses even for successful HTTP/applied receipts.

Sign serialized JSON exactly once: HMAC-SHA256 key is the HEX STRING SHA256(secret), message is timestamp + '.' + rawJsonBody. Use signIntake where available. Headers: Content-Type application/json, x-hbuild-key, x-hbuild-timestamp (Unix seconds), x-hbuild-signature (lowercase hex), Idempotency-Key. Timestamp tolerance 300 seconds. Delivery IDs are 16–100 alphanumeric/underscore/hyphen characters and unique across both endpoints per account.

Store immutable body and delivery ID. On transport errors, 503, or 429 use bounded backoff; honor Retry-After. Refresh signature/time on retry while preserving body and ID. Stop automatic retries for 400/401/409/413 and surface the reason. Finished applied/stale receipts replay for the same ID/body; changed body conflicts. An applied receipt can contain waiting_for_client, conflict, or failed statuses: after staff resolution resend genuine state under a new delivery ID, since replaying the finished receipt does not redo work. Never invent newer source timestamps. The same delivery may be retried after resolution of an unstored 409/503, per the contract.

## PDF and visibility rules

- proposal → estimates folder: customer scope and selling prices, without internal margins.
- takeoff → takeoffs: quantities/materials; trade-safe output when intended for sharing.
- laborsheet → laborsheet: appropriate separate subcontractor scope/terms, not everyone's rates or internal margins.
- timeline → timelines: proposed reference, not scheduled events.

Declare only outputs actually expected; missing outputs remain missing, never empty placeholder PDFs. Floorplans/siteplans/budgets/receipts are not supported intake types just because folders exist. Ledger owns generated filenames/folder provisioning; preserve source names as metadata and use IDs for identity.

All imports start staff-only with no released version. Verified means size/hash/MIME readback matched, not approval. Newer versions remain staff-only until explicit staff release. The intake has no recipient field; staff uses Docs sharing with recipientPersonId for intended subcontractors. A PDF with multiple subcontractors' private terms must be separated appropriately before sharing. Keep schedules, portal bindings, staff notes, release state, and approved budgets untouched by source updates.

## UI and acceptance

Show draft/pricing completeness separately from HBUILD import state. Provide project identity status plus each expected document's pending/review/failed/verified state and actionable errors. Do not label an HTTP 200 as complete sync.

Verify with adapter-shaped fixtures in staging/disposable storage: first import; exact replay without duplicates; changed body conflict; old/equal/new source times; account/organization isolation; email conflict without merge; missing project; invalid/oversized/corrupt PDFs; revoked credentials; unavailable grants/Docs; retry recovery without new projects; independent document versions; staff-only newer revisions; no operational-field mutation; and unsupported structured fields rejected. Keep trade arithmetic tests from each prompt.

Report specification, implementation, tests, connection, and production verification separately. This document authorizes none of the production actions itself.
