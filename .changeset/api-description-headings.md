---
"blume": patch
---

Headings in an API spec's descriptions no longer add `<h1>`s to reference pages. A spec's `info.description` is often a document of its own under `# Introduction` and `# Authentication` headings, so the overview page had several `<h1>`s besides its title. Headings in `info.description` and in an operation's description now move one level down (`#` renders as `<h2>`), and headings in a tag's description two (`#` renders as `<h3>`, under the tag's section).
