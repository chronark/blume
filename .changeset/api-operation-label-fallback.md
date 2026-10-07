---
"blume": patch
---

An API reference operation without a `summary` is now labeled in the sidebar by its method and path (`GET /pets`), as its page is already titled. Before, the label was the path alone, so `GET /pets` and `POST /pets` shared one, and an unedited spec failed `blume validate --strict` with `BLUME_NAV_DUPLICATE_LABEL`. AsyncAPI operations without a title or summary get their action and channel (`SEND user/signup`) the same way.
