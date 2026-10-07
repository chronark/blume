---
"blume": patch
---

A `<CodeBlock>` with no `code` prop, like a fenced block wrapped in `<CodeBlock>…</CodeBlock>` the way Fern and Mintlify write code, no longer fails the build with a bare `TypeError` that named no file or line. Without `code`, `CodeBlock` now renders its children as written, so the wrapped fence shows as it would on its own, and the page's Markdown copy and `llms-full.txt` unwrap it the same way.
