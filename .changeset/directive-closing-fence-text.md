---
"blume": patch
---

`blume dev`, `blume build`, and `blume check` warn when a `:::` container's closing line has text after its colons. Inside a `:::warning`, a `::: card` line closes the callout, so `card` was dropped from the page and the text after it fell outside the callout, with no warning. `BLUME_DIRECTIVE_CLOSING_TEXT` names the file and line and suggests a longer outer fence (`::::warning` … `::::`) to keep the line inside the callout. A callout opener written with a space, like `::: tip` from VitePress, VuePress, or Docusaurus v2, isn't a directive and shows as text. Blume now warns about it as `BLUME_DIRECTIVE_SPACED_NAME` and gives the unspaced spelling, with a title moved into brackets (`:::tip[Title]`).
