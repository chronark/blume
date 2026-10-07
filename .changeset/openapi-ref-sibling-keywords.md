---
"blume": patch
---

A property written as a `$ref` with keywords beside it, which OpenAPI 3.1 allows and ASP.NET Core writes for every enum-typed property, now shows its own `description` instead of the referenced schema's. An `example`, `examples`, or `default` beside a `$ref` is now used in request samples, the Try it prefill, and response examples, where the referenced schema's value used to win.
