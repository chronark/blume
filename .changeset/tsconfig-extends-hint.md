---
"blume": patch
---

A project `tsconfig.json` whose `extends` doesn't resolve, such as a package that isn't installed, failed `blume build` with Astro's `GenerateContentTypesError` and no hint that the build reads that file. `blume build`, `blume dev`, and `blume check` now report `BLUME_TSCONFIG_EXTENDS` at the line that names the target, and say to install it or remove it from `extends`.
