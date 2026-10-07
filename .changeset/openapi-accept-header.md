---
"blume": patch
---

Try it and the generated code samples in an OpenAPI reference now send an `Accept` header naming the first JSON media type among the operation's responses (a success response's first). Before, they sent none, and frameworks like Laravel treat such a request as a browser's: on a stock Laravel API, sending a request without a token returned a 500 ("Route [login] not defined.") instead of the documented 401. An `Accept` header parameter the operation declares still takes precedence.
