# HBUILD estimator intake

## Four local estimators

The estimator workspace now has four independent tabs: Deck, Flooring & Doors,
Bathroom, and Basement Remodeling. Each has a separate locally saved draft and
its own Excel workbook download. Flooring/Bathroom calculations return unmarked
direct-cost lines; Basement composes those lines with wall, soffit, egress and
electrical scope and applies the additive 35% + 20% + 50% + 7% markup only once.
Each of the three new modules also generates a preliminary proposal PDF and
material-takeoff PDF. Unresolved material rates, scope ownership or measurements
appear as issues, and the displayed amount is a known-cost subtotal, not a
complete quote. Tax jurisdiction is not configured.

Flooring, Bathroom and Basement have browser-local drafts alongside
staff-authenticated shared drafts with optimistic version checks. The server
recalculates with versioned rates and policy before issuing immutable,
before-tax revisions. Issued PDFs and their frozen delivery snapshots are
stored privately by the estimator, not in H Docs. Basement uses one source
project identity, not separate child projects. A preliminary download or issued
revision is not a tax-inclusive contract, HBUILD import, or client release.
The provider namespace on the proxy remains `deck-estimate`.

Deck now uses the shared server-draft and immutable before-tax revision flow.
The complete current Deck form is sent as scope, keyed by its existing source
and client IDs; the server recalculates it. A revision is issueable only when
the current project, local calculation and totals match a saved server version
and all calculation/takeoff requirements are resolved. Existing HBUILD
`projectId` forms are explicitly blocked from being issued as new projects.
The old browser-generated Ledger intake records/PDFs remain local-only and
available for recovery; they are never converted, sent, or cleared by the new
flow. Deck's existing browser PDFs and tax-inclusive local selected total are
distinct from the server-issued selected-tier BEFORE-TAX quote. A queued frozen
revision is not evidence of delivery, readback, approval, or client release.
The Home Depot bathroom
package contents, unresolved door/carpet/tile rates, pan adjustment policy and
Ledger's live response contract still need owner confirmation before production
use.

The new-job workflow follows the attached HBUILD external-estimator intake contract.
It does **not** write the shared database or H Docs directly. The old existing-project
picker is no longer rendered. Saved forms carrying an old HBUILD project ID are
blocked from new-job import; download a copy and clear that form before starting a
new job. Do not import an existing job as a new external project.

| Source | Estimator server endpoint | HBUILD owner |
|---|---|---|
| New client + Deck project snapshot | `POST /api/intake/projects` → signed `POST /api/intake/v1/projects` | H Ledger maps source IDs; H FORESIGHT provisions canonical project through Ledger |
| Estimate PDF | `POST /api/intake/documents` → signed `POST /api/intake/v1/documents`, type `proposal` | H Ledger uploads and verifies; H Docs owns `estimates` folder, file and version |
| Lumber takeoff PDF, when lumber is selected | same endpoint, type `takeoff` | H Ledger uploads and verifies; H Docs owns `takeoffs` folder, file and version |

The estimator currently produces no labor sheet or proposed timeline PDF. Neither
is declared as an expected output. Both PDF types above are declared expected on
identity import; an absent takeoff remains visibly missing until lumber is selected.
No estimate total or takeoff quantity is sent as a structured financial/operational
field. A receipt never approves a contract, releases a document, changes a schedule
or confirms H Docs readback. Local PDF and Excel downloads remain independent.

## Provisioning and rollout

The API server requires the existing mesh user verifier and project-list grant
(`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PLATFORM_GATEWAY_URL`,
`PLATFORM_APP_CREDENTIAL`, `HBUILD_ORG_ID`) to check the signed-in user before
using the server-side Ledger account. It additionally requires
`H_LEDGER_BASE_URL` (HTTPS Ledger origin), `H_LEDGER_KEY_ID`, and
`H_LEDGER_SECRET`, plus `H_LEDGER_INTAKE_STAFF_USER_IDS` (a comma-separated
allowlist of verified Supabase staff user UUIDs). Set the key and secret as
server secrets only, never browser vars. Membership plus the planner-list grant
alone do not authorize privileged intake; the allowlist is an additional
fail-closed control until Ledger's intake-specific staff capability is verified.
The endpoint stays disabled until `H_LEDGER_INTAKE_ENABLED=true` is explicitly
configured **after** verifying the deployed Ledger contract, app grant and
staff-only authorization in a disposable environment.

The attached skill says Ledger's implementation is local, not production-verified.
The current Ledger source was not accessible through this workspace's GitHub
connection. The adapter therefore expects the documented `{ok:true,
data:{outcome:"applied"|"stale"}}` receipt and fails closed on any other shape.
Verify that envelope and the imported mapping/document status against the live
owner implementation before enabling delivery. No credential was provisioned,
no upstream PR was merged, and no live intake call was made here.

The browser's IndexedDB queue retains immutable serialized delivery envelopes,
delivery IDs and PDF bytes for manual retry; the original private issued PDFs
and snapshots also remain on the estimator server. The HBUILD proxy accepts
only envelopes matching an issued revision. An accepted receipt is **not** H
Docs readback evidence: files remain available at the source until verified
storage is confirmed. Clearing browser storage can lose unsent queue entries;
requeue issued revisions from their server snapshot if necessary. Separate
generated client and project source IDs remain stable across revisions; the
client ID can be reused explicitly for a returning client before delivery.
The signed upstream IDs use the fixed provider account namespace, never the
signed-in staff user. See [the queue state machine](SYNC_QUEUE.md) for paused
delivery and recovery behavior.

## Staging acceptance before enabling

- Provision a disposable Ledger intake provider account bound to the intended
  organization and acting staff user. Check that a signed-in non-staff member
  cannot use the estimator proxy; the current planner-list gateway guard is a
  necessary check, not proof of an intake-specific staff role.
- First import creates one client/project and vault with an optional job code;
  replay is idempotent, and changed payload under the same key is rejected.
- Same-name clients in other accounts/orgs are not matched; mapping conflicts
  require review, and older source timestamps cannot revert newer data.
- Both PDFs are attached to the mapped project with exact size/hash and H Docs
  readback/version evidence. Missing takeoff remains missing. Corrupt/oversized
  files fail, and a Docs outage permits the exact pending delivery to be retried.
- Verify new versions remain staff-only and do not replace already released
  versions. Existing schedules, assignments, budget facts, invitations and
  portal permissions remain unchanged.