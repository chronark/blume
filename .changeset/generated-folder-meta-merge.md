---
"blume": patch
---

A `meta.ts` in an OpenAPI, AsyncAPI, or GraphQL reference's tag folder now changes only the fields it sets. Before, it replaced the group's generated meta entirely, so a `meta.ts` that only renamed a tag group also dropped the group's place in the spec's tag order, and the group moved to the end of the sidebar. The generated title and order now fill in whatever the file leaves out, for `meta.ts` and `meta.$.ts` alike.
