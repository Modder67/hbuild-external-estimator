---
name: Estimator staff authorization
description: The approved relationship between HBUILD intake staff and shared estimator quote permissions.
---

Use the existing HBUILD intake staff allowlist for shared estimate drafts and quote issuance unless an explicit estimator-specific staff list is configured. Keep authorization gated by verified identity and the HBUILD organization/app grant. Do not infer from this permission that HBUILD intake or client delivery should be enabled.

**Why:** The user explicitly approved reusing the existing intake staff list when the separate estimator list was unconfigured and blocking draft access. This permits the same trusted staff to work on quotes without turning on downstream intake or delivery.

**How to apply:** When changing staff provisioning for any of the four estimators, preserve the explicit separate-list override and fail closed on invalid allowlists. Treat HBUILD intake enablement as a separate decision.