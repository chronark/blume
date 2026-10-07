import { describe, expect, it } from "bun:test";

import { codeFenceDiagnostics } from "../src/core/code-fence-diagnostics.ts";
import type { SourceEntry } from "../src/core/sources/types.ts";

/** A page entry with this body, `.mdx` unless the format says otherwise. */
const entry = (text: string, over: Partial<SourceEntry> = {}): SourceEntry => ({
  body: { format: "mdx", text },
  data: {},
  ref: "guide.mdx",
  sourcePath: "/docs/guide.mdx",
  ...over,
});

const codes = (text: string, format: "md" | "mdx" = "mdx"): string[] =>
  codeFenceDiagnostics(entry(text, { body: { format, text } }), "docs").map(
    (diagnostic) => diagnostic.code
  );

describe(codeFenceDiagnostics, () => {
  it("warns about a language Shiki doesn't know, at its fence's line", () => {
    const diagnostics = codeFenceDiagnostics(
      entry("Intro.\n\n```requirements\nastro\n```\n", {
        raw: "---\ntitle: Guide\n---\nIntro.\n\n```requirements\nastro\n```\n",
      }),
      "docs"
    );
    expect(diagnostics).toStrictEqual([
      {
        code: "BLUME_UNKNOWN_CODE_LANGUAGE",
        file: "/docs/guide.mdx",
        // Line 3 of the body, below a three-line front matter block.
        line: 6,
        message:
          "`requirements` isn't a language Blume can highlight, so the code block renders as plain text.",
        severity: "warning",
        suggestion:
          'Use a Shiki language id or alias (https://shiki.style/languages), or `text` for plain text. Options like a title go after the language, as in `text title="notes.txt"`.',
      },
    ]);
  });

  it("stays quiet about languages that render as written", () => {
    expect(
      codes(
        [
          "```ts\nx\n```",
          "```text\nx\n```",
          "```\nno language\n```",
          "```math\nx\n```",
          "```package-install\nnpm i blume\n```",
          // Normalized spellings render, so they don't warn either.
          "```JSON\n{}\n```",
          "```js{2}\nx\n```",
        ].join("\n\n")
      )
    ).toStrictEqual([]);
  });

  it("checks plain Markdown pages too", () => {
    expect(codes("```Pycon\n>>> 1\n```\n", "md")).toStrictEqual([
      "BLUME_UNKNOWN_CODE_LANGUAGE",
    ]);
  });

  it("ignores a fence shown inside another code block", () => {
    expect(codes("````md\n```requirements\nx\n```\n````\n")).toStrictEqual([]);
  });

  it("gives the Blume spelling of MkDocs line options", () => {
    const diagnostics = codeFenceDiagnostics(
      entry('```py hl_lines="2 4-5" linenums="1"\nx\n```\n'),
      "docs"
    );
    expect(
      diagnostics.map(({ message, suggestion }) => ({ message, suggestion }))
    ).toStrictEqual([
      {
        message:
          '`hl_lines="2 4-5"` isn\'t a Blume code block option, so the block highlights no lines.',
        suggestion:
          "Put the lines in braces after the language instead: `{2,4-5}`.",
      },
      {
        message:
          '`linenums="1"` isn\'t a Blume code block option, so the block shows no line numbers.',
        suggestion: "Write `lineNumbers` after the language instead.",
      },
    ]);
  });

  it("says when a line-number start can't carry over", () => {
    const [diagnostic] = codeFenceDiagnostics(
      entry("```py linenums='5'\nx\n```\n"),
      "docs"
    );
    expect(diagnostic?.suggestion).toBe(
      "Write `lineNumbers` after the language instead. Blume numbers every block from 1."
    );
  });

  it("names a foreign keyword that became the block's title", () => {
    const diagnostics = codeFenceDiagnostics(
      entry(
        '```js wordWrap\nx\n```\n\n```jsx title="a.jsx" showLineNumbers{3}\nx\n```\n'
      ),
      "docs"
    );
    expect(
      diagnostics.map(({ line, message, suggestion }) => ({
        line,
        message,
        suggestion,
      }))
    ).toStrictEqual([
      {
        line: 1,
        message:
          "`wordWrap` isn't a Blume code block option, so the block doesn't wrap its long lines, and the word shows in its title.",
        suggestion: "Write `wrap` after the language instead.",
      },
      {
        // An explicit title wins, so the keyword shows nowhere.
        line: 5,
        message:
          "`showLineNumbers{3}` isn't a Blume code block option, so the block shows no line numbers.",
        suggestion: "Write `lineNumbers` after the language instead.",
      },
    ]);
  });

  it("gives the title spelling for a filename option", () => {
    const [diagnostic] = codeFenceDiagnostics(
      entry('```js filename="app.js"\nx\n```\n'),
      "docs"
    );
    expect(diagnostic?.suggestion).toBe('Write `title="app.js"` instead.');
  });

  it("reports an option written where the language goes", () => {
    // MkDocs allows options with no language; Blume reads the first as one.
    expect(codes('```hl_lines="2"\nx\n```\n')).toStrictEqual([
      "BLUME_UNKNOWN_CODE_LANGUAGE",
      "BLUME_CODE_FENCE_OPTION",
    ]);
  });

  it("points at the partial a fence was included from", () => {
    const [diagnostic] = codeFenceDiagnostics(
      entry("<include>./part.mdx</include>\n", {
        expanded: {
          includes: ["/docs/part.mdx"],
          origins: [{ file: "/docs/part.mdx", line: 7 }],
          text: "```zen\nx\n```\n",
        },
      }),
      "docs"
    );
    expect(diagnostic).toMatchObject({
      code: "BLUME_UNKNOWN_CODE_LANGUAGE",
      file: "/docs/part.mdx",
      line: 7,
    });
  });

  it("names a remote entry by its source and ref", () => {
    const [diagnostic] = codeFenceDiagnostics(
      entry("```zen\nx\n```\n", { bodyLineOffset: 2, sourcePath: undefined }),
      "notion"
    );
    expect(diagnostic).toMatchObject({ file: "notion:guide.mdx", line: 3 });
  });

  it("skips a body MDX can't parse", () => {
    expect(codes("```zen\nx\n```\n\n<Broken\n")).toStrictEqual([]);
  });
});
