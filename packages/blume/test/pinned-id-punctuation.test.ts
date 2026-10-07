import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { join } from "pathe";

import { validateLinks } from "../src/core/links.ts";
import { escapePinnedIds } from "../src/core/pinned-ids.ts";
import { normalizeEntry, scanBody } from "../src/core/sources/normalize.ts";
import type { ContentGraph } from "../src/core/types.ts";
import {
  blumeMarkdownProcessor,
  blumeMdxProcessor,
} from "../src/markdown/index.ts";
import { renderMd, renderMdx } from "./mdx-render.ts";
import type { Rendered } from "./mdx-render.ts";

/**
 * A pinned heading id is used verbatim: smart punctuation, which rewrites the
 * heading's prose, must not turn `[#a--b]` into `a–b` (nor `---`, `...`, or
 * quotes in an id into their typographic forms).
 */

const slugs = (rendered: Rendered): string[] =>
  rendered.headings.map((heading) => heading.slug);

const scannedSlugs = (source: string): string[] =>
  scanBody(source).headings.map((heading) => heading.slug);

const PINS = [
  "## Dashes -- here [#a--b]",
  "## Em dash [#a---b]",
  "## Ellipsis [#wait...what]",
  `## Quotes [#it's-"quoted"]`,
  "## Hidden [!toc] [#c--d]",
  "## Typed [#a–b]",
].join("\n\n");
const PINNED = ["a--b", "a---b", "wait...what", `it's-"quoted"`, "c--d", "a–b"];

describe("a pinned id with punctuation smart punctuation rewrites", () => {
  it("renders as written in .md and .mdx", async () => {
    const md = await renderMd(PINS);
    expect(slugs(md)).toStrictEqual(PINNED);
    // The heading's own text is still smart-punctuated.
    expect(md.code).toContain(
      '<h2 id="a--b"><a class="blume-heading-anchor" href="#a--b">Dashes – here</a></h2>'
    );
    expect(slugs(await renderMdx(PINS))).toStrictEqual(PINNED);
  });

  it("renders as written in the {#id} form, escaped in .mdx", async () => {
    expect(slugs(await renderMd("## A {#a--b}"))).toStrictEqual(["a--b"]);
    expect(slugs(await renderMdx("## A \\{#a--b\\}"))).toStrictEqual(["a--b"]);
  });

  it("is the id the scan indexes", () => {
    expect(scannedSlugs(PINS)).toStrictEqual(PINNED);
    expect(scannedSlugs("## A \\{#a--b\\}\n\nTitle\n---")).toStrictEqual([
      "a--b",
      "title",
    ]);
  });

  it("is an anchor a link can name", async () => {
    const [page] = normalizeEntry(
      {
        body: { format: "md", text: `${PINS}\n\nSee [it](#a--b).\n` },
        data: {},
        ref: "guide.md",
      },
      { defaultType: "doc", source: { name: "s", staged: false } }
    ).pages;
    if (!page) {
      throw new Error("expected a page");
    }
    const graph = {
      diagnostics: [],
      navigation: { featured: [], selectors: [], sidebar: [], tabs: [] },
      navigationByLocale: {},
      navigationByVersion: {},
      pages: [page],
      routes: new Map([[page.route, page.id]]),
    };
    // SAFETY: link validation reads only pages and routes; the empty nav
    // shells stand in for the graph fields it never touches.
    const diagnostics = await validateLinks(graph as ContentGraph, {
      publicDir: null,
    });
    expect(diagnostics).toStrictEqual([]);
  });
});

describe("a pinned heading in an included partial", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { force: true, recursive: true }))
    );
  });

  it("renders its id as written in .md and .mdx pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-pinned-ids-"));
    dirs.push(root);
    await writeFile(join(root, "_part.md"), "## Part -- x [#p--q]\n\nText.\n");
    const page = "Intro.\n\n<include>./_part.md</include>\n";

    const md = await blumeMarkdownProcessor({ contentRoot: root })
      .createRenderer({})
      .then((renderer) =>
        renderer.render(page, { fileURL: pathToFileURL(join(root, "p.md")) })
      );
    expect(md.code).toContain(
      '<h2 id="p--q"><a class="blume-heading-anchor" href="#p--q">Part – x</a></h2>'
    );

    const processor = blumeMdxProcessor({ contentRoot: root });
    if (!processor.createMdxRenderer) {
      throw new Error("The satteri processor has no MDX renderer.");
    }
    const mdx = await processor.createMdxRenderer({}, { optimize: false });
    const { code } = await mdx.process(page, join(root, "p.mdx"), {});
    expect(code).toContain('id: "p--q"');
  });
});

describe(escapePinnedIds, () => {
  it("escapes the punctuation in a heading's trailing markers only", () => {
    expect(
      escapePinnedIds(`## A -- "b" [#a--b...c'd"e"] [toc]`, "markdown")
    ).toBe(`## A -- "b" [#a\\-\\-b\\.\\.\\.c\\'d\\"e\\"] [toc]`);
    // An escape already written stays one.
    expect(escapePinnedIds("## A \\{#a\\--b\\}", "mdx")).toBe(
      "## A \\{#a\\-\\-b\\}"
    );
  });

  it("leaves a source with no punctuated pin as is", () => {
    for (const source of ["## A -- b [#a-b]", "## A [#a–b]", "Plain -- text"]) {
      expect(escapePinnedIds(source, "markdown")).toBe(source);
    }
  });

  it("leaves what the renderer reads as no pin", () => {
    for (const source of [
      // Not a heading.
      "Text [#a--b]",
      // Markers alone stay the heading's literal text.
      "## [#a--b]",
      // A heading ending in code has no marker position.
      "## A [#a--b] `code`",
      // A defined label makes the bracket a link.
      "## A [#a--b]\n\n[#a--b]: /x",
      // An id spelled with a character reference is left to the parse.
      "## A [#a--b&#93;",
      // A pin with nothing to escape, beside one in prose.
      "## A [#plain]\n\nText [#a--b]",
    ]) {
      expect(escapePinnedIds(source, "markdown")).toBe(source);
    }
  });

  it("leaves a source MDX can't parse to its render", () => {
    const source = "## A [#a--b]\n\n<div";
    expect(escapePinnedIds(source, "mdx")).toBe(source);
  });
});
