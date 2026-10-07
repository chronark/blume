---
"blume": patch
---

`BLUME_UNKNOWN_COMPONENT` now names every page that uses an unknown component, with a count, instead of only the first one it found. A `<Widget>` on five pages used to report one route, so fixing that page brought the same warning back for the next.
