# HBUILD delivery queue: estimator-side state machine

This describes the estimator's outbound queue, **not** H Ledger's internal state.
The office-owned `ledger.estimator_sync` switch may be off. While off, new
estimator records do **not** appear in HBUILD. Authoring, server pricing,
revision issuance and local/private PDF generation continue independently.
Neither this document nor a queue receipt enables live HBUILD intake.

| State | Meaning | Next action |
|---|---|---|
| `queued` | Frozen body, PDF bytes and delivery ID saved locally before send. | If intake is explicitly provisioned and the connection is available, send oldest project identity before its documents. |
| `sent` | Signed request in flight; outcome not yet confirmed. | Preserve the same body and key on uncertainty/retry. |
| `paused` | H Ledger returned HTTP 503 with `error.details.reason: "estimator_sync_disabled"`. No receipt or import occurred. | Hold the entire HBUILD connection; send no later entries. At most one oldest-item probe per Retry-After period, or one manual check. |
| `needs-attention` | Terminal/ambiguous response such as revoked credentials (401) or reused key with a different body (409). | Staff review; never blind-retry or interpret as office pause. |
| `stale` | Ledger accepted an older identity snapshot as superseded. | Keep its record; send the latest genuine queued revision where applicable. Do not fabricate a newer source time. |
| `verified` | H Docs file readback has been positively verified for that exact version. | Source files may then be retired under a separate retention policy. **A 200/applied receipt alone does not reach this state.** |

`applied` or `Idempotent-Replayed: true` records a receipt, not document
verification, approval or release. The current client does **not** have a
positive H Docs readback-status API, so it never automatically marks a file
`verified`. Retain each frozen delivery and source file until its document
readback is verified. A 503 **without** the exact pause marker and a 429 use
bounded retry with Retry-After; neither changes the connection to paused.
On a successful probe, drain in original identity-before-document order
using the saved key and body. Only a newer queued revision for the same
source may supersede an untouched older revision; never erase in-flight or
acknowledged history. HBUILD will not resend on the estimator's behalf.

The server stores the HBUILD pause for the organization in the estimator's
own database, preventing other staff sessions from bypassing the retry window;
an atomic probe claim allows one upstream check when that window expires.
The browser also retains its local queue and pause marker across reloads,
and uses an exclusive sender lock to avoid two tabs overwriting progress.
With the rollout switch off, issued revisions can still be queued but no
intake request is made. The pause response is based only on HTTP 503 plus the
exact reason marker, not response prose.

The pause is scoped to the HBUILD connection. Do not work around it via manual
creation, another HBUILD endpoint, unsigned requests or direct HBUILD database
access. New provider-account creation is not a resume mechanism. Deck's
legacy browser-built payloads cannot currently pass the estimator's
issued-revision intake guard; they remain visible but must not be forwarded.
The referenced updated Ledger contract section was not supplied in this
workspace; the exact pause marker and Retry-After behavior above come from the
owner-provided pause specification.