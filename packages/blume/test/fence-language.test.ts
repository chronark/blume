import { describe, expect, it } from "bun:test";

import {
  fenceLanguagePlugin,
  isKnownLanguage,
  normalizeFence,
} from "../src/markdown/fence-language.ts";
import {
  blumeMarkdownProcessor,
  blumeMdxProcessor,
  blumeShikiTransformers,
} from "../src/markdown/index.ts";

describe(isKnownLanguage, () => {
  it("knows Shiki's ids, aliases, and plain-text names", () => {
    expect(isKnownLanguage("typescript")).toBe(true);
    expect(isKnownLanguage("ts")).toBe(true);
    expect(isKnownLanguage("console")).toBe(true);
    expect(isKnownLanguage("text")).toBe(true);
    expect(isKnownLanguage("ansi")).toBe(true);
  });

  it("matches ids exactly, as Shiki does", () => {
    expect(isKnownLanguage("JSON")).toBe(false);
    expect(isKnownLanguage("requirements")).toBe(false);
    // An inherited object key is no language.
    expect(isKnownLanguage("constructor")).toBe(false);
  });
});

describe(normalizeFence, () => {
  it("leaves a fence that means what it says alone", () => {
    expect(normalizeFence("ts", null)).toBeNull();
    expect(normalizeFence("ts", "title.ts {2}")).toBeNull();
    expect(normalizeFence(undefined, "file.ts")).toBeNull();
    expect(normalizeFence("", null)).toBeNull();
    // An unknown language keeps its spelling: lowercasing names nothing.
    expect(normalizeFence("MyLang", null)).toBeNull();
    expect(normalizeFence("package-install", null)).toBeNull();
  });

  it("lowercases a capitalized language", () => {
    expect(normalizeFence("JSON", null)).toStrictEqual({
      lang: "json",
      meta: null,
    });
    expect(normalizeFence("Dockerfile", "title.txt")).toStrictEqual({
      lang: "dockerfile",
      meta: "title.txt",
    });
  });

  it("moves a glued line range into the meta", () => {
    expect(normalizeFence("js{2}", null)).toStrictEqual({
      lang: "js",
      meta: "{2}",
    });
    expect(normalizeFence("ts{1,3-5}", "app.ts lineNumbers")).toStrictEqual({
      lang: "ts",
      meta: "{1,3-5} app.ts lineNumbers",
    });
    expect(normalizeFence("JSON{2}", null)).toStrictEqual({
      lang: "json",
      meta: "{2}",
    });
  });

  it("splits only a range that ends the language", () => {
    // A brace that opens the info string (a Pandoc attribute list) or trails
    // more text is no glued range.
    expect(normalizeFence("{.js", 'title="x"}')).toBeNull();
    expect(normalizeFence("js{2}:line-numbers", null)).toBeNull();
  });
});

/** Run the plugin over one fence and collect the properties it writes. */
const runPlugin = (node: { lang?: string | null; meta?: string | null }) => {
  const writes: [string, string | null][] = [];
  fenceLanguagePlugin().code(
    { type: "code", ...node },
    {
      setProperty: (_node, key, value) => {
        writes.push([key, value]);
      },
    }
  );
  return writes;
};

describe(fenceLanguagePlugin, () => {
  it("writes the normalized language and meta", () => {
    expect(runPlugin({ lang: "js{2}", meta: "file.js" })).toStrictEqual([
      ["lang", "js"],
      ["meta", "{2} file.js"],
    ]);
  });

  it("leaves an ordinary fence untouched", () => {
    expect(runPlugin({ lang: "ts", meta: null })).toStrictEqual([]);
  });
});

const SHIKI = {
  shikiConfig: {
    defaultColor: false,
    themes: { dark: "github-dark", light: "github-light" },
    transformers: blumeShikiTransformers({ icons: false }),
  },
};

/** Render a page body with Blume's processor and Shiki transformers. */
const render = async (
  processor: ReturnType<typeof blumeMarkdownProcessor>,
  source: string
): Promise<string> => {
  // SAFETY: the renderer options are Astro's markdown config, of which the
  // test sets only the Shiki slice the code path reads.
  const renderer = await processor.createRenderer(SHIKI as never);
  const { code } = await renderer.render(source);
  return code;
};

describe("normalized fences through the processors", () => {
  for (const [name, processor] of [
    ["md", blumeMarkdownProcessor({})],
    ["mdx", blumeMdxProcessor({})],
  ] as const) {
    it(`highlights a capitalized language in .${name}`, async () => {
      const html = await render(processor, '```JSON\n{"a": 1}\n```');
      expect(html).toContain('data-language="json"');
      expect(html).not.toContain('data-language="plaintext"');
    });

    it(`highlights the lines a glued range names in .${name}`, async () => {
      const html = await render(
        processor,
        "```js{2} app.js\nconst a = 1;\nconst b = 2;\n```"
      );
      expect(html).toContain('data-language="js"');
      expect(html).toContain('data-title="app.js"');
      expect(html.match(/class="line highlighted"/gu)).toHaveLength(1);
    });
  }
});
