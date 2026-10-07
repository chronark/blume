---
"blume": patch
---

A page without a frontmatter `title` that opens with a `# Heading` shows that heading once. The page took its title from the heading and rendered it as the page heading, but the heading stayed in the body too, so it appeared twice, one above the other, and `blume audit` reported two `<h1>` tags. The opening heading now gives the page its title and leaves the body. A page with a `title`, a `#` heading after other content, and a page in `custom` or `frame` mode, which shows no title, keep their headings as before.
