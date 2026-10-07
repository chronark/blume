---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn about two kinds of JSX in `.mdx` that built green and did nothing:

- `BLUME_MDX_EVENT_HANDLER`: a JavaScript event handler on an HTML element, like `<button onClick={() => open()}>`. The page is static HTML, so the handler never ran. The warning names the file and line and points to islands, which do run in the browser.
- `BLUME_UNKNOWN_PROP`: a built-in component with no children given props it doesn't take, like VitePress's `<Badge type="tip" text="beta" />`, which rendered an empty badge. The warning lists the props the component takes and suggests writing the content between the tags. A component you replace in `components.ts` isn't checked.
