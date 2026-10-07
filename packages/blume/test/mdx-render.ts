import {
  blumeMarkdownProcessor,
  blumeMdxProcessor,
} from "../src/markdown/index.ts";

/** A heading as the renderer reports it for the table of contents. */
export interface RenderedHeading {
  depth: number;
  slug: string;
  text: string;
}

/** The frontmatter slice the heading plugin writes its TOC text map to. */
export interface TocFrontmatter {
  __blumeTocText?: { [slug: string]: string };
}

/** A rendered page: its HTML (or compiled MDX), headings, and frontmatter. */
export interface Rendered {
  code: string;
  frontmatter: TocFrontmatter;
  headings: RenderedHeading[];
}

/** Render a `.md` page through Blume's processor. */
export const renderMd = async (source: string): Promise<Rendered> => {
  const renderer = await blumeMarkdownProcessor({}).createRenderer({});
  const { code, metadata } = await renderer.render(source);
  return {
    code: code.trim(),
    frontmatter: metadata.frontmatter,
    headings: metadata.headings,
  };
};

const GET_HEADINGS =
  /export function getHeadings\(\) \{ return (?<json>.*); \}/u;
const FRONTMATTER = /export const frontmatter = (?<json>.*);/u;

/**
 * Compile an `.mdx` page the way `@astrojs/mdx` does, so JSX stays JSX (the
 * `.md`-style renderer reads `<Badge>` as raw HTML and drops components), and
 * read back what the compiled module exports.
 */
export const renderMdx = async (source: string): Promise<Rendered> => {
  const processor = blumeMdxProcessor({});
  if (!processor.createMdxRenderer) {
    throw new Error("The satteri processor has no MDX renderer.");
  }
  const renderer = await processor.createMdxRenderer(
    { syntaxHighlight: false },
    { optimize: false }
  );
  const { code } = await renderer.process(source, "/virtual/page.mdx", {});
  return {
    code,
    frontmatter: JSON.parse(FRONTMATTER.exec(code)?.groups?.json ?? "{}"),
    headings: JSON.parse(GET_HEADINGS.exec(code)?.groups?.json ?? "[]"),
  };
};
