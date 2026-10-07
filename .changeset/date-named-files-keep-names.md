---
"blume": patch
---

A file or folder named with a day- or month-first date, or a year and month, now keeps its whole name in its URL. Blume read the first number as an ordering prefix, so `changelog/12-05-2022.mdx` published at `/changelog/05-2022` and `changelog/2024-01.mdx` at `/changelog/01`, with no warning, and two files that differed only in that number collided on one route. Now `12-05-2022` (`D-M-YYYY` or `M-D-YYYY`) and `2024-01` (`YYYY-MM`) stay whole, like an ISO date (`2024-01-05`) already did, so those pages publish at `/changelog/12-05-2022` and `/changelog/2024-01`. Each old URL redirects to the new one with a 301, its Markdown copies included, unless another page now lives there or a configured redirect already starts there.
