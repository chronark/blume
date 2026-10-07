import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import {
  locateMdxFailure,
  mdxSyntaxCheck,
  mdxSyntaxError,
} from "../src/core/mdx-syntax.ts";
import type { SourceEntry } from "../src/core/sources/types.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** Write `files` under a fresh temp dir and return its path. */
const makeFiles = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-mdx-syntax-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    })
  );
  return root;
};

const RAW_HEAD = "---\ntitle: Page\n---\n";

/** An `.mdx` entry whose file opens with a three-line front matter block. */
const mdxEntry = (
  body: string,
  fields: Partial<SourceEntry> = {}
): SourceEntry => ({
  body: { format: "mdx", text: body },
  data: {},
  raw: `${RAW_HEAD}${body}`,
  ref: "guide/page.mdx",
  sourcePath: "/site/docs/guide/page.mdx",
  ...fields,
});

describe("mdxSyntaxError", () => {
  it("is null for a body that parses", () => {
    expect(mdxSyntaxError("Hello {props.name}\n\n<Card title={x} />\n")).toBe(
      null
    );
  });

  it("reads the position and reason out of Sätteri's message", () => {
    expect(mdxSyntaxError("Some text\n{: .note }\n")).toEqual({
      column: 2,
      line: 2,
      reason: "Could not parse expression with oxc: Unexpected token",
    });
  });
});

describe("mdxSyntaxCheck", () => {
  it("leaves a .md entry alone", () => {
    const entry = mdxEntry("<!-- fine in Markdown -->\n");
    entry.body.format = "md";
    expect(mdxSyntaxCheck(entry, "docs")).toEqual({
      diagnostics: [],
      unparsable: false,
    });
  });

  it("passes a page that parses", () => {
    expect(mdxSyntaxCheck(mdxEntry("Hello.\n"), "docs")).toEqual({
      diagnostics: [],
      unparsable: false,
    });
  });

  it("reports a page's own syntax error at its line in the file", () => {
    const check = mdxSyntaxCheck(
      mdxEntry("Intro.\n\n<!-- a comment -->\n"),
      "docs"
    );
    expect(check.unparsable).toBe(true);
    expect(check.diagnostics).toEqual([
      {
        code: "BLUME_MDX_SYNTAX",
        column: 1,
        file: "/site/docs/guide/page.mdx",
        line: 6,
        message: expect.stringContaining(
          "MDX can't parse this page: Unexpected character `!`"
        ),
        severity: "error",
        suggestion: "Write the comment as `{/* … */}`.",
      },
    ]);
  });

  it("moves a position inside the reason to the file's lines", () => {
    const [diagnostic] = mdxSyntaxCheck(
      mdxEntry('<figure>\n<img src="a.png">\n</figure>\n'),
      "docs"
    ).diagnostics;
    expect(diagnostic?.line).toBe(6);
    expect(diagnostic?.message).toContain(
      "expected corresponding closing tag for `<img>` (5:1)"
    );
    expect(diagnostic?.suggestion).toContain("close every element");
  });

  it("names a source entry with no file by its source and ref", () => {
    const [diagnostic] = mdxSyntaxCheck(
      mdxEntry("<https://example.com>\n", {
        raw: undefined,
        sourcePath: undefined,
      }),
      "cms"
    ).diagnostics;
    expect(diagnostic?.file).toBe("cms:guide/page.mdx");
    expect(diagnostic?.line).toBe(1);
    expect(diagnostic?.suggestion).toBe(
      "Write the link as `[text](https://…)`."
    );
  });

  it("reads the body with the site's variables, as the build does", () => {
    const entry = mdxEntry("Call {{api-url}}.\n\n<include>./x.md</include>\n", {
      expanded: {
        includes: [],
        origins: [],
        text: "Call https://api.example.com.\n",
      },
    });
    expect(
      mdxSyntaxCheck(entry, "docs", { "api-url": "https://api.example.com" })
    ).toEqual({ diagnostics: [], unparsable: false });
    // Undefined, `{{api-url}}` is an expression MDX can't parse.
    expect(mdxSyntaxCheck(entry, "docs").unparsable).toBe(true);
  });

  it("warns in the partial when the page parses but not once includes splice in", () => {
    const partial = "/site/docs/_partials/note.md";
    const check = mdxSyntaxCheck(
      mdxEntry("Intro.\n\n<include>../_partials/note.md</include>\n", {
        expanded: {
          includes: [partial],
          origins: [
            { file: "/site/docs/guide/page.mdx", line: 4 },
            { file: "/site/docs/guide/page.mdx", line: 5 },
            { file: partial, line: 1 },
            { file: partial, line: 2 },
            { file: partial, line: 3 },
          ],
          text: "Intro.\n\nOpen <span>\n\n{1 +}\n",
        },
      }),
      "docs"
    );
    expect(check.unparsable).toBe(false);
    expect(check.diagnostics).toEqual([
      {
        code: "BLUME_MDX_SYNTAX",
        column: 6,
        file: partial,
        line: 1,
        message:
          "MDX can't parse this file once guide/page.mdx includes it: Expected a closing tag for `<span>` (1:6) before the end of `paragraph`.",
        severity: "warning",
        suggestion: expect.stringContaining("close every element"),
      },
    ]);
  });

  it("drops a position inside the reason that points into another file", () => {
    const partial = "/site/docs/_partials/close.md";
    const [diagnostic] = mdxSyntaxCheck(
      mdxEntry("<div>\n\n<include>../_partials/close.md</include>\n</div>\n", {
        expanded: {
          includes: [partial],
          origins: [
            { file: "/site/docs/guide/page.mdx", line: 4 },
            { file: "/site/docs/guide/page.mdx", line: 5 },
            { file: partial, line: 1 },
          ],
          text: "<div>\n\n</span>\n",
        },
      }),
      "docs"
    ).diagnostics;
    expect(diagnostic?.file).toBe(partial);
    expect(diagnostic?.message).toBe(
      "MDX can't parse this file once guide/page.mdx includes it: Unexpected closing tag `</span>`, expected corresponding closing tag for `<div>`."
    );
  });

  it("passes a page whose includes splice in cleanly", () => {
    const entry = mdxEntry("<include>./x.md</include>\n", {
      expanded: { includes: [], origins: [], text: "Plain.\n" },
    });
    expect(mdxSyntaxCheck(entry, "docs").diagnostics).toEqual([]);
  });
});

