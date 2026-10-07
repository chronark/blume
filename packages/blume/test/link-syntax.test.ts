import { describe, expect, it } from "bun:test";

import { validateLinks } from "../src/core/links.ts";
import { pageMetaSchema } from "../src/core/schema.ts";
import {
  extractLinks,
  normalizeEntry,
  scanBody,
} from "../src/core/sources/normalize.ts";
import type { ContentGraph, PageLink, PageRecord } from "../src/core/types.ts";

// How `blume validate` reads link syntax: which destinations, definitions,
// and anchors a page's source holds, as the renderer reads them.

const targets = (body: string, format?: "md" | "mdx"): string[] =>
  extractLinks(body, 0, format).map((link) => link.target);

describe("link destinations", () => {
  it("reads an angle-bracketed destination without its brackets", () => {
    // Prettier writes `<…>` for a URL with parentheses or spaces; the target
    // starts one past the `<`.
    const body = [
      'See [x](<https://example.com/foo_(bar)>) and [y](<./a b> "T").',
      "![shot](<./my shot.png>) and [![logo](<./lo go.png>)](/home)",
      "[empty](<>) and [unclosed](<./nope)",
      "[a wrapped",
      "label](<./wrapped (1)>)",
    ].join("\n");
    expect(extractLinks(body)).toStrictEqual([
      { column: 10, line: 1, target: "https://example.com/foo_(bar)" },
      { column: 51, line: 1, target: "./a b" },
      { column: 10, image: true, line: 2, target: "./my shot.png" },
      { column: 55, line: 2, target: "/home" },
      { column: 40, image: true, line: 2, target: "./lo go.png" },
      { column: 9, line: 5, target: "./wrapped (1)" },
    ]);
  });

  it("reads an angle-bracketed URL once, not again as an autolink", () => {
    const body = [
      "[x](<https://a.dev/x>) and <https://a.dev/auto>",
      "[d]: <https://a.dev/d>",
      "[d]: <https://a.dev/duplicate>",
      "[^1]: A footnote with <https://a.dev/f>.",
      "[2]: <./x>(not a definition) <https://a.dev/text>",
    ].join("\n");
    expect(targets(body)).toStrictEqual([
      "https://a.dev/x",
      "https://a.dev/auto",
      "https://a.dev/d",
      "https://a.dev/f",
      "https://a.dev/text",
    ]);
  });

  it("resolves backslash escapes, keeping the written length", () => {
    // `\(` is a literal parenthesis, as the renderer reads it; a backslash
    // before anything but ASCII punctuation is a plain character.
    const body = [
      String.raw`![](image%20\(115\).png) [x](a\b) [y](a\)b)`,
      String.raw`[z]: ./set\_up.md`,
    ].join("\n");
    expect(extractLinks(body)).toStrictEqual([
      {
        column: 5,
        image: true,
        line: 1,
        sourceLength: 19,
        target: "image%20(115).png",
      },
      { column: 30, line: 1, target: String.raw`a\b` },
      { column: 39, line: 1, sourceLength: 4, target: "a)b" },
      { column: 6, line: 2, sourceLength: 12, target: "./set_up.md" },
    ]);
  });
});

describe("link-reference definitions", () => {
  it("skips a definition whose angle-bracketed destination never closes", () => {
    // `<` opens an angle destination; without its `>` there's no definition,
    // so `[1]` stays text and its label is still free.
    const body = [
      "[1]: <src/x.ts - function x(",
      "[2]: <./ok>(trailing)",
      "[1]: ./one",
    ].join("\n");
    expect(extractLinks(body)).toStrictEqual([
      { column: 6, line: 3, target: "./one" },
    ]);
  });

  it("reads only the first definition of a label", () => {
    // Labels match case-insensitively with whitespace collapsed; the
    // renderer uses the first definition, so a later one is never a link.
    const body = [
      "[Docs Home]: /first",
      "[docs   home]: /second",
      "> [DOCS HOME]: /third",
      "[other]: /other",
    ].join("\n");
    expect(targets(body)).toStrictEqual(["/first", "/other"]);
  });
});

describe("code fences inside block quotes", () => {
  it("skips a quoted fence's code", () => {
    const body = [
      "> ```ts",
      "> interface X {",
      ">   [key: string]: string;",
      "> [in](./code)",
      "> ```",
      "> [quoted](./after)",
      "",
      "> ```",
      "> [unclosed](./code)",
      "",
      "[after the quote](./kept)",
    ].join("\n");
    expect(targets(body)).toStrictEqual(["./after", "./kept"]);
  });
});

