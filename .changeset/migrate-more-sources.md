---
"blume": minor
---

`blume migrate` now moves sites from VitePress, VuePress, Docus, MkDocs (including Material for MkDocs and Zensical projects), mdBook, Fern, GitBook, Redocly, ReadMe, Docsify, Jekyll (Just the Docs), and GitHub wikis. Name the source (`npx blume migrate gitbook --claude`) or let Blume detect it from the project's files; a GitHub wiki is always named. The bundled `blume-migrate` skill has a mapping reference for each one, plus codemods for VitePress, Docus, MkDocs, Fern, ReadMe, Docsify, Jekyll, and GitHub wikis that make the mechanical rewrites before the agent starts. Three helper scripts ship with it: `operation-routes.mjs` maps each OpenAPI endpoint to its Blume route for redirects, `pin-heading-ids.mjs` keeps a migrated site's old heading anchors working, and `include-excerpts.mjs` generates the partial-file code excerpts (mdBook anchors, VitePress regions, line ranges) that `<include>` can't select.
