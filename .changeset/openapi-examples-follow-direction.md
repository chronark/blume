---
"blume": patch
---

Request samples and the Try it prefill in an OpenAPI reference now leave out `readOnly` properties wherever the example comes from. A model-level `example`, which TypeSpec writes, was copied as written, so every request sample sent the model's server-generated `id`. Response examples likewise leave out `writeOnly` properties. The Try it form no longer lists `readOnly` fields either, matching the request body's schema table, which already hid them.
