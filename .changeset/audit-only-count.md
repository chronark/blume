---
"blume": patch
---

`blume audit --only` and `--skip` now narrow the counts the report prints to the checks they leave in: the audit count in the summary, the `audits` count in `--json`, and the count beside each skipped tier. Before, `blume audit --only redirects` filtered the findings but still printed the counts for every check, so the filter looked ignored. A skipped tier the filter leaves no checks in isn't listed.
