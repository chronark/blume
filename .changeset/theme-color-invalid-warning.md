---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn when `theme.accent`, `theme.action`, `theme.background`, or a `seo.og.palette` color isn't a CSS color, like `"deep purple"` or a hex value without its `#`. Before, the config took any string and the site shipped it, so browsers ignored every style that used the color, with no warning. `BLUME_THEME_COLOR_INVALID` names the field, its value, and the line in `blume.config.ts` that sets it, and lists the accent presets and the color forms to use instead. It's a warning, so an existing build still passes unless it runs with `--strict`.
