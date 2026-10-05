---
"blume": patch
---

A `cloudflare()` server build no longer writes `dist/server/node_modules`. The Worker bundles everything it imports, so the links to Blume's dependencies there were never loaded, but a copy of `dist/` that followed them (such as a CI artifact) uploaded every dependency as a Worker module and failed the deploy on the 64 MiB size limit. `dist/` now deploys the same wherever it's copied.
