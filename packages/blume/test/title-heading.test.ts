import { describe, expect, it } from "bun:test";

import { mdxToJs } from "satteri";

import { MDX_BODY_FEATURES } from "../src/markdown/features.ts";
import { headingAnchorPlugin } from "../src/markdown/heading-anchors.ts";
import { blumeMarkdownProcessor } from "../src/markdown/index.ts";
import {
  TITLE_ID_KEY,
  titleHeadingPlugin,
} from "../src/markdown/title-heading.ts";
import type { TitleHeadingPlugin } from "../src/markdown/title-heading.ts";

/** A `.md` page's HTML, rendered with this front matter. */
const renderMarkdown = async (
  source: string,
  frontmatter: Record<string, string> = {}
): Promise<string> => {
  const renderer = await blumeMarkdownProcessor({}).createRenderer({});
  const { code } = await renderer.render(source, { frontmatter });
  return code;
};

/** The `<h1>` texts an `.mdx` page compiles to, as Astro's MDX compile runs it. */
const mdxHeadings = async (
  source: string,
  frontmatter: Record<string, string> = {}
): Promise<string[]> => {
  const { code } = await mdxToJs(source, {
    data: {
      astro: {
        frontmatter,
        headings: [],
        localImagePaths: new Set(),
        remoteImagePaths: new Set(),
      },
    },
    features: MDX_BODY_FEATURES,
    // SAFETY: Blume's plugins are typed structurally (see `markdown/index.ts`);
    // Satteri drives them through the same visitor protocol.
    hastPlugins: [headingAnchorPlugin(), titleHeadingPlugin()] as NonNullable<
      Parameters<typeof mdxToJs>[1]
    >["hastPlugins"],
  });
  return [
    ...code.matchAll(
      /_components\.h1, \{\s*(?:id: "[^"]*",\s*)?children: "(?<text>[^"]*)"/gu
    ),
  ].map((match) => match.groups?.text ?? "");
};

describe("titleHeadingPlugin", () => {
  it("drops the heading an untitled .md page opens with, its title", async () => {
    const html = await renderMarkdown("# Setup\n\nText.\n\n## Setup\n");
    expect(html).not.toContain("<h1");
    // The next heading keeps the id the scan gave it.
    expect(html).toContain('<h2 id="setup-1">');
  });

  it("looks past a comment before the heading", async () => {
    expect(
      await renderMarkdown("<!-- draft -->\n\n# Setup\n\nText.\n")
    ).not.toContain("<h1");
  });

  it("keeps the heading of a titled page, a later heading, and a raw <h1>", async () => {
    const kept = [
      await renderMarkdown("# Setup\n", { title: "Install" }),
      await renderMarkdown("Intro.\n\n# Setup\n"),
      await renderMarkdown('<h1 align="center">Logo</h1>\n\n# Setup\n'),
      await renderMarkdown("# Setup\n", { mode: "custom" }),
    ];
    for (const html of kept) {
      expect(html).toContain('<h1 id="setup">');
    }
  });

  it("drops only the first heading", async () => {
    const html = await renderMarkdown("# One\n\n# Two\n");
    expect(html).not.toContain('id="one"');
    expect(html).toContain('<h1 id="two">');
  });

  it("drops an .mdx page's opening heading past its imports and comments", async () => {
    expect(
      await mdxHeadings(
        'import data from "./data.ts";\n\n{/* draft */}\n\n# Setup\n\nText.\n'
      )
    ).toStrictEqual([]);
  });

  it("keeps a heading in a <Prompt> or another component", async () => {
    expect(
      await mdxHeadings(
        '<Prompt description="Fix it">\n\n# Task\n\n</Prompt>\n\n# Setup\n'
      )
    ).toStrictEqual(["Task", "Setup"]);
  });

  it("hands the dropped heading's id to the page's title through the front matter", async () => {
    const frontmatter: Record<string, string> = {};
    await renderMarkdown("# Set up the CLI [#cli]\n\nText.\n", frontmatter);
    expect(frontmatter[TITLE_ID_KEY]).toBe("cli");
    // A render that keeps its heading clears an id an earlier one left.
    await renderMarkdown("Intro.\n\n# Setup\n", frontmatter);
    expect(frontmatter[TITLE_ID_KEY]).toBeUndefined();
  });

  it("hands on an .mdx page's dropped heading id too", async () => {
    const frontmatter: Record<string, string> = {};
    await mdxHeadings("# Setup\n\nText.\n", frontmatter);
    expect(frontmatter[TITLE_ID_KEY]).toBe("setup");
  });

  it("does nothing outside an Astro render, which carries no front matter", () => {
    let removed = false;
    const ctx: Parameters<TitleHeadingPlugin["before"]>[1] = {
      indexOf: () => 0,
      parent: () => {},
      removeNode: () => {
        removed = true;
      },
    };
    const plugin = titleHeadingPlugin();
    plugin.before({ type: "root" }, ctx);
    plugin.element.visit({ type: "element" }, ctx);
    expect(removed).toBe(false);
  });
});
