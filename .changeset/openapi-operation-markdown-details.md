---
"blume": patch
---

An OpenAPI operation page's Markdown copy (`<route>.md`), `llms-full.txt`, and the MCP server's `get_page` now include the operation's request body and responses. Before, they carried only the endpoint, so the examples a spec records (rswag's, say) and the request bodies a generator infers (Scramble's) never reached agents. The copy lists the request body's media type and top-level properties with its example, every named one included, and each response's status and description with the examples the spec records, plus a sampled example for the first success response that records none. A webhook's body is listed as its payload.
