---
"blume": patch
---

`openapi()` and `graphql()` now warn about `codeSamples` ids Blume doesn't generate a sample for, instead of leaving them out of every operation page without a sign. `BLUME_OPENAPI_UNKNOWN_CODE_SAMPLE` (`BLUME_GRAPHQL_UNKNOWN_CODE_SAMPLE` for GraphQL) names the ids and lists the ones Blume accepts. ReadMe's `cplusplus` is now accepted as an alias for `cpp`. Its `objectivec` has no generated sample, so it warns.
