---
name: Generated API date-time validation
description: A response-validation trap when serving OpenAPI date-time fields
---

Validate database timestamp values as Date objects before sending JSON from the API. The generated response validator for an OpenAPI date-time field expects a Date, even though the wire response is an ISO string after JSON serialization.

**Why:** Serializing to ISO before response validation caused a write to succeed but the API to report failure, making successful draft saves and issued revisions look lost.

**How to apply:** When adding or changing response validation for date-time fields, test both the value passed to the generated validator and the final HTTP JSON representation, especially after transactional writes.