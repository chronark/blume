---
"blume": patch
---

`blume dev`, `blume build`, and `blume validate` now warn when two operations in an OpenAPI spec share an `operationId`. Blume keeps both pages by adding the method to the second one's id (and to its URL when the two share a tag), which used to happen without a sign. `BLUME_OPENAPI_DUPLICATE_OPERATION_ID` names both operations and where the second one ended up.
