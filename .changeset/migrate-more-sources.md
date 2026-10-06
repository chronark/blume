---
"blume": minor
---

`blume migrate` now moves sites from VitePress, VuePress, MkDocs (including Material for MkDocs and Zensical projects), Fern, GitBook, Redocly, ReadMe, and Docsify. Name the source (`npx blume migrate gitbook --claude`) or let Blume detect it from the project's files. The bundled `blume-migrate` skill has a mapping reference for each one, plus codemods for VitePress, MkDocs, Fern, ReadMe, and Docsify that make the mechanical rewrites before the agent starts. Two helper scripts ship with it: `operation-routes.mjs` maps each OpenAPI endpoint to its Blume route for redirects, and `pin-heading-ids.mjs` keeps a migrated site's old heading anchors working.
