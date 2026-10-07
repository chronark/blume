---
"blume": patch
---

API reference tag folders now split camelCase and PascalCase tag names into words, the way operation slugs already did: the tag `InboxesThreads` is served at `/reference/inboxes-threads/…` instead of `/reference/inboxesthreads/…`. The old URLs keep working: Blume redirects each one (and its `.md` and `.mdx` copies) to the page's new URL with a 301, unless a page or a redirect you configured is already at that URL. This applies to `openapi()`, `asyncapi()` (including untagged operations grouped by channel address), and `graphql()` references.
