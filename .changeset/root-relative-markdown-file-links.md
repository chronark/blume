---
"blume": patch
---

A root-relative link to a Markdown file, like `[Setup](/guides/setup.md)` (the way VitePress, Docsify, and TypeDoc write one), now lands on the page that file publishes, its `slug` and ordering prefix included, as a relative `./setup.md` link already did. It kept its path, which is also the URL of the page's Markdown copy, so readers landed on raw Markdown, and `blume validate` passed it. The link is read from the content root; under a `deployment.base`, one that starts with the base is read as including it. A link that names no file in your content keeps its path, so a link to a page's Markdown copy still works, and a raw `<a href>` keeps its path too. The page's Markdown copy and `llms-full.txt` get the same rewrite, and `blume validate` checks the link at that page.
