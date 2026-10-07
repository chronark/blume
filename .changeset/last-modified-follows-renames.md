---
"blume": patch
---

With `lastModified: "git"`, renaming a page without changing its content, like `page.md` to `page.mdx` or a move to another folder under the content root, no longer resets its "Last updated" date to the rename. Blume now follows renames, as `git log --follow` does, and dates the page from the last commit that changed it. It still reads the dates with one `git log` per build. A rename that also edits the file dates the page at that commit.
