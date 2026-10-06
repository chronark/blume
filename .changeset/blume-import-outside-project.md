---
"blume": patch
---

A `meta.ts` under a content root outside the project folder, like `content: { root: "../docs" }` or a sibling package in a monorepo, can now `import { defineMeta } from "blume"`. Before, Blume looked for `blume` from the meta file's own folder upward. A project that installs `blume` in its own `node_modules` failed every such file with `BLUME_META_LOAD_FAILED: Cannot find module 'blume'`. Blume now resolves `blume` and its subpaths (`blume/sources`, `blume/schema`, …) to the running Blume package wherever the file lives. The same fix applies to files that `blume.config.ts` imports from outside the project.
