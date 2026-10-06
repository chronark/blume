import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { directiveDiagnostics } from "../src/core/directive-diagnostics.ts";
import { scanProject } from "../src/core/project-graph.ts";
import type { SourceEntry } from "../src/core/sources/types.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** An `.mdx` entry with this body (and, optionally, the raw file it came from). */
const entry = (text: string, over: Partial<SourceEntry> = {}): SourceEntry => ({
  body: { format: "mdx", text },
  data: {},
  ref: "guide.mdx",
  sourcePath: "/docs/guide.mdx",
  ...over,
});

describe(directiveDiagnostics, () => {
  it("warns about a container that isn't a callout, naming the callout types", () => {
    const diagnostics = directiveDiagnostics(
      entry("Intro.\n\n:::details\nBody.\n:::\n", {
        raw: "---\ntitle: Guide\n---\nIntro.\n\n:::details\nBody.\n:::\n",
      }),
      "docs"
    );
    expect(diagnostics).toStrictEqual([
      {
        code: "BLUME_UNKNOWN_DIRECTIVE",
        file: "/docs/guide.mdx",
        // Line 3 of the body, below a three-line front matter block.
        line: 6,
        message:
          "`:::details` isn't a callout type, so the page shows its `:::` lines as written around its content.",
        severity: "warning",
        suggestion:
          "Use a callout type — `danger`, `info`, `note`, `success`, `tip`, `warning` (or the aliases `caution`, `error`, `important`, `warn`) — or remove the `:::` lines to keep the content as plain prose.",
      },
    ]);
  });

  it("finds a misspelled callout nested in a real one", () => {
    const [diagnostic] = directiveDiagnostics(
      entry("::::note\n:::warnig\nCareful.\n:::\n::::\n", {
        bodyLineOffset: 10,
      }),
      "docs"
    );
    expect(diagnostic?.message).toStartWith("`:::warnig`");
    expect(diagnostic?.line).toBe(12);
  });

  it("points at the partial a container was included from", () => {
    const [diagnostic] = directiveDiagnostics(
      entry("<include>./part.mdx</include>\n", {
        expanded: {
          includes: ["/docs/part.mdx"],
          origins: [
            { file: "/docs/part.mdx", line: 4 },
            { file: "/docs/part.mdx", line: 5 },
          ],
          text: ":::aside\nFrom the partial.\n:::\n",
        },
      }),
      "docs"
    );
    expect(diagnostic).toMatchObject({
      file: "/docs/part.mdx",
      line: 4,
    });
  });

  it("names a remote entry by its source and ref", () => {
    const [diagnostic] = directiveDiagnostics(
      entry(":::details\nBody.\n:::\n", { sourcePath: undefined }),
      "cms"
    );
    expect(diagnostic?.file).toBe("cms:guide.mdx");
  });

  it("stays quiet for callouts, code, `.md`, and a body MDX can't parse", () => {
    const quiet = [
      entry(":::note\nA callout.\n:::\n\n:::caution[Alias]\nToo.\n:::\n"),
      entry("```md\n:::details\nAn example.\n:::\n```\n"),
      entry(":::details\n<!-- not MDX -->\n:::\n"),
      entry(":::details\nMarkdown has no directives.\n:::\n", {
        body: { format: "md", text: ":::details\nBody.\n:::\n" },
      }),
    ];
    for (const item of quiet) {
      expect(directiveDiagnostics(item, "docs")).toStrictEqual([]);
    }
  });
});

/** The codes, lines, and messages a body's diagnostics carry. */
const summarize = (text: string) =>
  directiveDiagnostics(entry(text, { bodyLineOffset: 0 }), "docs").map(
    ({ code, line, message }) => ({ code, line, message })
  );

