---
"blume": patch
---

`blume dev`, `blume build`, and `blume validate` now warn when a spec that declares OpenAPI 3.1 or later uses `nullable`, which 3.1 removed. Blume shows those values as nullable, but validators and SDK generators that follow 3.1 read them as never null. `BLUME_OPENAPI_NULLABLE` names where, as JSON Pointers into the spec, and suggests `type: [string, "null"]`.
