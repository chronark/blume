import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency VitePress codemod, run the way the
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
  "vitepress-codemod.mjs"
);

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

const runCodemod = (...args: string[]): string => {
  const result = spawnSync("node", [CODEMOD, ...args], { encoding: "utf-8" });
  expect(result.status).toBe(0);
  return result.stdout;
};

/** A fresh source directory holding `files` (path → text). */
const site = async (files: Record<string, string>): Promise<string> => {
  const root = mkdtempSync(join(tmpdir(), "blume-vitepress-codemod-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(([file, text]) => {
      const path = join(root, file);
      mkdirSync(join(path, ".."), { recursive: true });
      return writeFile(path, text);
    })
  );
  return root;
};

describe("vitepress-codemod", () => {
  it("pairs containers the way markdown-it does, and is idempotent", async () => {
    const root = await site({
      "containers.md": [
        "# Containers",
        "",
        "::: tip",
        "Plain.",
        ":::",
        "",
        "::: danger STOP",
        "Titled.",
        ":::",
        "",
        "::: warning",
        "Outer.",
        "",
        "::: tip Inner",
        "Nested.",
        ":::",
        ":::",
        "",
        "::: code-group",
        "```sh [npm]",
        "npm i blume",
        "```",
        "```sh [pnpm]",
        "pnpm add blume",
        "```",
        ":::",
        "",
        "::: code-group",
        "```js",
        "run()",
        "```",
        "After an unclosed group.",
        "",
        "::: details Click me {open}",
        "Hidden.",
        ":::",
        "",
        ":::",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain("containers.md → containers.mdx");
    // The first bare `:::` closes the outer warning (the outermost open
    // container), so the tip inside it has no closer of its own and the
    // next `:::` is stray.
    expect(report).toContain(
      "REVIEW line 14: container has no closer of its own"
    );
    expect(report).toContain("REVIEW line 17: stray `:::`");
    expect(report).toContain("REVIEW line 28: code group has no closer");

    expect(existsSync(join(root, "containers.md"))).toBe(false);
    expect(await readFile(join(root, "containers.mdx"), "utf-8")).toBe(
      [
        "---",
        "title: Containers",
        "---",
        "",
        ":::tip",
        "Plain.",
        ":::",
        "",
        ":::danger[STOP]",
        "Titled.",
        ":::",
        "",
        "::::warning",
        "Outer.",
        "",
        ":::tip[Inner]",
        "Nested.",
        ":::",
        "::::",
        "",
        "<CodeGroup>",
        "",
        "```sh npm",
        "npm i blume",
        "```",
        "```sh pnpm",
        "pnpm add blume",
        "```",
        "",
        "</CodeGroup>",
        "",
        "<CodeGroup>",
        "",
        "```js js",
        "run()",
        "```",
        "",
        "</CodeGroup>",
        "",
        "After an unclosed group.",
        "",
        '<Expandable title="Click me" defaultOpen>',
        "",
        "Hidden.",
        "",
        "</Expandable>",
        "",
      ].join("\n")
    );
    expect(runCodemod(root)).toContain("0 would change");
  });

  it("keeps containers left as written inside their callout, and reports what it can't pair", async () => {
    const root = await site({
      "edge.md": [
        "# Edge",
        "",
        ":::: warning",
        "Outer.",
        "",
        "::: card",
        "Card body.",
        ":::",
        "",
        "Still outer.",
        "::::",
        "",
        "::: tip See [setup](./setup.html)",
        "Linked title.",
        ":::",
        "",
        "::: code-group",
        "<<< @/snippets/a.ts [Config]",
        "",
        '<iframe src="https://example.com"></iframe>',
        ":::",
        "",
        "```md",
        "<!--@include: ./setup.md-->",
        "```",
        "",
      ].join("\n"),
      "setup.md": "# Setup\n",
      "snippets/a.ts": "export const a = 1;\n",
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "REVIEW line 6: `card` isn't a VitePress built-in container"
    );
    // The `:::` after the iframe closed the group in VitePress; it isn't text.
    expect(report).toContain(
      "REVIEW line 21: `:::` closed the code group above in VitePress"
    );
    expect(report).toContain(
      "REVIEW line 24: `<!--@include:-->` inside a code fence"
    );

    const page = await readFile(join(root, "edge.mdx"), "utf-8");
    // The card's own `:::` lines would end a three-colon callout in Blume.
    expect(page).toContain(
      [
        "::::warning",
        "Outer.",
        "",
        "::: card",
        "Card body.",
        ":::",
        "",
        "Still outer.",
        "::::",
      ].join("\n")
    );
    expect(page).toContain(":::tip[See [setup](/setup)]");
    expect(page).toContain(
      [
        "<CodeGroup>",
        "",
        '<include meta="Config">/snippets/a.ts</include>',
        "",
        "</CodeGroup>",
        "",
        '<iframe src="https://example.com"></iframe>',
        "",
      ].join("\n")
    );
    expect(runCodemod(root)).toContain("0 would change");
  });

  it("rewrites fence meta, alerts, links, badges, and the H1", async () => {
    const root = await site({
      "guide/alerts.md": [
        "# Alerts",
        "",
        "> [!WARNING] Careful",
        "> Warned.",
        "",
        "> [!TIP]",
        "> Lazy",
        "continuation.",
        "",
        "  > [!INFO] Indented",
        "",
        "> [!FOO]",
        "> Unknown.",
        "",
      ].join("\n"),
      "guide/fences.md": [
        "---",
        "description: Fences",
        "---",
        "",
        "# Fences",
        "",
        "```js{2}",
        "a",
        "```",
        "",
        "```ts:line-numbers=3 [Functional API]",
        "b",
        "```",
        "",
        "```ts{1}:line-numbers",
        "c",
        "```",
        "",
      ].join("\n"),
      "guide/index.md": "# Guide\n",
      "guide/links.md": [
        "# Links",
        "",
        "[a](./fences.html) [b](/guide/fences.md#x) [c](/guide/) [d](/nope.html) [e](./fences.md)",
        "",
        '## Options <Badge type="warning" text="beta" />',
        "",
        "## Custom {#keep-me}",
        "",
        "[[toc]]",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    // Blume renders a GitHub alert itself, but only in .mdx.
    expect(report).toContain(
      "REVIEW line 6: GitHub alert left as a blockquote: Blume renders it as a callout only in .mdx"
    );
    // VitePress's own alert types, and unknown ones, it never renders.
    expect(report).toContain(
      "REVIEW line 10: GitHub alert left as a blockquote: convert it by hand"
    );
    expect(report).toContain(
      "REVIEW line 12: GitHub alert left as a blockquote: convert it by hand"
    );
    expect(report).toContain("line numbers started at 3: Blume starts at 1");
    expect(report).toContain("link /nope.html: no page backs /nope");

    // No MDX-only syntax: the page keeps its .md name.
    const fences = await readFile(join(root, "guide/fences.md"), "utf-8");
    expect(matter(fences).data).toEqual({
      description: "Fences",
      title: "Fences",
    });
    expect(fences).toContain("```js {2}\na\n```");
    expect(fences).toContain(
      '```ts title="Functional API" lineNumbers\nb\n```'
    );
    expect(fences).toContain("```ts {1} lineNumbers\nc\n```");

    const alerts = await readFile(join(root, "guide/alerts.mdx"), "utf-8");
    expect(alerts).toContain(":::warning[Careful]\nWarned.\n:::");
    expect(alerts).toContain("> [!TIP]\n> Lazy\ncontinuation.");

    const links = await readFile(join(root, "guide/links.mdx"), "utf-8");
    expect(links).toContain(
      "[a](/guide/fences) [b](/guide/fences#x) [c](/guide) [d](/nope.html) [e](./fences.md)"
    );
    // The badge heading keeps the anchor VitePress gave it.
    expect(links).toContain(
      '## Options <Badge variant="warning">beta</Badge> [#options]'
    );
    expect(links).toContain("## Custom [#keep-me]");
    expect(links).not.toContain("[[toc]]");

    expect(await readFile(join(root, "guide/index.md"), "utf-8")).toBe(
      "---\ntitle: Guide\n---\n"
    );
    expect(runCodemod(root)).toContain("0 would change");
  });

  it("turns snippet imports and includes into <include>, and keeps partials' names", async () => {
    const root = await site({
      "guide/page.md": [
        "# Page",
        "",
        "<<< @/snippets/a.ts{2} [Functional API]",
        "",
        "<<< @/snippets/a.ts#part",
        "",
        "<<< @/../outside.ts",
        "",
        "::: code-group",
        "<<< @/snippets/a.ts",
        "<<< ../snippets/a.ts [Two]",
        ":::",
        "",
        "<!--@include: ../parts/shared.md-->",
        "",
        "<!--@include: ../parts/shared.md{2,}-->",
        "",
        "<<< @/snippets/a.ts{1 ts :line-numbers}",
        "",
      ].join("\n"),
      "parts/shared.md": "Shared.\n\n::: tip\nIn a partial.\n:::\n",
      "snippets/a.ts": "export const one = 1;\nexport const two = 2;\n",
    });

    const report = runCodemod("--write", root);
    expect(report).toContain("`<<<` region #part");
    expect(report).toContain(
      "`<<< @/../outside.ts` is outside the source directory"
    );
    expect(report).toContain("`<!--@include:-->` with a region or line range");
    expect(report).toContain("partial uses MDX-only syntax but keeps .md");

    const page = await readFile(join(root, "guide/page.mdx"), "utf-8");
    expect(page).toContain(
      `<include meta='title="Functional API" {2}'>/snippets/a.ts</include>`
    );
    expect(page).toContain("<<< @/snippets/a.ts#part");
    expect(page).toContain(
      [
        "<CodeGroup>",
        "",
        '<include meta="a.ts">/snippets/a.ts</include>',
        "",
        '<include meta="Two">../snippets/a.ts</include>',
        "",
        "</CodeGroup>",
      ].join("\n")
    );
    expect(page).toContain("<include>../parts/shared.md</include>");
    expect(page).toContain(
      '<include lang="ts" meta="{1} lineNumbers">/snippets/a.ts</include>'
    );
    // An include the codemod can't convert stays an HTML comment, so the
    // .mdx build fails on it instead of hiding it.
    expect(page).toContain("<!--@include: ../parts/shared.md{2,}-->");
    expect(await readFile(join(root, "parts/shared.md"), "utf-8")).toContain(
      ":::tip\nIn a partial.\n:::"
    );
    expect(runCodemod(root)).toContain("0 would change");
  });

  it("reports what still won't compile as MDX", async () => {
    const root = await site({
      "page.md": [
        "---",
        "layout: home",
        "sidebar: false",
        "---",
        "",
        "::: tip",
        "Tip <!-- note --> here.",
        ":::",
        "",
        '<Banner :users="[1]" />',
        "",
        "Value {{ $frontmatter.title }}.",
        "",
        "Line<br>break.",
        "",
        '<img src="./shot.png" />',
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain("frontmatter `layout` isn't a Blume key");
    expect(report).toContain("VitePress `sidebar: false` hides the sidebar");
    expect(report).toContain("component <Banner>");
    expect(report).toContain("Vue binding or directive");
    expect(report).toContain("`{{ }}` is a JSX expression in .mdx");
    expect(report).toContain(
      "raw `<img>` with a relative src: Blume publishes the file but doesn't optimize it"
    );

    const page = await readFile(join(root, "page.mdx"), "utf-8");
    expect(page).toContain("Tip {/* note */} here.");
    expect(page).toContain("Line<br />break.");
  });

  it("prints .html redirects for the pages a VitePress build wrote", async () => {
    const page = '<meta name="generator" content="VitePress v1.6.4">';
    const root = await site({
      "404.html": page,
      "guide/index.html": page,
      "guide/setup.html": page,
      "index.html": page,
      "pure.html": "<p>A file from public/</p>",
    });
    expect(JSON.parse(runCodemod("--redirects", root))).toEqual([
      { from: "/guide/setup.html", to: "/guide/setup" },
    ]);
  });
});
