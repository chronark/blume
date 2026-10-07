---
"blume": patch
---

Code fence languages are no longer case-sensitive: ` ```JSON ` and ` ```Dockerfile ` highlight like ` ```json ` and ` ```dockerfile `, where before they fell back to plain text with only a console line. A line range written against the language, like ` ```js{2} ` (the VitePress and VuePress spelling), now highlights its lines and keeps the language, instead of the whole block falling back to plain text.