/** The link targets `normalizeEntry` records for a page in `format`. */
const linksOf = (format: "md" | "mdx", text: string): string[] =>
  (
    normalizeEntry(
      { body: { format, text }, data: {}, ref: `a.${format}` },
      { defaultType: "doc", source: { name: "s", staged: false } }
    ).pages[0]?.links ?? []
  ).map((link) => link.target);

describe("links inside comments", () => {
  const body = [
    "<!-- [x](./html-inline) --> [shown](./after-html)",
    "<!--",
    "[y](./html-block)",
    "-->",
    "{/* [x](./jsx-inline) */} [shown](./after-jsx)",
    "{/*",
    "[y](./jsx-block)",
    "*/}",
    '<!-- <a href="./html-href">x</a> -->',
    "`<!--` [code](./after-code-span) `-->`",
  ].join("\n");

  it("skips an HTML comment's links in .md, where JSX comments are text", () => {
    expect(targets(body, "md")).toStrictEqual([
      "./after-html",
      "./jsx-inline",
      "./after-jsx",
      "./jsx-block",
      "./after-code-span",
    ]);
  });

  it("skips a JSX comment's links in .mdx, which rejects HTML comments", () => {
    expect(targets(body, "mdx")).toStrictEqual([
      "./html-inline",
      "./after-html",
      "./html-block",
      "./after-jsx",
      "./after-code-span",
      "./html-href",
    ]);
  });

  it("follows the page's format through normalizeEntry", () => {
    expect(linksOf("md", "<!-- [x](./nope) -->\n[y](./yes)")).toStrictEqual([
      "./yes",
    ]);
    expect(linksOf("mdx", "{/* [x](./nope) */}\n[y](./yes)")).toStrictEqual([
      "./yes",
    ]);
  });
});

describe("<a name> anchors", () => {
  it("counts an <a name> as a fragment target, like an id", () => {
    const body = [
      '<a name="named"></a>',
      "<a href='#x' name='single'>x</a>",
      '<a id="with-id"></a> <a name=bare></a> <a name={"jsx"} />',
      // `name` is no fragment target on any other element.
      '<input name="field" /> <a data-name="data" /> <area name="area" />',
      '`<a name="code"></a>`',
      '<!-- <a name="commented"></a> -->',
    ].join("\n");
    expect(scanBody(body).anchors).toStrictEqual([
      "named",
      "single",
      "with-id",
      "bare",
      "jsx",
    ]);
  });
});

const makePage = (links: PageLink[]): PageRecord => ({
  anchors: [],
  contentType: "doc",
  format: "md",
  groups: [],
  headings: [],
  id: "a.md",
  links,
  locale: "",
  meta: pageMetaSchema.parse({}),
  navPath: "a.md",
  route: "/a",
  segments: [],
  source: { name: "filesystem", ref: "a.md" },
  sourcePath: "/abs/a.md",
  title: "A",
  translationKey: "/a",
  version: "",
  versionKey: "/a",
});

const validate = (hrefs: string[]) =>
  validateLinks(
    // SAFETY: link validation reads only pages and routes.
    {
      pages: [
        makePage(hrefs.map((target) => ({ column: 1, line: 1, target }))),
      ],
      routes: new Map([["/a", "a.md"]]),
    } as ContentGraph,
    { publicDir: null }
  );

describe("link schemes", () => {
  it("warns on ReadMe's link schemes, which no browser follows", async () => {
    const diagnostics = await validate([
      "doc:getting-started",
      "REF:create-user",
      "page:about",
      "changelog:v2",
      "blog:launch",
    ]);
    expect(diagnostics.map((d) => [d.code, d.severity])).toStrictEqual(
      Array.from({ length: 5 }, () => [
        "BLUME_UNSUPPORTED_LINK_SCHEME",
        "warning",
      ])
    );
    expect(diagnostics[0]?.message).toBe(
      "Link doc:getting-started uses ReadMe's doc: scheme, which browsers can't follow, so it ships as a dead link."
    );
  });

  it("leaves every other scheme alone", async () => {
    expect(
      await validate([
        "mailto:a@b.dev",
        "tel:+15551234",
        "vscode:mcp/install?x",
        "cursor://anysphere.cursor-deeplink/mcp/install",
        "data:image/png;base64,AAAA",
        "docs:not-readme",
      ])
    ).toStrictEqual([]);
  });
});
