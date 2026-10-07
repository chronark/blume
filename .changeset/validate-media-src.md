---
"blume": patch
---

`blume validate` now checks the `src` of `<img>`, `<source>`, `<video>`, and `<audio>` elements, in raw HTML in `.md` pages and as elements in `.mdx` pages. Before, a broken `src` passed `validate --strict` and 404'd on the built site. A `src` ships exactly as written, so it's checked where the browser requests it: `./diagram.png` on `/guides/setup` must be served at `/guides/diagram.png`, from `public/`. A relative `src` that names a file beside the page is reported too, since nothing publishes that file; the `BLUME_BROKEN_ASSET` warning suggests Markdown image syntax (`![alt](./diagram.png)`), which does, or a `public/` path.
