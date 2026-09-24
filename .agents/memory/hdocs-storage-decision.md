---
name: Hdocs file storage
description: Owner decision on where Hdocs should keep uploaded PDFs
---

Use a private Supabase Storage bucket in the canonical shared HBUILD project for Hdocs-generated or uploaded PDFs.

**Why:** The owner explicitly chose private Supabase Storage when the Hdocs upload backend and bucket were found to be unimplemented. This is an authorization to design that storage path, not to skip Hdocs' file/version contract or grant direct browser access.

**How to apply:** Hdocs owns private storage, file/version metadata, and release rules. For this external estimator, use H Ledger's signed intake; Ledger delegates upload/readback to Hdocs. Do not expose a privileged storage key or treat an empty bucket as an existing upload contract.