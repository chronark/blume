---
"blume": patch
---

An API reference operation's URL now only has to be unique within its tag. Before, an operation whose slug another tag's operation already used got its method added to the URL, so a `list` operation under a second tag lived at `/reference/stores/list-get`; it now lives at `/reference/stores/list`. Two operations with the same slug in one tag still get the method added to the second. The old URLs keep working: Blume redirects each one (and its `.md` and `.mdx` copies) to the new one with a 301, unless a page or a redirect you configured is already at that URL. `<Operation id>` values don't change. In a `graphql()` reference, a type page whose name matches a root field moves the same way (`/graphql/objects/pet-object` to `/graphql/objects/pet`).
