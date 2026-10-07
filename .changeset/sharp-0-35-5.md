---
"blume": patch
---

Blume now requires `sharp` 0.35.5, which patches a memory vulnerability in its bundled librsvg (GHSA-wq5f-xc86-pv6w). The bug can lead to remote code execution on glibc-based Linux when sharp renders an SVG.
