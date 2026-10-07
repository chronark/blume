import { describe, expect, it } from "bun:test";

import { TOC_TEXT_KEY } from "../src/core/heading-markers.ts";
import { scanBody } from "../src/core/sources/normalize.ts";
import { headingAnchorPlugin } from "../src/markdown/heading-anchors.ts";
import { blumeMarkdownProcessor } from "../src/markdown/index.ts";
import { renderMd, renderMdx } from "./mdx-render.ts";
import type { Rendered, TocFrontmatter } from "./mdx-render.ts";

const slugs = (rendered: Rendered): string[] =>
  rendered.headings.map((heading) => heading.slug);

const scannedSlugs = (source: string): string[] =>
  scanBody(source).headings.map((heading) => heading.slug);

describe("a heading that ends or starts with an inline component", () => {
  const source = [
    "## Maintainers <Badge>new</Badge>",
    "## Maintainers <Badge/>",
    '## <Icon name="rocket" /> Launch',
    "## ![logo](/logo.png) Leading image",
  ].join("\n\n");

  it("never slugs the edge space into a dash", async () => {
    const expected = [
      "maintainers",
      "maintainers-1",
      "launch",
      "leading-image",
    ];
    expect(slugs(await renderMd(source))).toStrictEqual(expected);
    expect(slugs(await renderMdx(source))).toStrictEqual(expected);
    expect(scannedSlugs(source)).toStrictEqual(expected);
  });

  it("drops the dash a stripped trailing emoji leaves", async () => {
    const emoji = "## Features ✨\n\n## Features";
    const expected = ["features", "features-1"];
    expect(slugs(await renderMd(emoji))).toStrictEqual(expected);
    expect(scannedSlugs(emoji)).toStrictEqual(expected);
  });
});

describe("badge text in a heading", () => {
  const source = [
    "## Install <Badge>beta</Badge>",
    "## Install <Badge variant='accent'>beta</Badge> now",
    "## <Badge>New</Badge> Feature",
    "## Stable",
  ].join("\n\n");
  const expected = ["install", "install-now", "feature", "stable"];

  it("stays out of the heading's id in .md and .mdx", async () => {
    const md = await renderMd(source);
    expect(slugs(md)).toStrictEqual(expected);
    expect(md.code).toContain(
      '<h2 id="install"><a class="blume-heading-anchor" href="#install">Install <Badge>beta</Badge></a></h2>'
    );
    const mdx = await renderMdx(source);
    expect(slugs(mdx)).toStrictEqual(expected);
    expect(mdx.code).toContain('href: "#install-now"');
    expect(scannedSlugs(source)).toStrictEqual(expected);
  });

  it("stays out of the heading's TOC text", async () => {
    const tocText = {
      feature: "Feature",
      install: "Install",
      "install-now": "Install now",
    };
    const md = await renderMd(source);
    const mdx = await renderMdx(source);
    expect(md.frontmatter[TOC_TEXT_KEY]).toStrictEqual(tocText);
    expect(mdx.frontmatter[TOC_TEXT_KEY]).toStrictEqual(tocText);
    // The scan's heading text (a fallback title, a sidebar label) agrees.
    expect(scanBody(source).headings.map((h) => h.text)).toStrictEqual([
      "Install",
      "Install now",
      "Feature",
      "Stable",
    ]);
  });

  it("adds no TOC text to a page without one", async () => {
    const md = await renderMd("## Stable");
    const mdx = await renderMdx("## Stable");
    expect(md.frontmatter).not.toHaveProperty(TOC_TEXT_KEY);
    expect(mdx.frontmatter).not.toHaveProperty(TOC_TEXT_KEY);
  });

  it("drops a stale TOC text map when the same entry re-renders", () => {
    const frontmatter: TocFrontmatter = {
      [TOC_TEXT_KEY]: { install: "Install" },
    };
    headingAnchorPlugin().element.visit(
      {
        children: [{ type: "text", value: "Install" }],
        properties: {},
        tagName: "h2",
        type: "element",
      },
      {
        data: { astro: { frontmatter } },
        setProperty() {
          // The id isn't under test.
        },
        textContent: () => "Install",
      }
    );
    expect(frontmatter).not.toHaveProperty(TOC_TEXT_KEY);
  });
});

describe("a heading holding its own empty anchor", () => {
  const source = [
    '## Title <a href="#x" id="x"></a>',
    '## <a name="install"></a>Install',
    '## Self-closing <a name="closed" />',
    "## Unnamed <a></a>",
  ].join("\n\n");
  const expected = ["x", "install", "closed", "unnamed"];

  it("takes the anchor out and pins its id in .md", async () => {
    const md = await renderMd(source);
    expect(slugs(md)).toStrictEqual(expected);
    // One link per heading: the self-link, never one nested in another.
    expect(md.code).toBe(
      [
        '<h2 id="x"><a class="blume-heading-anchor" href="#x">Title </a></h2>',
        '<h2 id="install"><a class="blume-heading-anchor" href="#install">Install</a></h2>',
        '<h2 id="closed"><a class="blume-heading-anchor" href="#closed">Self-closing </a></h2>',
        '<h2 id="unnamed"><a class="blume-heading-anchor" href="#unnamed">Unnamed </a></h2>',
      ].join("\n")
    );
    expect(scannedSlugs(source)).toStrictEqual(expected);
  });

  it("takes the anchor out and keeps the self-link in .mdx", async () => {
    const mdx = await renderMdx(source);
    expect(slugs(mdx)).toStrictEqual(expected);
    expect(mdx.code).toContain('href: "#x"');
    expect(mdx.code).toContain('href: "#install"');
    expect(mdx.code).not.toContain('_jsx("a", {');
  });

  it("pins an h1 and a heading with self-links off, unwrapped", async () => {
    const renderer = await blumeMarkdownProcessor({
      headingAnchors: false,
    }).createRenderer({});
    // A titled page keeps its opening h1 (an untitled one renders it as the
    // page title instead).
    const { code } = await renderer.render(
      '# Page <a id="top"></a>\n\n## Part <a id="part"></a>',
      { frontmatter: { title: "Page" } }
    );
    expect(code.trim()).toBe(
      '<h1 id="top">Page </h1>\n<h2 id="part">Part </h2>'
    );
  });

  it("lets a [#id] marker win over the anchor's id", async () => {
    const pinned = '## Title <a id="x"></a> [#y]';
    expect(slugs(await renderMd(pinned))).toStrictEqual(["y"]);
    expect(scannedSlugs(pinned)).toStrictEqual(["y"]);
  });

  it("keeps the anchor when it's all the heading holds", async () => {
    const lone = '## <a id="x"></a>';
    const md = await renderMd(lone);
    expect(md.code).toBe('<h2 id=""><a id="x"></a></h2>');
    expect(scannedSlugs(lone)).toStrictEqual([""]);
  });

  it("doesn't nest the self-link around a raw link in .md", async () => {
    const md = await renderMd('## See <a href="/docs">the docs</a>');
    expect(md.code).toBe(
      '<h2 id="see-the-docs">See <a href="/docs">the docs</a></h2>'
    );
  });
});
