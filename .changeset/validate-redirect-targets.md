---
"blume": patch
---

`blume validate` now checks where each redirect leads. Only `blume audit` did, on the built site, so a redirect to a page that was never written passed `validate --strict` and 404'd once deployed. An exact internal `to` must now be a page, a file in `public/` or one Blume generates, or another redirect's `from`; for a pattern, something must be served under the literal part of `to` before its first capture (`/v2/` in `/v2/:slug*`). One that leads nowhere warns `BLUME_BROKEN_REDIRECT`, located at its `to` in `blume.config.ts`. Links to a redirect's `from` stay valid.

`validate` also accepts links to API reference pages, like a `scalar()` page at `/reference`, which it reported as `BLUME_BROKEN_LINK` though the build serves them.
