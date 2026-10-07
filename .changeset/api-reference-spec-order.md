---
"blume": patch
---

API reference operations now follow the spec's order in both the sidebar and the overview page: paths in the order the spec lists them, and each path's methods in the order they're written. Before, the sidebar sorted a tag's operations alphabetically by label, and the overview listed each path's methods in a fixed order (GET before POST, and so on). A `meta.ts` in a tag's folder that sets `pages` still decides the sidebar order.
