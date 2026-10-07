---
"blume": patch
---

`blume dev`, `blume build`, and `blume validate` now warn when a project ships `public/openapi.json`. That file takes over `/openapi.json`, where Blume publishes the OpenAPI description of the site's JSON docs API, so the description wasn't generated, while `/.well-known/api-catalog` still listed `/openapi.json` as that API's description. `BLUME_PUBLIC_OPENAPI_JSON` names the file and suggests moving it to another path, like `public/specs/openapi.json`, or setting `agents.api: false`.
