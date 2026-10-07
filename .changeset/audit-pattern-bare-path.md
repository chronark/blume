---
"blume": patch
---

`blume audit` now checks where a pattern redirect sends its bare path. A pattern ending in `/*` or `/:name*` also matches the path without that segment: `/mcp/*` → `/user-api/*` sends `/mcp` to `/user-api`, and every host gets that rule. When `/user-api` isn't a page, the audit now reports `BLUME_AUDIT_REDIRECT_BROKEN` for the pattern and names `/mcp`. A pattern that sends its bare path to itself, like `/a/*` → `/a`, is reported as `BLUME_AUDIT_REDIRECT_LOOP`. The audit also stops following a redirect chain that grows a segment at each hop, which used to keep it running forever, and reports the chain as a loop.
