import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency Docsify codemod, run the way the
// skill runs it: a bare `node` over the repo-root copy (the package's
// `skills/` is a generated mirror of it).
const CODEMOD = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "docsify-codemod.mjs"
);

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

const runCodemod = (cwd: string, ...args: string[]): string => {
  const result = spawnSync("node", [CODEMOD, ...args], {
    cwd,
    encoding: "utf-8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
};

/** A fresh project holding `files` (path → text) under its `docs/` folder. */
const site = async (files: Record<string, string>): Promise<string> => {
  const root = mkdtempSync(join(tmpdir(), "blume-docsify-codemod-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(([file, text]) => {
      const path = join(root, "docs", file);
      mkdirSync(join(path, ".."), { recursive: true });
      return writeFile(path, text);
    })
  );
  return root;
};

const read = (root: string, file: string): Promise<string> =>
  readFile(join(root, "docs", file), "utf-8");

const INDEX_V4 = [
  "<script>",
  "  window.$docsify = { loadSidebar: true };",
  "  // routerMode: 'history',",
  "</script>",
  '<script src="//cdn.jsdelivr.net/npm/docsify@4"></script>',
  "",
].join("\n");

describe("docsify-codemod", () => {
  it("converts callouts, tabs, includes, and heading attributes, and is idempotent", async () => {
    const root = await site({
      "_media/example.js": "console.log(1);\n",
      "_media/notes.yaml": "a: 1\n### [demo]\n  b: 2\n  c: 3\n### [demo]\n",
      "guide.md": [
        "# Guide",
        "",
        "!> Back up your config",
        "before you upgrade.",
        "",
        "?> A tip.",
        "",
        "> [!TIP|label:Heads up]",
        "> Quoted tip.",
        "",
        "> [!CAUTION]",
        "> Careful.",
        "",
        "<!-- tabs:start -->",
        "",
        "#### **macOS**",
        "",
        "One.",
        "",
        "#### **Linux**",
        "",
        "Two.",
        "",
        "<!-- tabs:end -->",
        "",
        "[](_media/example.js ':include :type=code')",
        "",
        "[](_media/notes.yaml ':include :fragment=demo :type=code yaml')",
        "",
        "[](_media/missing.md ':include')",
        "",
        "## Options :id=Opts",
        "",
        "## Internal {docsify-ignore}",
        "",
        "Setext section",
        "--------------",
        "",
      ].join("\n"),
      "index.html": INDEX_V4,
    });

    const report = runCodemod(root, "--write", "docs");
    expect(report).toContain("Docsify 4, relativePath: false, hash routing");
    expect(report).toContain("guide.md → guide.mdx");
    expect(report).toContain(
      "REVIEW line 40: include target _media/missing.md doesn't exist; Docsify 4 rendered this whole page blank"
    );
    expect(existsSync(join(root, "docs", "guide.md"))).toBe(false);
    expect(await read(root, "_media/notes.demo.yaml")).toBe("b: 2\nc: 3\n");
    expect(await read(root, "guide.mdx")).toBe(
      [
        "---",
        'title: "Guide"',
        "---",
        "",
        ":::warning",
        "Back up your config",
        "before you upgrade.",
        ":::",
        "",
        ":::tip",
        "A tip.",
        ":::",
        "",
        ":::tip[Heads up]",
        "Quoted tip.",
        ":::",
        "",
        ":::danger",
        "Careful.",
        ":::",
        "",
        "<Tabs>",
        "",
        '<Tab title="macOS">',
        "",
        "One.",
        "",
        "</Tab>",
        '<Tab title="Linux">',
        "",
        "Two.",
        "",
        "</Tab>",
        "</Tabs>",
        "",
        "<include>./_media/example.js</include>",
        "",
        '<include lang="yaml">./_media/notes.demo.yaml</include>',
        "",
        "[](_media/missing.md ':include')",
        "",
        "## Options [#opts]",
        "",
        "## Internal [!toc]",
        "",
        "## Setext section",
        "",
      ].join("\n")
    );
    // Idempotent: the second run changes nothing.
    expect(runCodemod(root, "--write", "docs")).toContain("0 changed");
  });

  it("resolves links the way Docsify did, from the root unless relativePath", async () => {
    const files = {
      "README.md": [
        "# Acme",
        "",
        "See [usage](#/guide/usage?id=flags) and [install](guide/install.md).",
        "",
      ].join("\n"),
      "guide/install.md": [
        "# Install",
        "",
        "[root-relative](usage.md?id=flags) [folder](./usage.md)",
        "[own site](https://acme.example/#/guide/usage) [out](https://example.com ':target=_blank')",
        "",
        '<a href="./_media/file.json">Download</a>',
        "",
      ].join("\n"),
      "guide/usage.md": "# Usage\n\n## Flags\n",
      "index.html": INDEX_V4,
      "usage.md": "# Root usage\n",
    };
    const root = await site(files);
    const report = runCodemod(
      root,
      "--write",
      "--site",
      "https://acme.example",
      "docs"
    );
    expect(report).toContain("README.md → index.md");
    expect(report).toContain("/_media/file.json");
    expect(await read(root, "index.md")).toContain(
      "See [usage](./guide/usage.md#flags) and [install](./guide/install.md)."
    );
    // relativePath false: `usage.md` and `./usage.md` meant /usage, at the root.
    const install = await read(root, "guide/install.md");
    expect(install).toContain(
      "[root-relative](../usage.md#flags) [folder](../usage.md)"
    );
    expect(install).toContain(
      "[own site](./usage.md) [out](https://example.com)"
    );
    expect(install).toContain('<a href="/_media/file.json">Download</a>');

    const relative = await site({
      ...files,
      "index.html": INDEX_V4.replace(
        "loadSidebar: true",
        "loadSidebar: true, relativePath: true"
      ),
    });
    runCodemod(relative, "--write", "docs");
    expect(await read(relative, "guide/install.md")).toContain(
      "[root-relative](./usage.md#flags) [folder](./usage.md)"
    );
  });

  it("titles pages from a leading H1 or the sidebar, and hides unlisted pages", async () => {
    const root = await site({
      "README.md": "# Acme\n\nWelcome.\n",
      "_sidebar.md": [
        "- [Home](/)",
        "- Getting started",
        '  - [Install the CLI](guide/install.md "Install guide")',
        "  - [Usage](guide/usage.md)",
        "",
      ].join("\n"),
      "guide/install.md": "# Install\n\nText.\n\n# More\n\n## Detail\n",
      "guide/notes.md": "# Notes\n",
      "guide/usage.md": "Intro prose first.\n\n# Flags\n\n## Short flags\n",
      "index.html": INDEX_V4,
    });
    const report = runCodemod(root, "--write", "docs");
    expect(report).toContain(
      'REVIEW line 7: content comes before the first H1, so the title is "Usage"'
    );

    const install = matter(await read(root, "guide/install.md"));
    expect(install.data).toEqual({
      seo: { title: "Install guide" },
      sidebar: { label: "Install the CLI" },
      title: "Install",
    });
    expect(install.content).toBe("\nText.\n\n## More\n\n### Detail\n");

    const usage = matter(await read(root, "guide/usage.md"));
    expect(usage.data).toEqual({ title: "Usage" });
    expect(usage.content).toBe(
      "\nIntro prose first.\n\n## Flags\n\n### Short flags\n"
    );

    expect(matter(await read(root, "guide/notes.md")).data).toEqual({
      hidden: true,
      title: "Notes",
    });
  });

  it("snapshots the ids Docsify 4 and 5 rendered", async () => {
    const page = [
      "# Quirks",
      "",
      "## Foo & Bar",
      "",
      "## 1. Numbered",
      "",
      "## Don't panic",
      "",
      "## The _When_ phase",
      "",
      "## snake_case",
      "",
      "## :video_game: Usage",
      "",
      "## Header {docsify-ignore}",
      "",
      "## Custom :id=MyCustom",
      "",
      "## Foo & Bar",
      "",
      "<!-- tabs:start -->",
      "",
      "#### **Tab label**",
      "",
      "Body.",
      "",
      "<!-- tabs:end -->",
      "",
      "[](_part.md ':include')",
      "",
    ].join("\n");
    const ids = async (index: string): Promise<string[]> => {
      const root = await site({
        "_part.md": "## Included\n",
        "index.html": index,
        "quirks.md": page,
      });
      runCodemod(root, "--snapshot", "snapshot", "docs");
      const html = await readFile(
        join(root, "snapshot", "quirks", "index.html"),
        "utf-8"
      );
      return [...html.matchAll(/ id="(?<id>[^"]*)"/gu)].map(
        (match) => match.groups?.id ?? ""
      );
    };
    // Checked against Docsify 4.13.1 and 5.0.0 rendering in Chromium.
    expect(await ids(INDEX_V4)).toEqual([
      "quirks",
      "foo-amp-bar",
      "_1-numbered",
      "don39t-panic",
      "the-when-phase",
      "snake_case",
      "video_game-usage",
      "header",
      "mycustom",
      "foo-amp-bar-1",
      "included",
    ]);
    expect(
      await ids(
        '<script src="//cdn.jsdelivr.net/npm/docsify@5/dist/docsify.min.js"></script>\n'
      )
    ).toEqual([
      "quirks",
      "foo--bar",
      "_1-numbered",
      "dont-panic",
      "the-_when_-phase",
      "snake_case",
      "video_game-usage",
      "header-docsify-ignore",
      "mycustom",
      "foo--bar-1",
      "included",
    ]);
  });

  it("moves pages into a folder per sidebar group and writes the route table", async () => {
    const root = await site({
      "README.md": "# Home\n\n[Setup](/pages/setup.md)\n",
      "_media/d.png": "",
      "_sidebar.md": [
        "- [Home](/)",
        "- Basics",
        "  - [Intro](/pages/intro.md)",
        "  - [Setup](/pages/setup.md)",
        "- Build & Test",
        "  - [Build](/pages/build.md)",
        "",
      ].join("\n"),
      "index.html": INDEX_V4,
      "pages/build.md": "# Build\n\n![diagram](../_media/d.png)\n",
      "pages/intro.md": "# Intro\n\nNext: [setup](/pages/setup.md?id=steps)\n",
      "pages/setup.md": "# Setup\n\n## Steps\n",
    });
    const report = runCodemod(root, "--write", "--group-folders", "docs");
    expect(report).toContain("3 route(s) changed");
    expect(existsSync(join(root, "docs", "index.md"))).toBe(true);
    expect(
      JSON.parse(await readFile(join(root, "docsify-routes.json"), "utf-8"))
    ).toEqual({
      "/pages/build": "/build-test/build",
      "/pages/intro": "/basics/intro",
      "/pages/setup": "/basics/setup",
    });
    expect(await read(root, "basics/meta.ts")).toBe(
      [
        'import { defineMeta } from "blume";',
        "",
        "export default defineMeta({",
        '  title: "Basics",',
        '  pages: ["intro", "setup"],',
        "});",
        "",
      ].join("\n")
    );
    expect(await read(root, "basics/intro.md")).toContain(
      "Next: [setup](./setup.md#steps)"
    );
    expect(await read(root, "index.md")).toContain(
      "[Setup](./basics/setup.md)"
    );
    expect(await read(root, "build-test/build.md")).toContain(
      "![diagram](../_media/d.png)"
    );
  });

  it("reads includes and images from the page's folder, as Docsify did", async () => {
    const page = [
      "# Install",
      "",
      "- Step one",
      "",
      "  !> Indented in a list.",
      "",
      "    !> indented code stays",
      "",
      "![logo](/_media/logo.png) ![root](/_media/root.png)",
      "",
      "[](/_media/snippet.js ':include')",
      "",
      "[](../_media/part.md ':include :fragment=p')",
      "",
      "[](../_media/part.md ':include :type=code :fragment=p')",
      "",
    ].join("\n");
    const files = {
      "_media/part.md": "intro\n### [p]\nkept\n### [p]\noutro\n",
      "_media/root.png": "",
      "_media/snippet.js": "root();\n",
      "guide/_media/logo.png": "",
      "guide/_media/snippet.js": "guide();\n",
      "guide/install.md": page,
    };
    const root = await site({ ...files, "index.html": INDEX_V4 });
    const report = runCodemod(root, "--write", "docs");
    // Docsify 4 cut a fragment from code includes only.
    expect(report).toContain(
      "Docsify 4 ignored :fragment= on a markdown include and showed all of ../_media/part.md, so it's included whole"
    );
    expect(report).toContain("Docsify read a leading-slash path");
    expect(await read(root, "guide/install.mdx")).toBe(
      [
        "---",
        'title: "Install"',
        "---",
        "",
        "- Step one",
        "",
        "  :::warning",
        "  Indented in a list.",
        "  :::",
        "",
        "    !> indented code stays",
        "",
        "![logo](./_media/logo.png) ![root](./_media/root.png)",
        "",
        "<include>./_media/snippet.js</include>",
        "",
        "<include>../_media/part.md</include>",
        "",
        '<include lang="markdown">../_media/part.p.md</include>',
        "",
      ].join("\n")
    );

    // Docsify 5 cuts a Markdown include's fragment too.
    const v5 = await site({
      ...files,
      "index.html":
        '<script src="//cdn.jsdelivr.net/npm/docsify@5/dist/docsify.min.js"></script>\n',
    });
    runCodemod(v5, "--write", "docs");
    expect(await read(v5, "guide/install.mdx")).toContain(
      "<include>../_media/part.p.md</include>"
    );
    expect(await read(v5, "_media/part.p.md")).toBe("kept\n");
  });

  it("keeps the sidebar's group order, the homepage's own route, and named nav files", async () => {
    const root = await site({
      "_media/guide.pdf": "",
      "cover.md": "# Acme\n\n[Start](intro.md)\n",
      "examples/README.md": "Intro prose.\n\n# Example\n",
      "index.html": [
        "<script>",
        "  window.$docsify = {",
        "    coverpage: 'cover.md',",
        "    homepage: 'intro.md',",
        "    loadNavbar: 'nav.md',",
        "    loadSidebar: 'menu.md',",
        "  };",
        "</script>",
        "",
      ].join("\n"),
      "intro.md": "# Intro\n\nWelcome.\n",
      "menu.md": [
        "- [Intro](intro.md)",
        "- Zebra",
        "  - [Setup](setup.md)",
        "- Apple",
        "  - [Usage](usage.md)",
        "",
      ].join("\n"),
      "nav.md": "- [Home](/)\n",
      "setup.md": [
        "# Setup",
        "",
        "Read [usage](usage.md?id=usage) and [the PDF](_media/guide.pdf ':ignore').",
        "",
        "Raw [usage source](usage.md ':ignore') and [intro source](/intro.md ':ignore Intro')",
        "",
      ].join("\n"),
      "usage.md": "# Usage\n\n## Flags\n",
    });
    const report = runCodemod(root, "--write", "--group-folders", "docs");
    expect(report).toContain("cover.md: rebuild the cover");
    expect(report).toContain("nav.md: map its links");
    expect(report).toContain('the title is "Examples"');
    // The cover and navbar aren't pages.
    expect(await read(root, "cover.md")).toBe("# Acme\n\n[Start](intro.md)\n");
    expect(await read(root, "nav.md")).toBe("- [Home](/)\n");
    // Blume sorts groups by name; the root meta.ts keeps the sidebar's order.
    expect(await read(root, "meta.ts")).toBe(
      [
        'import { defineMeta } from "blume";',
        "",
        "export default defineMeta({",
        '  pages: ["zebra", "apple"],',
        "});",
        "",
      ].join("\n")
    );
    expect(
      JSON.parse(await readFile(join(root, "docsify-routes.json"), "utf-8"))
    ).toEqual({
      "/intro": "/",
      "/setup": "/zebra/setup",
      "/usage": "/apple/usage",
    });
    // An anchor that named the title H1 goes with it; `':ignore'` links were
    // left for the browser, which read them from the docs root.
    expect(await read(root, "zebra/setup.md")).toContain(
      "Read [usage](../apple/usage.md) and [the PDF](/_media/guide.pdf)."
    );
    expect(report).toContain("/_media/guide.pdf");
    // One to a page's file opened the raw file: a raw `<a>` keeps the path of
    // its Markdown copy, where a Markdown link would land on the page.
    expect(await read(root, "zebra/setup.md")).toContain(
      'Raw <a href="/apple/usage.md">usage source</a> and <a href="/index.md" title="Intro">intro source</a>'
    );
    expect(report).toContain(
      "2 × ':ignore' link to a page's file → <a href> to its Markdown copy"
    );
    expect(report).not.toContain("/intro.md");
  });

  it("reads an ':ignore' link from the page's folder in history mode", async () => {
    const root = await site({
      "guide/data.json": "{}\n",
      "guide/other.md": "# Other\n",
      "guide/setup.md": [
        "# Setup",
        "",
        "See [the source](other.md ':ignore') and [data](data.json ':ignore').",
        "",
      ].join("\n"),
      "index.html": INDEX_V4.replace(
        "{ loadSidebar: true }",
        "{ loadSidebar: true, routerMode: 'history' }"
      ),
    });
    runCodemod(root, "--write", "docs");
    // The browser read both from /guide/; only a page's file has a copy.
    expect(await read(root, "guide/setup.md")).toContain(
      'See <a href="/guide/other.md">the source</a> and [data](data.json).'
    );
  });

  it("converts emoji with a map and reports what MDX will still reject", async () => {
    const emoji = join(
      mkdtempSync(join(tmpdir(), "blume-docsify-emoji-")),
      "emojis.json"
    );
    roots.push(join(emoji, ".."));
    await writeFile(
      emoji,
      JSON.stringify({
        rocket:
          "https://github.githubassets.com/images/icons/emoji/unicode/1f680.png?v8",
      })
    );
    const root = await site({
      "index.html": INDEX_V4,
      "page.md": [
        "# Page",
        "",
        "Launch :rocket: now, :unknown: stays, `:rocket:` in code stays.",
        "",
        "!> Careful.",
        "",
        "<!-- a comment -->",
        "",
        '<p align="center">',
        "  <h2>Banner</h2>",
        "</p>",
        "",
        "<table><tr><td> - </td></tr></table>",
        "",
        "    indented :rocket: [code](page.md)",
        "",
        "Some {braces}.",
        "",
      ].join("\n"),
    });
    const report = runCodemod(root, "--write", "--emoji", emoji, "docs");
    expect(report).toContain(
      "emoji shortcode :unknown: renders as text in Blume"
    );
    expect(report).toContain("a block element inside <p>");
    expect(report).toContain("an HTML table tag shares its line with text");
    expect(report).toContain("an indented code block");
    expect(report).toContain("a brace in prose");
    const text = await read(root, "page.mdx");
    expect(text).toContain(
      "Launch 🚀 now, :unknown: stays, `:rocket:` in code stays."
    );
    // Docsify showed an indented block as code, so nothing in it changes.
    expect(text).toContain("    indented :rocket: [code](page.md)");
    expect(text).toContain("{/* a comment */}");
  });
});
