---
"blume": patch
---

Hiding the home page with `sidebar.hidden` (or `hidden`) to drop its sidebar row no longer takes it out of the sitemap, site search, `llms.txt`, the site skill, the MCP server's page list, or the JSON API. The site's root URL always serves the home page, so it stays listed, as a hidden folder `index` page that its group row links already did. This applies to each locale's and archived version's home page too.
