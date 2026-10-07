---
"blume": patch
---

A redirect from a page's own `index.html` URL, like `{ from: "/guide/index.html", to: "/guide" }`, no longer fails a static build with `EISDIR`. Astro wrote the redirect page to `guide/index.html/index.html`, which needs the page's own `guide/index.html` file to be a folder. The build now writes no redirect page there, since the page itself is served at that URL. The redirect still goes into `_redirects` and `vercel.json`, so hosts that read them answer it with the redirect, and `blume dev` answers it too.
