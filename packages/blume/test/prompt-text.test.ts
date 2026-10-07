import { describe, expect, it } from "bun:test";

import { mdxToJs } from "satteri";
import type { MdastPluginDefinition } from "satteri";

import { MDX_FEATURES } from "../src/markdown/features.ts";
import { blumeMdxProcessor } from "../src/markdown/index.ts";
import {
  promptTextPlugin,
  restorePunctuation,
} from "../src/markdown/prompt-text.ts";

describe(restorePunctuation, () => {
  it("puts back the ASCII smart punctuation was made from", () => {
    expect(
      restorePunctuation(
        "Use lang=“ts” – it’s ‘done’… — ok",
        `Use lang="ts" -- it's 'done'... --- ok`
      )
    ).toBe(`Use lang="ts" -- it's 'done'... --- ok`);
  });

  it("keeps a mark the author typed", () => {
    // A typed curly quote keeps its group as is; the dash still goes back.
    expect(restorePunctuation("“a” – b", "“a” -- b")).toBe("“a” -- b");
    expect(restorePunctuation("it’s — x", "it’s — x")).toBe("it’s — x");
  });

  it("leaves text with an entity alone", () => {
    expect(restorePunctuation("“a” ’", '"a" &rsquo;')).toBe("“a” ’");
  });

  it("leaves text without marks alone", () => {
    expect(restorePunctuation("plain", "plain")).toBe("plain");
  });
});

/** A node of the plugin's tree, with offsets into `source`. */
type TestNode = Parameters<
  ReturnType<typeof promptTextPlugin>["mdxJsxFlowElement"]
>[0];

const at = (start: number, end: number) => ({
  end: { offset: end },
  start: { offset: start },
});

describe(promptTextPlugin, () => {
  const source = `<Prompt>Say "hi"</Prompt> "x"`;
  const run = (node: TestNode): [string | undefined, string][] => {
    const writes: [string | undefined, string][] = [];
    const visitor = promptTextPlugin();
    const ctx = {
      setProperty: (target: TestNode, _key: "value", value: string) => {
        writes.push([target.value, value]);
      },
      source,
    };
    visitor[
      node.type === "mdxJsxFlowElement"
        ? "mdxJsxFlowElement"
        : "mdxJsxTextElement"
    ](node, ctx);
    return writes;
  };

  it("restores the text under a Prompt, nested or not", () => {
    expect(
      run({
        children: [
          { position: at(8, 16), type: "text", value: "Say “hi”" },
          {
            children: [
              { position: at(8, 16), type: "text", value: "Say “hi”" },
            ],
            type: "strong",
          },
          // Without a position there's no source to compare against.
          { type: "text", value: "Say “hi”" },
          { position: at(8, 16), type: "inlineCode", value: "x" },
        ],
        name: "Prompt",
        type: "mdxJsxFlowElement",
      })
    ).toStrictEqual([
      ["Say “hi”", 'Say "hi"'],
      ["Say “hi”", 'Say "hi"'],
    ]);
  });

  it("leaves text that's already as typed, and other components, alone", () => {
    expect(
      run({
        children: [{ position: at(8, 16), type: "text", value: 'Say "hi"' }],
        name: "Prompt",
        type: "mdxJsxTextElement",
      })
    ).toStrictEqual([]);
    expect(
      run({
        children: [{ position: at(26, 29), type: "text", value: "“x”" }],
        name: "Card",
        type: "mdxJsxFlowElement",
      })
    ).toStrictEqual([]);
  });
});

// SAFETY: the same visitor-protocol bridge `markdown/index.ts` applies — the
// plugin's minimal node/context shapes narrow Satteri's own.
const asMdastPlugin = (plugin: { name: string }): MdastPluginDefinition =>
  plugin as MdastPluginDefinition;

describe("Prompt bodies compiled as MDX", () => {
  it("keeps the body's straight quotes and dashes, and curls prose elsewhere", async () => {
    // Smart punctuation on, as Astro's `smartypants` default compiles pages.
    const { code } = await mdxToJs(
      [
        'Prose says "hi" -- here.',
        "",
        '<Prompt description="Copy">',
        '  Use lang="ts" -- it\'s done...',
        "",
        "  - run `x` with --force",
        "</Prompt>",
      ].join("\n"),
      {
        features: { ...MDX_FEATURES, smartPunctuation: true },
        jsx: true,
        mdastPlugins: [asMdastPlugin(promptTextPlugin())],
      }
    );
    expect(code).toContain("“hi” – here");
    // The JSX string escapes the quotes it now holds straight.
    expect(code).toContain(String.raw`Use lang=\"ts\" -- it's done...`);
    expect(code).toContain("with --force");
  });

  it("is one of the MDX processor's plugins", () => {
    // `satteri()` keeps its options for Astro's MDX integration to compile with.
    const processor = blumeMdxProcessor({});
    expect(JSON.stringify(processor)).toContain("blume-prompt-text");
  });
});