describe("locateMdxFailure", () => {
  it("finds the expression that reads an undefined name", async () => {
    const root = await makeFiles({
      "docs/page.mdx": `${RAW_HEAD}\nIntro.\n\nHello {user.name}, welcome.\n`,
    });
    const sourcePath = join(root, "docs/page.mdx");
    expect(
      await locateMdxFailure(
        { name: "docs/page.mdx", sourcePath },
        { kind: "undefined-name", name: "user" }
      )
    ).toEqual({
      column: 7,
      expression: "{user.name}",
      file: sourcePath,
      line: 7,
    });
  });

  it("finds it in a partial the page includes, and in a JSX attribute", async () => {
    const root = await makeFiles({
      "docs/_partials/card.mdx":
        "A card.\n\n<Card title={heading} {...rest} />\n",
      "docs/page.mdx": `${RAW_HEAD}\n<include>./_partials/card.mdx</include>\n\nAfter {{who}}.\n`,
    });
    const page = {
      contentRoot: join(root, "docs"),
      name: "docs/page.mdx",
      sourcePath: join(root, "docs/page.mdx"),
    };
    expect(
      await locateMdxFailure(page, { kind: "undefined-name", name: "heading" })
    ).toEqual({
      column: 13,
      expression: "{heading}",
      file: join(root, "docs/_partials/card.mdx"),
      line: 3,
    });
    expect(
      await locateMdxFailure(page, { kind: "undefined-name", name: "rest" })
    ).toMatchObject({ column: 23, expression: "{...rest}", line: 3 });
    expect(
      await locateMdxFailure(page, { kind: "undefined-name", name: "who" })
    ).toMatchObject({ expression: "{{who}}", file: page.sourcePath, line: 7 });
  });

  it("substitutes the site's variables before it looks", async () => {
    const root = await makeFiles({
      "docs/page.mdx": `${RAW_HEAD}\nVersion {{version}}, user {{who}}.\n`,
    });
    const site = await locateMdxFailure(
      {
        name: "docs/page.mdx",
        sourcePath: join(root, "docs/page.mdx"),
        variables: { version: "2.1.0" },
      },
      { kind: "undefined-name", name: "who" }
    );
    // Read from the line as written, not as `{{version}}` filled it in.
    expect(site).toMatchObject({ column: 27, expression: "{{who}}", line: 5 });
  });

  it("places a syntax error in the partial that holds it", async () => {
    const root = await makeFiles({
      "docs/_partials/note.md": "Partial.\n\nSome text\n{: .note }\n",
      "docs/page.mdx": `${RAW_HEAD}\nIntro.\n\n<include>./_partials/note.md</include>\n`,
    });
    const site = await locateMdxFailure(
      {
        contentRoot: join(root, "docs"),
        name: "docs/page.mdx",
        sourcePath: join(root, "docs/page.mdx"),
      },
      { kind: "syntax" }
    );
    expect(site).toMatchObject({
      column: 2,
      file: join(root, "docs/_partials/note.md"),
      line: 4,
    });
    expect(site?.diagnostic).toMatchObject({
      code: "BLUME_MDX_SYNTAX",
      message: expect.stringContaining(
        "once docs/page.mdx includes it: Could not parse expression"
      ),
      severity: "error",
    });
  });

  it("places a syntax error in the page itself without naming it twice", async () => {
    const root = await makeFiles({
      "docs/page.mdx": `${RAW_HEAD}\nIntro {1 +}.\n`,
    });
    const site = await locateMdxFailure(
      { name: "docs/page.mdx", sourcePath: join(root, "docs/page.mdx") },
      { kind: "syntax" }
    );
    expect(site?.line).toBe(5);
    expect(site?.diagnostic?.message).toStartWith("MDX can't parse this page:");
  });

  it("is null when the cause can't be found or the page can't be read", async () => {
    const root = await makeFiles({ "docs/page.mdx": `${RAW_HEAD}\nFine.\n` });
    const page = {
      name: "docs/page.mdx",
      sourcePath: join(root, "docs/page.mdx"),
    };
    expect(await locateMdxFailure(page, { kind: "syntax" })).toBeNull();
    expect(
      await locateMdxFailure(page, { kind: "undefined-name", name: "nope" })
    ).toBeNull();
    expect(
      await locateMdxFailure(
        { ...page, sourcePath: join(root, "docs/missing.mdx") },
        { kind: "syntax" }
      )
    ).toBeNull();
  });

  it("is null for an undefined name when the page doesn't parse", async () => {
    const root = await makeFiles({
      "docs/page.mdx": `${RAW_HEAD}\n<!-- x -->\n\n{who}\n`,
    });
    expect(
      await locateMdxFailure(
        { name: "docs/page.mdx", sourcePath: join(root, "docs/page.mdx") },
        { kind: "undefined-name", name: "who" }
      )
    ).toBeNull();
  });
});
