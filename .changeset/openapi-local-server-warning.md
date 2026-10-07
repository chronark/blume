---
"blume": patch
---

`blume dev`, `blume build`, and `blume validate` now warn when an OpenAPI spec's server is a local address (`localhost`, `127.0.0.1`, `0.0.0.0`, or `[::1]`), which frameworks write when the spec is exported on a dev machine. Blume published it as the server Try it sends requests to and the code samples call, which readers can't reach. `BLUME_OPENAPI_LOCAL_SERVER` names the spec and the URL, and suggests listing the public URL in `servers` or setting it with an overlay.
