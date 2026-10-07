---
"blume": patch
---

A page without a frontmatter `title` that opens with a `# Heading` shows that heading once. The page took its title from the heading and rendered it as the page heading, but the heading stayed in the body too, so it appeared twice, one above the other, and `blume audit` reported two `<h1>` tags. The opening heading now gives the page its title and leaves the body, and the page heading takes its anchor, so links to `#the-heading` still land. `llms-full.txt` opens each page's section with its title, so a body that opens with a `# Heading` of the same text showed it twice there too; the section now drops the body's copy. A page with a `title`, a `#` heading after other content, and a page in `custom` or `frame` mode, which shows no title, keep their headings as before.
