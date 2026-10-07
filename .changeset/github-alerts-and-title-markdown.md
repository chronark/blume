---
"blume": patch
---

GitHub alerts render as callouts in `.mdx`. A quote that opens with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` becomes a note, tip, note, warning, or danger callout, with any text after the marker as its title; before, it rendered as a plain quote that showed the marker as text. In an `.md` page, which renders no components, the quote stays a quote, and `blume dev`, `blume build`, and `blume check` now warn about it as `BLUME_MD_GITHUB_ALERT` so you can rename the page to `.mdx`.

Callout and accordion titles keep their inline formatting. A ``:::note[Use **bold** and `code`]`` title, a `<Callout title>`, and an `<AccordionItem>` or `<Expandable>` `title` now render their code spans, emphasis, and links instead of flattening them to plain text or showing the Markdown as written. A title without any of that renders exactly as before, and an accordion keeps the id its title always gave it.
