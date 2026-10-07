---
"blume": patch
---

An HTML comment in a `.md` partial no longer shows on an `.mdx` page that includes it. The partial is read as MDX there, which has no HTML comments, so `<!-- a note -->` rendered as visible text (with its dashes turned into en dashes). Its comments are now spliced as MDX comments (`{/* a note */}`), so they stay hidden, while a comment shown in a code block or inline code stays as written.
