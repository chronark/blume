---
"blume": patch
---

A `vercel()` server build that fails its function-bundle check now removes `.vercel/output/config.json`. The adapter had already written that file, but Blume's pattern redirects, `Accept: text/markdown` routes, and base routes were never added. The output looked deployable, and `vercel deploy --prebuilt` would have shipped it without them. The same happens when the build can't move the routes under `deployment.base`. The function bundles stay in place so you can inspect them.
