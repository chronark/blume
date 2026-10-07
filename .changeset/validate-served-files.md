---
"blume": patch
---

`blume validate` now accepts links to the files Blume writes beside your pages. A link to `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt`, an RSS feed, `/openapi.json`, `/skill.md`, or a `.well-known` file like `/.well-known/agent-skills/index.json` was reported as a missing asset (`BLUME_BROKEN_ASSET`), which failed `--strict`. Each now counts while the config has its feature on, so a link to `/llms.txt` with `agents.llmsTxt` off is still reported. A link to a `public/` folder with an `index.html`, like `/demo` or `/demo/` for `public/demo/index.html`, now resolves too, instead of failing as `BLUME_BROKEN_LINK`.

A project with no `public/` folder no longer skips its asset checks with a `BLUME_ASSETS_UNCHECKED` note. It ships no public files, so a link to `/logo.png` there is reported as `BLUME_BROKEN_ASSET`, and images beside a page are checked as before.

A `navigation.featured` link, header action, or call to action that points at a `public/` file (`/spec.pdf`) or a generated one (`/llms.txt`) no longer warns `BLUME_NAV_MISSING_PAGE` in `blume dev`, `blume build`, and `blume doctor`.
