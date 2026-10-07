---
"blume": minor
---

Add a `<Changelog />` component, so a hand-written `/changelog` page can put an introduction or a feed link above the generated release list instead of rebuilding the list by hand. Place the tag in `changelog/index.mdx` with `mode: center` to match the generated page's layout. It lists the same releases the generated page does, GitHub Releases entries included, and downlevels to that list in `/changelog.md`, llms-full.txt, MCP `get_page`, and search. The generated page now renders the same component.
