---
"blume": patch
---

A project `tsconfig.json` whose `extends` or `references` doesn't resolve, such as a package that isn't installed or a framework's generated tsconfig that doesn't exist yet (Nuxt's `.nuxt/tsconfig.app.json`), failed `blume build` with Astro's `GenerateContentTypesError` and no hint that the build reads that file. `blume build`, `blume dev`, and `blume check` now report `BLUME_TSCONFIG_EXTENDS` at the line that names the target, and say to install, restore, or create it, or remove it from `extends` or `references`.
