---
"blume": patch
---

Under a `deployment.base`, a root-relative URL in raw HTML now gains the base like a Markdown link does. `<a href="/guide">`, `<img src="/logo.png">`, and any other element's `href` or `src`, as raw HTML in `.md` or an element in `.mdx`, shipped without the base, so they pointed outside the site, while `blume validate` passed them. A URL that already starts with the base, an external URL, and a `#fragment` are left as written, and a raw `href` still gains no `basePath`.
