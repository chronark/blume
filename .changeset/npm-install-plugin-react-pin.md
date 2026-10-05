---
"blume": patch
---

`npm install blume` and `npx blume init` finish again. `@vitejs/plugin-react` 6.1.2 asks for `oxc-transform-react` 0.152 while `@astrojs/react` 7.0.0 still asks for 0.145, and npm swapped between the two until it ran out of memory. Blume now pins `@vitejs/plugin-react` to 6.1.1, the version that matches the `oxc-transform-react` it ships, so npm, pnpm, and Bun all install without peer warnings.
