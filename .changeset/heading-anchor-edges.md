---
"blume": patch
---

Heading anchors no longer pick up stray dashes or badge text. A heading that ends or starts with a component, an image, or raw HTML slugged the space beside it into its id (`## Maintainers <Badge/>` anchored as `#maintainers-`), and one ending in a symbol after a space kept a trailing dash (`## Features ✨` as `#features-`). Those ids now drop the dash: `#maintainers`, `#features`. A `<Badge>`'s text is no longer part of a heading's id or its table of contents entry, so `## Install <Badge>beta</Badge>` anchors as `#install` instead of `#install-beta` and lists as "Install". A fragment can't be redirected, so links to the old anchors land at the top of the page; `blume validate` reports the ones in your own pages.

A heading that holds its own empty anchor, like GitBook's `## Title <a href="#x" id="x"></a>` or a wiki's `<a name="x"></a>`, now takes that anchor's `id` (or `name`) as its id and keeps a single self-link. Before, the anchor nested inside the heading's link in `.md` (invalid HTML, with an id ending in a dash) and stopped the self-link from rendering in `.mdx`. A raw `<a>` link in an `.md` heading no longer gets the self-link wrapped around it either.

The spaced `{ #id }` and kramdown `{: #id }` heading markers that MkDocs writes, and an attribute list that sets the id beside classes or attributes (`{ #id .wide }`), stay in the heading's text in `.md`, where only the unspaced `{#id}` pins an anchor. `blume dev`, `blume build`, and `blume check` now warn about them as `BLUME_MD_CURLY_ANCHOR`, naming the file and line and the `{#id}` or `[#id]` spelling to use, instead of silently giving the heading an id like `setup--setup`.
