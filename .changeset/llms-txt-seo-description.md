---
"blume": patch
---

`llms.txt` and the generated site skill now summarize each page with its meta description, the same text as the page's `<meta name="description">`: `seo.description` when the page sets one, else `description`. Before, they read only `description`, so a page summarized only in `seo.description`, like a generated reference page or an OpenAPI operation page, was listed with no summary.
