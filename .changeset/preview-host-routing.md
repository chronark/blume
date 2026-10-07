---
"blume": patch
---

`blume preview` now answers a static build's redirects the way the host files the build writes do. Pattern redirects like `/old/*` → `/new/:splat` used to 404, because only the exact redirects had redirect pages in `dist/`. Every redirect, exact or pattern, now gets its configured status, including the Markdown copies a moved page takes with it.

`blume dev` and `blume preview` also handle trailing slashes the way static hosts do. A slashed page URL like `/guide/` used to 404 in both. It now redirects to `/guide` and keeps the query string. A folder of HTML shipped in `public/`, like `public/demo/index.html`, is served at `/demo/`, and `/demo` redirects there. Before, `blume preview` served it only at `/demo`, so the relative links inside it broke, and `blume dev` served it at neither URL.