describe("a closing fence with text after it", () => {
  it("warns that the text is dropped, with the longer fence that keeps it", () => {
    const diagnostics = directiveDiagnostics(
      entry(":::warning\nSome text.\n::: card\nMore text.\n:::\n", {
        raw: "---\ntitle: Guide\n---\n:::warning\nSome text.\n::: card\nMore text.\n:::\n",
      }),
      "docs"
    );
    expect(diagnostics).toStrictEqual([
      {
        code: "BLUME_DIRECTIVE_CLOSING_TEXT",
        file: "/docs/guide.mdx",
        // Line 3 of the body, below a three-line front matter block.
        line: 6,
        message:
          "`::: card` closes the `:::warning` container above it, so `card` never reaches the page.",
        severity: "warning",
        suggestion:
          "Give the container a longer fence than this line's — `::::warning`, closed by `::::` — to keep the line inside it as text, or remove `card` from the line.",
      },
    ]);
  });

  it("sizes the suggested fence past a longer closing line", () => {
    const [diagnostic] = directiveDiagnostics(
      entry(":::tip\nA.\n:::: card\n"),
      "docs"
    );
    expect(diagnostic?.suggestion).toStartWith(
      "Give the container a longer fence than this line's — `:::::tip`, closed by `:::::`"
    );
  });

  it("finds the line in a quote, a list, and after unspaced text", () => {
    expect(summarize("> :::note\n> A.\n> ::: card\n> B.\n> :::\n")).toEqual([
      expect.objectContaining({ line: 3 }),
    ]);
    expect(summarize("- Item.\n\n  :::note\n  A.\n  ::: card\n")).toEqual([
      expect.objectContaining({ line: 5 }),
    ]);
    expect(summarize(":::note\nA.\n:::{.wide}\n")).toStrictEqual([
      {
        code: "BLUME_DIRECTIVE_CLOSING_TEXT",
        line: 3,
        message:
          "`:::{.wide}` closes the `:::note` container above it, so `{.wide}` never reaches the page.",
      },
    ]);
  });

  it("reports a line that closes nested containers once, for the innermost", () => {
    expect(summarize(":::warning\n:::note\nA.\n::: card\n")).toStrictEqual([
      {
        code: "BLUME_DIRECTIVE_CLOSING_TEXT",
        line: 4,
        message:
          "`::: card` closes the `:::note` container above it, so `card` never reaches the page.",
      },
    ]);
  });

  it("lists every finding in source order", () => {
    expect(
      summarize("::::note\n:::details\nA.\n:::\n:::: end\n").map(
        ({ code, line }) => ({ code, line })
      )
    ).toStrictEqual([
      { code: "BLUME_UNKNOWN_DIRECTIVE", line: 2 },
      { code: "BLUME_DIRECTIVE_CLOSING_TEXT", line: 5 },
    ]);
  });

  it("points at the partial the closing line was included from", () => {
    const [diagnostic] = directiveDiagnostics(
      entry("<include>./part.mdx</include>\n", {
        expanded: {
          includes: ["/docs/part.mdx"],
          origins: [
            { file: "/docs/part.mdx", line: 1 },
            { file: "/docs/part.mdx", line: 2 },
            { file: "/docs/part.mdx", line: 3 },
          ],
          text: ":::note\nFrom the partial.\n::: end\n",
        },
      }),
      "docs"
    );
    expect(diagnostic).toMatchObject({
      code: "BLUME_DIRECTIVE_CLOSING_TEXT",
      file: "/docs/part.mdx",
      line: 3,
    });
  });

  it("stays quiet for a bare fence, a longer outer fence, an unclosed container, and code", () => {
    const quiet = [
      ":::note\nA.\n:::  \n",
      "::::warning\nOuter.\n::: card\nInner.\n::::\n",
      ":::note\nNever closed.\n",
      ":::note\n:::tip\n",
      ":::note\n",
      ":::note\n```md\n::: card\n```\n:::\n",
    ];
    for (const text of quiet) {
      expect(summarize(text)).toStrictEqual([]);
    }
  });
});

describe("a spaced callout opener", () => {
  it("warns that the line is text, with the unspaced spelling", () => {
    expect(
      directiveDiagnostics(
        entry("Intro.\n\n::: tip\nA tip.\n:::\n", { bodyLineOffset: 4 }),
        "docs"
      )
    ).toStrictEqual([
      {
        code: "BLUME_DIRECTIVE_SPACED_NAME",
        file: "/docs/guide.mdx",
        line: 7,
        message:
          "`::: tip` has a space between its colons and its name, so it isn't a callout and the page shows it as text.",
        severity: "warning",
        suggestion: "Remove the space: `:::tip`.",
      },
    ]);
  });

  it("moves a title after the name into brackets", () => {
    const [diagnostic] = directiveDiagnostics(
      entry("::: warning Heads up\nCareful.\n:::\n"),
      "docs"
    );
    expect(diagnostic?.suggestion).toBe(
      "Remove the space and put the title in brackets: `:::warning[Heads up]`."
    );
  });

  it("finds aliases, quoted lines, and lines mid-paragraph", () => {
    expect(
      summarize("::: caution\nA.\n:::\n\n> ::: note\n> B.\n\nText.\n:::: tip\n")
    ).toEqual([
      expect.objectContaining({ line: 1 }),
      expect.objectContaining({ line: 5 }),
      expect.objectContaining({ line: 9 }),
    ]);
  });

  it("stays quiet for other names, code, and a fence with no name", () => {
    const quiet = [
      "::: details Click me\nHidden.\n:::\n",
      "```md\n::: tip\nAn example.\n:::\n```\n",
      "Write `::: tip` with no space.\n",
      "| Syntax |\n| - |\n| ::: tip |\n",
      ":::\nBare.\n:::\n",
    ];
    for (const text of quiet) {
      expect(summarize(text)).toStrictEqual([]);
    }
  });
});

describe("the project scan", () => {
  it("reports an unknown container with the page's other diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-directive-scan-"));
    dirs.push(root);
    const file = join(root, "docs", "guide.mdx");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      "---\ntitle: Guide\n---\n\n:::details[More]\nHidden no longer.\n:::\n"
    );
    const project = await scanProject(root);
    const found = project.diagnostics.filter(
      (diagnostic) => diagnostic.code === "BLUME_UNKNOWN_DIRECTIVE"
    );
    expect(found).toMatchObject([{ file, line: 5, severity: "warning" }]);
  });

  it("reports a closing fence that drops its text", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-directive-scan-"));
    dirs.push(root);
    const file = join(root, "docs", "guide.mdx");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      "---\ntitle: Guide\n---\n\n:::warning\nSome text.\n::: card\nMore text.\n:::\n"
    );
    const project = await scanProject(root);
    const found = project.diagnostics.filter(
      (diagnostic) => diagnostic.code === "BLUME_DIRECTIVE_CLOSING_TEXT"
    );
    expect(found).toMatchObject([{ file, line: 7, severity: "warning" }]);
  });
});
