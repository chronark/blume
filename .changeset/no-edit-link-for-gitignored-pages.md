---
"blume": patch
---

A page whose file git ignores no longer shows an **Edit on GitHub** link. Generated pages, like a TypeDoc reference written into a gitignored folder under the content root, are never committed, so the link opened a GitHub 404. Blume asks git which page files it ignores with one `git check-ignore` call per build and drops the link from those pages. A file that a `.gitignore` rule matches but git already tracks keeps its link, and outside a git repository every page keeps it, as before.
