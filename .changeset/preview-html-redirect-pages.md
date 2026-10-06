---
"blume": patch
---

`blume preview` serves a page again when a redirect points its old `.html` URL at it, like `/guide.html` to `/guide` after a migration from VitePress, VuePress, or MkDocs. The redirect page for `/guide.html` lands in a `guide.html/` folder, and the preview server took that folder for the page, so `/guide` showed the redirect page and refreshed to itself forever. A redirect from an `.html` URL also no longer adds redirects for `/guide.html.md` and `/guide.html.mdx`, URLs that never had a Markdown copy.
