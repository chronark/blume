import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency Docus codemod, run the way the
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
  "docus-codemod.mjs"
);

// Blume's own Lucide set, so icon names are checked the way an installed
// `blume` checks them.
const LUCIDE = join(
  import.meta.dir,
  "..",
  "node_modules",
  "@iconify-json",
  "lucide",
  "icons.json"
);

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

const runCodemod = (...args: string[]): string => {
  const result = spawnSync("node", [CODEMOD, "--lucide", LUCIDE, ...args], {
    encoding: "utf-8",
  });
  expect(result.status).toBe(0);
  return result.stdout;
};

/** A fresh Docus `content/` directory holding `files` (path → text). */
const site = async (files: Record<string, string>): Promise<string> => {
  const root = mkdtempSync(join(tmpdir(), "blume-docus-codemod-"));
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

const read = (root: string, file: string): Promise<string> =>
  readFile(join(root, file), "utf-8");

describe("docus-codemod", () => {
  it("pairs blocks the way remark-mdc does, and is idempotent", async () => {
    const root = await site({
      "callouts.md": [
        "---",
        "title: Callouts",
        "---",
        "",
        "::note",
        "Plain note.",
        "::",
        "",
        '::callout{color="error" icon="i-lucide-flame"}',
        "Custom icon.",
        "::",
        "",
        '::callout{icon="i-lucide-info" color="info"}',
        "Default icon.",
        "::",
        "",
        "::caution",
        "Red, not Blume's caution.",
        "::",
        "",
        "::warning",
        "Outer warning.",
        "",
        "  :::tip",
        "  Nested tip.",
        "  :::",
        "::",
        "",
        "::tip",
        "```md",
        "::",
        "not a closer",
        "```",
        "Still inside the tip.",
        "::",
        "",
        "::note",
        "Unclosed inner:",
        ":::warning",
        "Swallowed.",
        "::",
        "",
        ":::",
        "Stray.",
        "",
        "::tip",
        "  ::",
        "Indented closer is text.",
        "::",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain("callouts.md → callouts.mdx");
    // `::` closes the note, the innermost block with two colons, and the
    // `:::warning` still open inside it.
    expect(report).toContain(
      "REVIEW line 39: `::warning` has no closer of its own: the closer on line 41 ends it"
    );
    expect(report).toContain("REVIEW line 43: stray `:::`");
    expect(report).toContain(
      "REVIEW line 47: `::` is indented deeper than its opener"
    );

    expect(existsSync(join(root, "callouts.md"))).toBe(false);
    expect(await read(root, "callouts.mdx")).toBe(
      [
        "---",
        "title: Callouts",
        "---",
        "",
        ":::note",
        "Plain note.",
        ":::",
        "",
        '<Callout type="danger" icon="flame">',
        "",
        "Custom icon.",
        "",
        "</Callout>",
        "",
        ":::info",
        "Default icon.",
        ":::",
        "",
        ":::danger",
        "Red, not Blume's caution.",
        ":::",
        "",
        "::::warning",
        "Outer warning.",
        "",
        "  :::tip",
        "  Nested tip.",
        "  :::",
        "::::",
        "",
        ":::tip",
        "```md",
        "::",
        "not a closer",
        "```",
        "Still inside the tip.",
        ":::",
        "",
        "::::note",
        "Unclosed inner:",
        "",
        ":::warning",
        "Swallowed.",
        ":::",
        "::::",
        "",
        ":::",
        "Stray.",
        "",
        ":::tip",
        "  ::",
        "Indented closer is text.",
        ":::",
        "",
      ].join("\n")
    );

    expect(runCodemod(root)).toContain("0 would change");
  });

  it("converts the prose components and the frontmatter", async () => {
    const root = await site({
      "components.md": [
        "---",
        "title: Components",
        "navigation:",
        "  title: Comps",
        "  icon: i-lucide-component",
        "links:",
        "  - label: Get started",
        "    icon: i-lucide-rocket",
        "    to: /guide/start",
        "  - label: GitHub",
        "    to: https://github.com/acme/docs",
        "    target: _blank",
        "seo:",
        "  title: Components SEO",
        "  ogImage: /og.png",
        "layout: docs",
        "---",
        "",
        "::card-group",
        "  :::card",
        "  ---",
        "  title: First",
        "  icon: i-lucide-zap",
        "  to: /first",
        "  color: neutral",
        "  ---",
        "  First body.",
        "  :::",
        "",
        '  :::card{icon="i-simple-icons-github" to="https://github.com"}',
        "  #title",
        "  GitHub",
        "  #description",
        "  Source code.",
        "  :::",
        "::",
        "",
        "::field-group",
        '  ::field{name="`analytics`" type="boolean" required}',
        "  Enables analytics.",
        "  ::",
        "",
        '  ::field{name="blob" type="boolean"}',
        "  Blob storage.",
        "  ::",
        "::",
        "",
        '::steps{level="4"}',
        "#### Install",
        "",
        "::code-group",
        "```bash [pnpm]",
        "pnpm add acme",
        "```",
        "```bash [npm]",
        "npm install acme",
        "```",
        "::",
        "",
        "#### Run",
        "",
        "::code-group",
        "```bash [pnpm]",
        "pnpm dev",
        "```",
        "```bash [npm]",
        "npm run dev",
        "```",
        "::",
        "::",
        "",
        '::tabs{sync="pm"}',
        '  :::tabs-item{label="Preview" icon="i-lucide-eye"}',
        "  Rendered.",
        "  :::",
        "",
        '  :::tabs-item{label="Code"}',
        "  ```ts [app.config.ts]{2}",
        "  export default {",
        '    title: "x",',
        "  }",
        "  ```",
        "  :::",
        "::",
        "",
        "::prompt",
        "---",
        "description: Set up a server",
        "icon: i-lucide-download",
        "actions:",
        "  - copy",
        "  - cursor",
        "  - windsurf",
        "---",
        'Use defineTool({ name }) inside <script setup lang="ts"> and call useApp<TPayload>() in typically <50 ms.',
        "::",
        "",
        'Press :kbd{value="meta"} :kbd{value="K"}, see :icon{name="i-lucide-rocket"} and :badge[New], and read [the guide]{.text-primary}.',
        "",
        ':u-color-mode-image{light="/light.png" dark="/dark.png" alt="Screenshot"}',
        "",
        "::code-collapse",
        "```css [main.css]",
        "a {}",
        "```",
        "::",
        "",
        "::collapsible",
        "| Prop | Type |",
        "| --- | --- |",
        "::",
        "",
        '::landing-hero{title="Hi"}',
        "::",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "REVIEW line 30: card icon `i-simple-icons-github` isn't a Lucide icon"
    );
    expect(report).toContain(
      "REVIEW line 95: `<script>` isn't a Blume component or an HTML tag MDX can hold: it's now text"
    );
    expect(report).toContain(
      "REVIEW line 113: `::landing-hero` isn't a Nuxt UI prose component"
    );
    expect(report).toContain("1 × prompt action `windsurf` removed");

    const text = await read(root, "components.mdx");
    const { data } = matter(text);
    expect(data).toEqual({
      related: [
        { "Get started": "/guide/start" },
        { GitHub: "https://github.com/acme/docs" },
      ],
      seo: { image: "/og.png", title: "Components SEO" },
      sidebar: { icon: "component", label: "Comps" },
      title: "Components",
    });
    expect(text.slice(text.indexOf("<CardGroup>"))).toBe(
      [
        "<CardGroup>",
        "",
        '<Card title="First" href="/first" icon="zap">',
        "",
        "First body.",
        "",
        "</Card>",
        "",
        '<Card title="GitHub" href="https://github.com" icon="i-simple-icons-github">',
        "",
        "Source code.",
        "",
        "</Card>",
        "",
        "</CardGroup>",
        "",
        '<ResponseField name="analytics" type="boolean" required>',
        "",
        "Enables analytics.",
        "",
        "</ResponseField>",
        "",
        '<ResponseField name="blob" type="boolean">',
        "",
        "Blob storage.",
        "",
        "</ResponseField>",
        "",
        "<Steps>",
        "",
        "<Step>",
        "",
        "#### Install",
        "",
        "```package-install",
        "npm install acme",
        "```",
        "",
        "</Step>",
        "",
        "<Step>",
        "",
        "#### Run",
        "",
        "<CodeGroup>",
        "",
        "```bash pnpm",
        "pnpm dev",
        "```",
        "```bash npm",
        "npm run dev",
        "```",
        "",
        "</CodeGroup>",
        "",
        "</Step>",
        "",
        "</Steps>",
        "",
        '<Tabs syncKey="pm">',
        "",
        '<Tab title="Preview" icon="eye">',
        "",
        "Rendered.",
        "",
        "</Tab>",
        "",
        '<Tab title="Code">',
        "",
        "```ts app.config.ts {2}",
        "export default {",
        '  title: "x",',
        "}",
        "```",
        "",
        "</Tab>",
        "",
        "</Tabs>",
        "",
        '<Prompt description="Set up a server" actions={["copy", "cursor"]}>',
        "",
        'Use defineTool(\\{ name \\}) inside &lt;script setup lang="ts"> and call useApp&lt;TPayload>() in typically &lt;50 ms.',
        "",
        "</Prompt>",
        "",
        'Press <kbd>⌘</kbd> <kbd>K</kbd>, see <Icon icon="rocket" /> and <Badge>New</Badge>, and read the guide.',
        "",
        '<img src="/light.png" alt="Screenshot" class="dark:hidden" /> <img src="/dark.png" alt="Screenshot" class="hidden dark:block" />',
        "",
        "```css main.css expandable",
        "a {}",
        "```",
        "",
        '<Expandable title="Show properties">',
        "",
        "| Prop | Type |",
        "| --- | --- |",
        "",
        "</Expandable>",
        "",
        '::landing-hero{title="Hi"}',
        "::",
        "",
      ].join("\n")
    );
  });

  it("makes MDX prose safe, and leaves component-free pages as .md", async () => {
    const root = await site({
      "hazards.md": [
        "---",
        "title: Hazards",
        "sitemap: false",
        "toc: false",
        "---",
        "",
        "::note",
        "A callout makes this page MDX.",
        "::",
        "",
        "Braces { a } and \\{ b \\}, a generic List<Item>, x <= 5, a < b, and `{code}`.",
        "",
        "Keys <kbd>K</kbd>, a break<br>here, <!-- a comment --> and <https://example.com>.",
        "",
        "Math $$x_{i}$$ stays, and {{ $doc.version }} is a binding.",
        "",
      ].join("\n"),
      "plain.md": [
        "---",
        "title: Plain",
        "---",
        "",
        "Call useApp<TPayload>() with { data } here.",
        "",
        "```ts [nuxt.config.ts]",
        "export default {}",
        "```",
        "",
      ].join("\n"),
      "samples.md": [
        "---",
        "title: Samples",
        "---",
        "",
        "::tip",
        "Write a callout like this:",
        "::",
        "",
        "````mdc",
        "::note",
        "Inside a sample.",
        "::",
        "",
        "```ts [file.ts]",
        "const a = 1;",
        "```",
        "````",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "REVIEW line 1: `sitemap` removed: Blume has no sitemap-only switch"
    );
    expect(report).toContain(
      "REVIEW line 1: frontmatter `toc` isn't a Blume key: map or drop it"
    );
    expect(report).toContain("REVIEW line 15: `{{ … }}` binding");

    expect(await read(root, "hazards.mdx")).toBe(
      [
        "---",
        "title: Hazards",
        "toc: false",
        "---",
        "",
        ":::note",
        "A callout makes this page MDX.",
        ":::",
        "",
        "Braces \\{ a \\} and \\{ b \\}, a generic List&lt;Item>, x &lt;= 5, a < b, and `{code}`.",
        "",
        "Keys <kbd>K</kbd>, a break<br />here, {/* a comment */} and [https://example.com](https://example.com).",
        "",
        "Math $$x_{i}$$ stays, and \\{\\{ $doc.version \\}\\} is a binding.",
        "",
      ].join("\n")
    );
    // No component, so it stays Markdown, and its prose stays as written.
    expect(await read(root, "plain.md")).toBe(
      [
        "---",
        "title: Plain",
        "---",
        "",
        "Call useApp<TPayload>() with { data } here.",
        "",
        "```ts nuxt.config.ts",
        "export default {}",
        "```",
        "",
      ].join("\n")
    );
    // An MDC sample inside a fence is code: its blocks and fence labels stay.
    const samples = await read(root, "samples.mdx");
    expect(samples).toContain(
      [
        "````mdc",
        "::note",
        "Inside a sample.",
        "::",
        "",
        "```ts [file.ts]",
        "const a = 1;",
        "```",
        "````",
      ].join("\n")
    );
  });

  it("moves a body H1 into the title, writes meta.ts, and flags changed routes", async () => {
    const root = await site({
      "01-intro.md": "---\ntitle: Dash\n---\n\nBody.\n",
      "_partial.md": "---\ntitle: Partial\n---\n\nBody.\n",
      "guide/.navigation.yml": "title: Guide\nicon: i-lucide-book-open\n",
      "guide/index.md": "# Getting Started\n\nIntro.\n",
      "hidden/.navigation.yml": "title: Hidden\nnavigation: false\n",
      "hidden/secret.md": "---\ntitle: Secret\n---\n\nBody.\n",
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "`01-intro`: Docus keeps a dash or underscore prefix in the URL and Blume strips it"
    );
    expect(report).toContain(
      "`_partial`: Docus publishes `_` files and Blume excludes them"
    );
    expect(report).toContain(
      "REVIEW line 2: `navigation: false` hides the folder"
    );

    expect(await read(root, "guide/index.md")).toBe(
      ["---", "title: Getting Started", "---", "", "Intro.", ""].join("\n")
    );
    expect(await read(root, "guide/meta.ts")).toBe(
      [
        'import { defineMeta } from "blume";',
        "",
        "export default defineMeta({",
        '  title: "Guide",',
        '  icon: "book-open",',
        "});",
        "",
      ].join("\n")
    );
    expect(existsSync(join(root, "guide/.navigation.yml"))).toBe(false);
    // A key meta.ts can't hold keeps the original beside the new file.
    expect(existsSync(join(root, "hidden/meta.ts"))).toBe(true);
    expect(existsSync(join(root, "hidden/.navigation.yml"))).toBe(true);
  });

  it("leaves an H1 in code and a mid-line closer alone", async () => {
    const code = "```bash\n# not a heading\n```\n";
    const root = await site({
      "code.md": code,
      "midline.md": "::tip\nA :: mid-line is text.\n::\n",
    });

    runCodemod("--write", root);
    expect(await read(root, "code.md")).toBe(code);
    expect(await read(root, "midline.mdx")).toBe(
      ":::tip\nA :: mid-line is text.\n:::\n"
    );
  });

  it("leaves code, math, and multi-line tags intact, and keeps CRLF", async () => {
    const page = [
      "::note",
      "Call `` fn(`a{b}`) `` with { n }.",
      "  :::",
      "Text MDC showed after a stray closer.",
      "::",
      "",
      "```inline``` code is not a fence, { so this escapes }.",
      "",
      "A generic useTool<Input>() is text.",
      "",
      'A :badge[Beta]{color="warning"} badge.',
      "",
      "```vue [pages/[...slug\\].vue]",
      "<template />",
      "```",
      "",
      '<div class="frame">',
      "  <iframe",
      '    src="https://example.com" title="a > b"',
      "    allowfullscreen",
      "  ></iframe>",
      "</div>",
      "",
      "<img",
      '  src="/a.png"',
      '  alt="A">',
      "",
      "$$",
      "\\frac{a}{b} < c",
      "$$",
      "",
      "> ::tip",
      "> Quoted.",
      "> ::",
      "",
    ];
    const root = await site({
      "crlf.md": "---\r\ntitle: Win\r\n---\r\n\r\n::tip\r\nA { b }\r\n::\r\n",
      "page.md": page.join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "REVIEW line 32: an MDC block inside a blockquote isn't converted"
    );
    expect(await read(root, "page.mdx")).toBe(
      [
        // A colon line MDC showed as text would close a `:::` directive.
        "::::note",
        "Call `` fn(`a{b}`) `` with \\{ n \\}.",
        "  :::",
        "Text MDC showed after a stray closer.",
        "::::",
        "",
        "```inline``` code is not a fence, \\{ so this escapes \\}.",
        "",
        "A generic useTool&lt;Input>() is text.",
        "",
        'A <Badge variant="warning">Beta</Badge> badge.',
        "",
        '```vue title="pages/[...slug].vue"',
        "<template />",
        "```",
        "",
        ...page.slice(16, 23),
        "<img",
        '  src="/a.png"',
        '  alt="A" />',
        "",
        ...page.slice(27),
      ].join("\n")
    );
    expect(await read(root, "crlf.mdx")).toBe(
      "---\r\ntitle: Win\r\n---\r\n\r\n:::tip\r\nA \\{ b \\}\r\n:::\r\n"
    );
    expect(runCodemod(root)).toContain("0 would change");
  });

  it("keeps blocks with slots it can't map, and reads kebab-case props", async () => {
    const root = await site({
      "guide/.navigation.yml":
        "title: Top\r\nnavigation:\r\n  title: Guide # shown\r\n  icon: i-lucide-zap\r\n",
      "guide/slots.md": [
        "::card-group",
        '  :::card{title="Prop"}',
        "  #title",
        "  Slot title",
        "  #description",
        "  Hidden on the old site.",
        "  :::",
        "",
        "  :::card",
        "  #title",
        "  Two",
        "  #footer",
        "  Footer.",
        "  :::",
        "::",
        "",
        '::tabs{default-value="1"}',
        '  :::tabs-item{label="A"}',
        "  Body.",
        "  #extra",
        "  Extra.",
        "  :::",
        "::",
        "",
        '::collapsible{open-text="Display" name="options"}',
        "Rows.",
        "::",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "REVIEW line 2: card description: Nuxt UI's prose card renders neither"
    );
    expect(report).toContain(
      "REVIEW line 9: `::card` has a `#footer` slot this can't map: convert it by hand. It's left as written"
    );
    expect(report).toContain(
      "REVIEW line 18: `::tabs-item` has a `#extra` slot this can't map"
    );
    expect(await read(root, "guide/slots.mdx")).toBe(
      [
        "<CardGroup>",
        "",
        '<Card title="Slot title">',
        "",
        "Hidden on the old site.",
        "",
        "</Card>",
        "",
        ":::card",
        "#title",
        "Two",
        "#footer",
        "Footer.",
        ":::",
        "",
        "</CardGroup>",
        "",
        "<Tabs defaultTabIndex={1}>",
        "",
        ':::tabs-item{label="A"}',
        "Body.",
        "#extra",
        "Extra.",
        ":::",
        "",
        "</Tabs>",
        "",
        '<Expandable title="Display options">',
        "",
        "Rows.",
        "",
        "</Expandable>",
        "",
      ].join("\n")
    );
    // A `navigation:` map wins over the top-level title.
    expect(await read(root, "guide/meta.ts")).toContain(
      '  title: "Guide",\n  icon: "zap",'
    );
    expect(existsSync(join(root, "guide/.navigation.yml"))).toBe(false);
  });

  it("flags version folders and links that related can't hold", async () => {
    const links = Array.from({ length: 11 }, (_, i) => [
      `  - label: Link ${i}`,
      "    icon: i-lucide-link",
      `    to: /link-${i}`,
    ]).flat();
    const root = await site({
      "2.0/changes.md": [
        "---",
        "title: Changes",
        "links:",
        ...links,
        "  - label: Relative",
        "    icon: i-lucide-link",
        "    to: guide/setup",
        "---",
        "",
        "Body.",
        "",
      ].join("\n"),
    });

    const report = runCodemod("--write", root);
    expect(report).toContain(
      "`2.0`: Docus keeps a version name whole and Blume strips `2.`"
    );
    expect(report).toContain(
      "`links` has 12 entries and Blume's `related` holds at most 10"
    );
    expect(report).toContain(
      "`links` target `guide/setup`: Blume's `related` takes a root-relative path or a URL"
    );
  });

  it("writes nothing on a dry run, and reports JSON", async () => {
    const page = "::tip\nHi.\n::\n";
    const root = await site({ "page.md": page });

    expect(runCodemod(root)).toContain("1 would change");
    expect(await read(root, "page.md")).toBe(page);

    const json = JSON.parse(runCodemod("--json", root));
    expect(json.wrote).toBe(false);
    expect(json.iconsChecked).toBe(true);
    expect(json.files).toEqual([
      {
        changed: true,
        edits: { "callout → :::tip": 1 },
        file: "page.md",
        renamed: "page.mdx",
        reviews: [],
      },
    ]);
  });
});
