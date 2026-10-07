---
"blume": patch
---

`mdxRemote({ url, files })` no longer warns `BLUME_MISSING_SECRET` for `GITHUB_TOKEN` when the `url` is on `raw.githubusercontent.com`. A public repository's raw files need no token, so the warning fired on every build of a site that needed nothing set. Only the `github` form, which lists files through GitHub's rate-limited API, still declares the variable. When GitHub refuses a remote file with a 401, 403, or 404 while `GITHUB_TOKEN` is unset, the warning for the skipped file now says so.

A remote page whose file opens with a `# Heading` no longer shows two `<h1>`s. When that first heading matches the page's front matter `title`, or the front matter sets no `title`, Blume drops it and uses its text as the title. A first heading that differs from `title` stays.
