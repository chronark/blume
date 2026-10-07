import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
} from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency GitHub wiki codemod, run the way
// the skill runs it: a bare `node` over the repo-root copy (the package's
// `skills/` is a generated mirror of it), from the copy of the wiki clone.
const CODEMOD = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "github-wiki-codemod.mjs"
);

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

interface Run {
  status: number | null;
  stderr: string;
  stdout: string;
}

const runRaw = (cwd: string, ...args: string[]): Run => {
  const result = spawnSync("node", [CODEMOD, ...args], {
    cwd,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

const runCodemod = (cwd: string, ...args: string[]): string => {
  const result = runRaw(cwd, ...args);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
};

/** A fresh wiki clone holding `files` (path → text). */
const wiki = async (files: Record<string, string>): Promise<string> => {
  const root = mkdtempSync(join(tmpdir(), "blume-github-wiki-codemod-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(([file, text]) => {
      const target = join(root, file);
      mkdirSync(join(target, ".."), { recursive: true });
      return writeFile(target, text);
    })
  );
  return root;
};

const read = (root: string, file: string): Promise<string> =>
  readFile(join(root, file), "utf-8");

const readRoutes = async (
  root: string
): Promise<Record<string, string | null>> => {
  // SAFETY: the codemod writes wiki-routes.json as page name → route, URL, or null.
  const routes = JSON.parse(await read(root, "wiki-routes.json")) as Record<
    string,
    string | null
  >;
  return routes;
};

/** Every file under `root` (relative paths) with its text, for before/after comparisons. */
const snapshot = async (root: string): Promise<Record<string, string>> => {
  const files = readdirSync(root, { encoding: "utf-8", recursive: true })
    .filter((file) => statSync(join(root, file)).isFile())
    .toSorted((left, right) => left.localeCompare(right));
  const entries = await Promise.all(
    files.map(async (file) => [file, await read(root, file)] as const)
  );
  return Object.fromEntries(entries);
};

const REPO = ["--repo", "acme/widget"];

/** A built page holding headings with `ids`. */
const page = (ids: string[]): string =>
  `<main>${ids.map((id) => `<h2 id="${id}">x</h2>`).join("")}</main>`;

const LOGO_PNG = "PNG-bytes";

/** A small wiki with every case the convert tests read. */
const WIKI = {
  "Alerts.md": [
    "> [!NOTE]",
    "> Read this { carefully } with a <7 limit.",
    "> <!-- hidden -->",
    "",
    "> [!caution]",
    "> Danger.",
    "",
    "- item",
    "  > [!TIP]",
    "  > nested",
    "",
    "Text with {braces}, a <br> and <https://example.com>, and `{code}`.",
    "",
    '    { "key": "value" }',
    "",
    "Literal \\`{lit}\\` ticks.",
    "",
    "```TypeScript",
    "const x = { a: 1 };",
    "```",
    "",
    "```posh",
    "Get-Item",
    "```",
    "",
  ].join("\n"),
  "Converted.md": [
    'Pandoc wrote [here](Getting_Started "here") from MediaWiki,',
    String.raw`and \[\[the text\|Getting Started\]\] from Textile.`,
    "",
  ].join("\n"),
  "Dropped.md": "Can anyone see this?\n",
  "Getting-Started.md": [
    "# Getting started",
    "",
    "Body.",
    "",
    "# Install",
    "",
    "## Details",
    "",
    "Next part",
    "=========",
    "",
    "Two-line",
    "setext",
    "------",
    "",
  ].join("\n"),
  "Guide.md": [
    "# Guide",
    "",
    "Intro with [[Getting Started]], [[the setup|Getting-Started#install]], and [[ Mailing list | https://lists.example.com ]].",
    "A [[Missing Page]], [[Module: Battery]], [[Moved]], [[Pointer]], and [[Dropped]].",
    "",
    "`[[not a link]]` in code and <!-- [[Hidden]] --> in a comment.",
    "",
    "| a | b |",
    "| - | - |",
    String.raw`| [[Cell text\|Getting Started]] | x |`,
    "",
    "```bash",
    'if [[ $x == y ]]; then echo "[[Getting Started]]"; fi',
    "```",
    "",
    "~~~",
    "[[Getting Started]]",
    "~~~",
    "",
    "> ```sh",
    "> [[Getting Started]]",
    "> ```",
    "",
    "    [[Getting Started]] in indented code",
    "",
    "See [abs](https://github.com/Acme/Widget/wiki/Getting-Started#user-content-install), [root](/acme/widget/wiki/Getting-Started), [bare](Getting-Started), [home](https://github.com/acme/widget/wiki), [issue](../issues/12), [mirror](https://github.com/acme/widget-wiki/blob/master/Getting-Started.md#install), [ui](https://github.com/acme/widget/wiki/Getting-Started/_history), [gone](./Nowhere.md), and [top](#user-content-usage).",
    "",
    "Bare https://github.com/acme/widget/wiki/Getting-Started. and <https://github.com/acme/widget/wiki/Home>.",
    "",
    "![Logo](https://raw.githubusercontent.com/wiki/acme/widget/images/logo.png)",
    "[[images/logo.png|alt=Logo again|width=40]]",
    "![Broken](../../elsewhere/x.png)",
    "",
    '<img src="images/logo.png" width="200">',
    "",
    '<p><img src="images/logo.png" height="9"></p>',
    "",
    'Upload: ![shot](https://user-images.githubusercontent.com/1/2.png "shot")',
    "",
    '## Usage <a name="usage"></a>',
    "",
    "Hi :smile: and `:smile:`.",
    "",
    "## :smile: Smiles",
    "",
    "Setext section",
    "--------------",
    "",
    "[[_TOC_]]",
    "",
    "[1]: https://github.com/acme/widget/wiki/Getting-Started",
    "[1]: ./ignored.md",
    "",
    '[//begin]: # "Autogenerated link references for markdown compatibility"',
    '[Getting Started]: Getting-Started "x"',
    '[//end]: # "Autogenerated link references"',
    "",
  ].join("\n"),
  "Home.md": "Welcome. Start with [[Getting Started]].\n",
  "Legacy.mediawiki": "See [[Getting-Started|here]].\n",
  "Moved.md": "> ### This page has moved to https://example.com/moved\n",
  "Pointer.md":
    "This page has moved to https://github.com/acme/widget/wiki/Getting-Started#install\n",
  "README.md": "The mirror repo's readme.\n",
  "Zeta.md": "Last.\n",
  "_Footer.md":
    "### Want to contribute to this Wiki?\n\n[Fork it](https://github.com/acme/widget-wiki)\n",
  "_Sidebar.md": [
    "## [Website](https://acme.example)",
    "",
    "**Start**",
    "* [[Getting Started]]",
    "  * [[Alerts]]",
    "* [External](https://example.com/ext)",
    "* [[getting started]]",
    "",
    "**Reference**",
    "* Topics",
    "  * [Guide](https://github.com/acme/widget/wiki/Guide)",
    "* [[Home]]",
    "",
  ].join("\n"),
  "alpha.md": "First.\n",
  "images/logo.png": LOGO_PNG,
  "images/unused.png": "unused",
  "sub/README.md": "Shadowed.\n",
};

const EMOJI = JSON.stringify({
  smile:
    "https://github.githubassets.com/images/icons/emoji/unicode/1f604.png?v8",
});

/** The wiki with its route table written and classified. */
const classifiedWiki = async (): Promise<string> => {
  const root = await wiki({ ...WIKI, "emoji.json": EMOJI });
  runCodemod(root, "routes", ...REPO, "--write");
  const routes = await readRoutes(root);
  routes.Moved = "https://example.com/moved";
  routes.Pointer = "/getting-started#install";
  routes.Dropped = null;
  routes.README = null;
  await writeFile(
    join(root, "wiki-routes.json"),
    `${JSON.stringify(routes, null, 2)}\n`
  );
  return root;
};

describe("github-wiki-codemod routes", () => {
  it("names pages the way GitHub serves them and suggests what to classify", async () => {
    const root = await wiki({
      ...WIKI,
      "'this'-in-Widget.md": "This.\n",
      "5.0-Release-Notes.md": "Notes.\n",
      "Roadmap\u{2010}2021.md": "Plans.\n",
      "Spec conformance testing.md": "## This page is deprecated\n",
      "_ [obsolete] Notes.md": "Old notes.\n",
      "_Sidebar.html.md": "Not a page.\n",
      "scripts/fixtures/input.md": "# Fixture\n\nWith [a link](x).\n",
      "tsconfig.json.md": "Config.\n",
    });
    const report = runCodemod(root, "routes", ...REPO);
    expect(existsSync(join(root, "wiki-routes.json"))).toBe(false);
    expect(report).toContain("sub/README.md (GitHub served README.md)");
    expect(report).toContain('"Moved": "https://example.com/moved"');
    expect(report).toContain('"Pointer": "/getting-started#install"');
    expect(report).toContain('"README": null  (README.md)');
    expect(report).toContain('"input": null  (scripts/fixtures/input.md)');
    expect(report).toContain('"Dropped": null  (Dropped.md)');
    expect(report).toContain("5.0-Release-Notes → /5-0-release-notes");
    expect(report).toContain("Legacy.mediawiki");

    runCodemod(root, "routes", ...REPO, "--write");
    const routes = await readRoutes(root);
    expect(routes.Home).toBe("/");
    expect(routes["Spec-conformance-testing"]).toBe(
      "/spec-conformance-testing"
    );
    expect(routes["Roadmap\u{2010}2021"]).toBe("/roadmap-2021");
    expect(routes["'this'-in-Widget"]).toBe("/this-in-widget");
    expect(routes["tsconfig.json"]).toBe("/tsconfig-json");
    expect(routes["_-[obsolete]-Notes"]).toBe("/obsolete-notes");
    expect(routes.Legacy).toBe("/legacy");
    expect(Object.keys(routes)).not.toContain("_Sidebar.html");
    expect(Object.keys(routes)).not.toContain("_Sidebar");
    // SAFETY: wiki-files.json maps page name → file.
    const sources = JSON.parse(await read(root, "wiki-files.json")) as Record<
      string,
      string
    >;
    expect(sources.README).toBe("README.md");
    expect(sources.input).toBe("scripts/fixtures/input.md");

    routes.Moved = "https://example.com/moved";
    await writeFile(join(root, "wiki-routes.json"), JSON.stringify(routes));
    await writeFile(join(root, "New-Page.md"), "New.\n");
    const again = runCodemod(root, "routes", ...REPO, "--write");
    expect(again).toContain("wiki-routes.json exists, so nothing was written");
    expect(again).toContain("not in wiki-routes.json: New-Page (New-Page.md)");
    const kept = await readRoutes(root);
    expect(kept.Moved).toBe("https://example.com/moved");
  });
});

describe("github-wiki-codemod convert", () => {
  it("leaves the project alone on a dry run", async () => {
    const root = await classifiedWiki();
    const before = await snapshot(root);
    const report = runCodemod(root, "convert", ...REPO);
    expect(report).toContain("would convert");
    expect(await snapshot(root)).toEqual(before);
  });

  it("converts wiki links outside code, with the text first", async () => {
    const root = await classifiedWiki();
    const report = runCodemod(
      root,
      "convert",
      ...REPO,
      "--mirror",
      "acme/widget-wiki",
      "--emoji",
      "emoji.json",
      "--write"
    );
    const guide = matter(
      await read(root, "docs/(reference)/(topics)/guide.md")
    );
    expect(guide.data).toEqual({ title: "Guide" });
    const body = guide.content;
    expect(body).not.toContain("# Guide");
    expect(body).toContain(
      "Intro with [Getting Started](/getting-started), [the setup](/getting-started#install), and [Mailing list](https://lists.example.com)."
    );
    expect(body).toContain(
      "A Missing Page, Module: Battery, [Moved](https://example.com/moved), [Pointer](/getting-started#install), and Dropped."
    );
    expect(body).toContain("| [Cell text](/getting-started) | x |");
    // Code and comments keep their brackets.
    expect(body).toContain(
      "`[[not a link]]` in code and <!-- [[Hidden]] --> in a comment."
    );
    expect(body).toContain(
      'if [[ $x == y ]]; then echo "[[Getting Started]]"; fi'
    );
    expect(body).toContain("~~~\n[[Getting Started]]\n~~~");
    expect(body).toContain("> ```sh\n> [[Getting Started]]\n> ```");
    expect(body).toContain("    [[Getting Started]] in indented code");
    expect(body).not.toContain("[[_TOC_]]");
    expect(report).toContain("[[wiki link]] Missing Page names no page");
    expect(report).toContain("[[wiki link]] Dropped names a page you left out");
  });

  it("rewrites links to the wiki, keeps or fixes anchors, and reports broken ones", async () => {
    const root = await classifiedWiki();
    const report = runCodemod(
      root,
      "convert",
      ...REPO,
      "--mirror",
      "acme/widget-wiki",
      "--write"
    );
    const body = await read(root, "docs/(reference)/(topics)/guide.md");
    expect(body).toContain("[abs](/getting-started#install)");
    expect(body).toContain("[root](/getting-started)");
    expect(body).toContain("[bare](/getting-started)");
    expect(body).toContain("[home](/)");
    expect(body).toContain("[issue](https://github.com/acme/widget/issues/12)");
    expect(body).toContain("[mirror](/getting-started#install)");
    expect(body).toContain(
      "[ui](https://github.com/acme/widget/wiki/Getting-Started/_history)"
    );
    expect(body).toContain("[gone](./Nowhere.md)");
    expect(body).toContain("[top](#usage)");
    expect(body).toContain(
      "Bare [Getting Started](/getting-started). and [Home](/)."
    );
    expect(report).toContain("points at the wiki's UI");
    expect(report).toContain(
      "Nowhere.md names no page in the wiki, so it was broken on GitHub too"
    );
    // The first definition of a label wins; the shadowed one and the Foam block go.
    expect(body).toContain("[1]: /getting-started");
    expect(body).not.toContain("ignored.md");
    expect(body).not.toContain("Autogenerated");
    // Pandoc output: MediaWiki's target-first links, and escaped wiki links.
    const converted = await read(root, "docs/(more)/converted.md");
    expect(converted).toContain("Pandoc wrote [here](/getting-started) from");
    expect(converted).toContain(
      "and [the text](/getting-started) from Textile."
    );
    // A .mediawiki page isn't touched: its links put the target first.
    expect(report).toContain("Not Markdown: convert to Markdown first");
    expect(await read(root, "Legacy.mediawiki")).toBe(
      "See [[Getting-Started|here]].\n"
    );
  });

  it("moves wiki images beside the pages and drops ones GitHub couldn't show", async () => {
    const root = await classifiedWiki();
    const report = runCodemod(root, "convert", ...REPO, "--write");
    const body = await read(root, "docs/(reference)/(topics)/guide.md");
    expect(body).toContain("![Logo](../../images/logo.png)");
    expect(body).toContain("![Logo again](../../images/logo.png)");
    expect(body).not.toContain("Broken");
    expect(body).toContain("\n![](../../images/logo.png)\n");
    expect(body).toContain('<p><img src="images/logo.png" height="9"></p>');
    expect(await read(root, "docs/images/logo.png")).toBe(LOGO_PNG);
    expect(existsSync(join(root, "images/logo.png"))).toBe(false);
    expect(existsSync(join(root, "images/unused.png"))).toBe(true);
    expect(report).toContain("image options dropped: width=40");
    expect(report).toContain("dropped width=200");
    expect(report).toContain(
      "pointed at nothing on GitHub (above the wiki root)"
    );
    // A raw `src` reads from the wiki root, not the page's new folder.
    expect(report).toContain(
      'raw <img src="images/logo.png"> shows a file stored in the wiki: copy it to docs/images/logo.png and point src at ../../images/logo.png'
    );
    expect(report).toContain("uploaded attachment https://user-images");
    expect(report).toContain("images/unused.png");
  });

  it("titles pages by name, demotes body H1s, and pins named anchors", async () => {
    const root = await classifiedWiki();
    const report = runCodemod(
      root,
      "convert",
      ...REPO,
      "--emoji",
      "emoji.json",
      "--write"
    );
    const started = matter(
      await read(root, "docs/(start)/getting-started/index.md")
    );
    expect(started.data).toEqual({ title: "Getting Started" });
    expect(started.content.trim().split("\n")).toEqual([
      "Body.",
      "",
      "## Install",
      "",
      "### Details",
      "",
      "## Next part",
      "",
      "Two-line",
      "setext",
      "------",
    ]);
    expect(report).toContain("a 2-line setext heading can't be demoted");
    const guide = await read(root, "docs/(reference)/(topics)/guide.md");
    expect(guide).toContain("## Usage [#usage]");
    expect(guide).toContain("Hi 😄 and `:smile:`.");
    expect(guide).toContain("## :smile: Smiles");
    expect(guide).toContain("Setext section\n--------------");
    expect(report).toContain("in a heading: GitHub's id spelled the name");
  });

  it("converts alerts and makes the page MDX-safe", async () => {
    const root = await classifiedWiki();
    const report = runCodemod(root, "convert", ...REPO, "--write");
    expect(existsSync(join(root, "Alerts.md"))).toBe(false);
    const alerts = matter(
      await read(root, "docs/(start)/getting-started/alerts.mdx")
    );
    expect(alerts.data).toEqual({ slug: "alerts", title: "Alerts" });
    expect(alerts.content.trim().split("\n")).toEqual([
      ":::note",
      String.raw`Read this \{ carefully \} with a &lt;7 limit.`,
      "{/* hidden */}",
      ":::",
      "",
      ":::danger",
      "Danger.",
      ":::",
      "",
      "- item",
      "  > [!TIP]",
      "  > nested",
      "",
      String.raw`Text with \{braces\}, a <br /> and [https://example.com](https://example.com), and ${"`{code}`"}.`,
      "",
      "```",
      '{ "key": "value" }',
      "```",
      "",
      "Literal \\`\\{lit\\}\\` ticks.",
      "",
      "```typescript",
      "const x = { a: 1 };",
      "```",
      "",
      "```powershell",
      "Get-Item",
      "```",
    ]);
    expect(report).toContain(
      "indented or lazy GitHub alert kept: a callout in .mdx"
    );
  });

  it("keeps the alerts it can't rewrite as alerts, which make the page MDX", async () => {
    const root = await wiki({
      "Home.md": "Hi.\n",
      "Lazy.md": ["> [!NOTE]", "lazy line", ""].join("\n"),
      "Odd.md": ["> [!TIP] Title", "> Body.", "", "> [!WARNING]", ">", ""].join(
        "\n"
      ),
    });
    runCodemod(root, "routes", ...REPO, "--write");
    const report = runCodemod(root, "convert", ...REPO, "--write");
    expect(matter(await read(root, "docs/lazy.mdx")).content.trim()).toBe(
      "> [!NOTE]\nlazy line"
    );
    // Text after the marker, or no body: left for a hand, so the page stays .md.
    expect(matter(await read(root, "docs/odd.md")).content.trim()).toBe(
      "> [!TIP] Title\n> Body.\n\n> [!WARNING]\n>"
    );
    expect(report).toContain(
      "a GitHub alert with text after its marker: convert it by hand"
    );
    expect(report).toContain(
      "a GitHub alert with no body lines: convert it by hand"
    );
  });

  it("builds folders and meta.ts from _Sidebar.md", async () => {
    const root = await classifiedWiki();
    const report = runCodemod(root, "convert", ...REPO, "--write");
    expect(await read(root, "docs/index.md")).toBe(
      "---\ntitle: Home\n---\n\nWelcome. Start with [Getting Started](/getting-started).\n"
    );
    expect(await read(root, "docs/meta.ts")).toBe(
      [
        'import { defineMeta } from "blume";',
        "",
        "export default defineMeta({",
        "  pages: [",
        '    "start",',
        '    "reference",',
        '    "more",',
        "  ],",
        "});",
        "",
      ].join("\n")
    );
    const start = await read(root, "docs/(start)/meta.ts");
    expect(start).toContain('title: "Start"');
    expect(start).toContain('"getting-started"');
    const nested = await read(root, "docs/(start)/getting-started/meta.ts");
    expect(nested).toContain('title: "Getting Started"');
    expect(nested).toContain('display: "group"');
    expect(nested).toContain('"alerts"');
    const topics = await read(root, "docs/(reference)/(topics)/meta.ts");
    expect(topics).toContain('title: "Topics"');
    expect(topics).toContain('"guide"');
    expect(existsSync(join(root, "docs/(reference)/(topics)/guide.md"))).toBe(
      true
    );
    const more = await read(root, "docs/(more)/meta.ts");
    expect(more).toContain('title: "More pages"');
    expect(more).toContain("collapsed: true");
    expect(more.indexOf('"alpha"')).toBeLessThan(more.indexOf('"zeta"'));
    expect(report).toContain(
      'navigation.featured for blume.config.ts:\n  [{"href":"https://acme.example","label":"Website"},{"href":"https://example.com/ext","label":"External"}]'
    );
    expect(report).toContain("Getting-Started is already placed");
    expect(report).toContain("Home is the home page");
    expect(report).toContain("_Footer.md: ### Want to contribute");
    expect(report).toContain("Moved.md (moved notice)");
    expect(report).toContain("README.md (left out)");
    expect(report).toContain("sub/README.md (never served");
  });

  it("is idempotent", async () => {
    const root = await classifiedWiki();
    runCodemod(root, "convert", ...REPO, "--write");
    const first = await snapshot(root);
    const again = runCodemod(root, "convert", ...REPO, "--write");
    expect(again).toContain("0 page(s) converted, 7 already converted.");
    expect(await snapshot(root)).toEqual(first);
  });

  it("fails clearly without --repo or a route table", async () => {
    const root = await wiki({ "Home.md": "Hi.\n" });
    const noRepo = runRaw(root, "convert");
    expect(noRepo.status).toBe(1);
    expect(noRepo.stderr).toContain("convert needs --repo <owner/repo>");
    const noTable = runRaw(root, "convert", ...REPO);
    expect(noTable.status).toBe(1);
    expect(noTable.stderr).toContain("run `routes --write` first");
  });
});

/** A wiki written for the ways GitHub renders `[[…]]` that a line-by-line regex gets wrong. */
const EDGE_WIKI = {
  "Edges.md": [
    "Code <code>[[Topic]]</code>, <tt>[[Topic]]</tt>, and <kbd>[[Topic]]</kbd>.",
    "Escaped '[[Topic]] stays, quoted '[[Topic]]' converts.",
    "Brackets [[run[.*]|Topic]], a file [[The spec|files/spec.pdf]], and [[Topic|the topic]].",
    String.raw`Pandoc's \[\[Topic\]\] too.`,
    "",
    "# Section",
    "",
    "<div>",
    "# Not a heading",
    "[[Topic]] and https://github.com/acme/widget/wiki/Topic in HTML",
    "[[images/logo.png|alt=Logo]] in HTML",
    "</div>",
    "",
    "After the block, [[Topic]] is Markdown.",
    "",
    "Images [[/images/logo.png|alt=Root]] [[images/logo.png|align=center,frame,alt=Framed]] [[images/logo.png|A caption]].",
    "",
    "Raw [file](Speed_Dial/Speed_Dial.md) and [folder page](speed_dial).",
    "",
  ].join("\n"),
  "Home.md": "Hi.\n",
  "Speed_Dial/Speed_Dial.md": "Dial.\n",
  "Topic.md": "Topic.\n",
  "_Sidebar.md": [
    "## [Guide](https://github.com/acme/widget/wiki/guide)",
    "* [[Topic]]",
    "",
  ].join("\n"),
  "files/spec.pdf": "PDF",
  "guide.md": "Guide.\n",
  "images/logo.png": LOGO_PNG,
  "sub/Nested.md": "Beside it: [[pic.png|alt=Pic]].\n",
  "sub/pic.png": LOGO_PNG,
};

describe("github-wiki-codemod convert edge cases", () => {
  it("leaves wiki links GitHub showed as text, and writes HTML links inside HTML blocks", async () => {
    const root = await wiki(EDGE_WIKI);
    runCodemod(root, "routes", ...REPO, "--write");
    const report = runCodemod(root, "convert", ...REPO, "--write");
    const body = await read(root, "docs/(more)/edges.md");
    expect(body).toContain(
      "Code <code>[[Topic]]</code>, <tt>[[Topic]]</tt>, and <kbd>[Topic](/topic)</kbd>."
    );
    expect(body).toContain(
      "Escaped '[[Topic]] stays, quoted '[Topic](/topic)' converts."
    );
    expect(report).toContain("'[[Topic]] is gollum's escape");
    expect(body).toContain(
      "Brackets [run[.*]](/topic), a file [[The spec|files/spec.pdf]], and Topic."
    );
    expect(report).toContain(
      "links files/spec.pdf, a file stored in the wiki: copy it to public/"
    );
    expect(report).toContain(
      "the topic names no page in the wiki: made plain text (Topic is a page"
    );
    expect(body).toContain("Pandoc's [Topic](/topic) too.");
    expect(report).toContain("read as a wiki link (pandoc's escape)");
    // Markdown inside an HTML block shows as text, and its `#` isn't a heading.
    expect(body).toContain(
      [
        "## Section",
        "",
        "<div>",
        "# Not a heading",
        '<a href="/topic">Topic</a> and <a href="/topic">Topic</a> in HTML',
        "![Logo](../images/logo.png) in HTML",
        "</div>",
        "",
        "After the block, [Topic](/topic) is Markdown.",
      ].join("\n")
    );
    // Blume adds deployment.base to a raw root path too, so nothing to do.
    expect(report).not.toContain("deployment.base");
    expect(report).toContain(
      '[[images/logo.png]] sits in an HTML block, where a Markdown image shows as text: write it as <img src="../images/logo.png" />'
    );
    expect(body).toContain(
      "Images ![Root](../images/logo.png) ![Framed](../images/logo.png) ![](../images/logo.png)."
    );
    expect(report).toContain("image options dropped: align=center, frame");
    expect(report).toContain("image options dropped: A caption");
    expect(body).toContain(
      "Raw [file](/speed-dial) and [folder page](/speed-dial)."
    );
    expect(report).toContain(
      "Speed_Dial/Speed_Dial.md opened the page's raw file on GitHub"
    );
    const nested = await read(root, "docs/(more)/nested.md");
    expect(nested).toContain("Beside it: ![Pic](../sub/pic.png).");
    expect(report).toContain("found only in the page's folder (sub/)");
  });

  it("reads lines of many quote markers in linear time", async () => {
    // A pattern that could split the spaces around each `>` two ways doubled
    // its work per marker, and these lines (neither heading nor fence) hung it.
    const root = await wiki({
      "Home.md": `>${" >".repeat(40)} text\n\n>${"\t>".repeat(40)} text\n`,
    });
    runCodemod(root, "routes", ...REPO, "--write");
    const result = spawnSync("node", [CODEMOD, "convert", ...REPO, "--write"], {
      cwd: root,
      encoding: "utf-8",
      timeout: 4000,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("is idempotent when a page's folder shares its name", async () => {
    const root = await wiki(EDGE_WIKI);
    runCodemod(root, "routes", ...REPO, "--write");
    runCodemod(root, "convert", ...REPO, "--write");
    expect(existsSync(join(root, "docs/guide/meta.ts"))).toBe(true);
    const first = await snapshot(root);
    runCodemod(root, "convert", ...REPO, "--write");
    expect(await snapshot(root)).toEqual(first);
  });
});

describe("github-wiki-codemod stubs and check", () => {
  it("replaces every page with a link to its new URL, once", async () => {
    const root = await classifiedWiki();
    await writeFile(join(root, "sub", "_Sidebar.md"), "Folder sidebar.\n");
    const dry = runCodemod(root, "stubs", "--site", "https://docs.acme.dev/");
    expect(dry).toContain("Would change");
    expect(await read(root, "Guide.md")).toContain("# Guide");

    const report = runCodemod(
      root,
      "stubs",
      "--site",
      "https://docs.acme.dev/",
      "--write"
    );
    expect(await read(root, "Guide.md")).toBe(
      "**This page has moved to <https://docs.acme.dev/guide>.**\n"
    );
    expect(await read(root, "Home.md")).toBe(
      "**This page has moved to <https://docs.acme.dev/>.**\n"
    );
    expect(await read(root, "Moved.md")).toBe(
      "**This page has moved to <https://example.com/moved>.**\n"
    );
    expect(await read(root, "Legacy.md")).toBe(
      "**This page has moved to <https://docs.acme.dev/legacy>.**\n"
    );
    expect(existsSync(join(root, "Legacy.mediawiki"))).toBe(false);
    expect(await read(root, "Dropped.md")).toBe("Can anyone see this?\n");
    expect(await read(root, "_Sidebar.md")).toBe(
      "**The docs have moved to <https://docs.acme.dev>.**\n"
    );
    expect(existsSync(join(root, "_Footer.md"))).toBe(false);
    expect(existsSync(join(root, "sub", "_Sidebar.md"))).toBe(false);
    expect(report).toContain("Left as they are (entries set to null)");

    const before = await snapshot(root);
    const again = runCodemod(
      root,
      "stubs",
      "--site",
      "https://docs.acme.dev",
      "--write"
    );
    expect(again).not.toContain("Changed");
    expect(await snapshot(root)).toEqual(before);
    // The user pushes the stubs; the script only writes files.
    expect(report).toContain("Nothing was committed or pushed");
  });

  it("writes local files only, and refuses to run in the Blume project", async () => {
    const source = await readFile(CODEMOD, "utf-8");
    const imports = [
      ...source.matchAll(/^(?:import .*|\}) from "(?<from>[^"]+)";$/gmu),
    ]
      .map((match) => match.groups?.from)
      .toSorted();
    expect(imports).toEqual(["node:fs", "node:path"]);
    expect(source).not.toMatch(/\bfetch\(|child_process|import\(/u);

    const root = await classifiedWiki();
    await writeFile(join(root, "blume.config.ts"), "export default {};\n");
    const refused = runRaw(
      root,
      "stubs",
      "--site",
      "https://docs.acme.dev",
      "--write"
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("runs in a fresh clone of the wiki");
    expect(await read(root, "Guide.md")).toContain("# Guide");
  });

  it("puts only a notice on Home and the sidebar with --notice-only", async () => {
    const root = await classifiedWiki();
    runCodemod(
      root,
      "stubs",
      "--site",
      "https://docs.acme.dev",
      "--notice-only",
      "--write"
    );
    expect(await read(root, "Home.md")).toBe(
      "**The docs have moved to <https://docs.acme.dev>.**\n\nWelcome. Start with [[Getting Started]].\n"
    );
    const sidebar = await read(root, "_Sidebar.md");
    expect(
      sidebar.startsWith(
        "**The docs have moved to <https://docs.acme.dev>.**\n\n## [Website]"
      )
    ).toBe(true);
    expect(await read(root, "Guide.md")).toContain("# Guide");
  });

  it("checks the table and old URLs against the build", async () => {
    const root = await classifiedWiki();
    runCodemod(root, "convert", ...REPO, "--write");
    const dist = {
      "dist/alerts/index.html": page([]),
      "dist/alpha/index.html": page([]),
      "dist/converted/index.html": page([]),
      "dist/getting-started/index.html": page(["install", "next-part"]),
      "dist/guide/index.html": page(["usage", "common-bugs-that-arent-bugs"]),
      "dist/index.html": page([]),
      "dist/legacy/index.html": page([]),
      "dist/zeta/index.html": page([]),
    };
    await Promise.all(
      Object.entries(dist).map(([file, html]) => {
        mkdirSync(join(root, file, ".."), { recursive: true });
        return writeFile(join(root, file), html);
      })
    );
    expect(runCodemod(root, "check")).toContain("0 problem(s).");

    const urls = runRaw(
      root,
      "check",
      "https://github.com/acme/widget/wiki/Guide#common-bugs",
      "https://github.com/Acme/Widget/wiki/Getting-Started#user-content-install",
      "https://github.com/acme/widget/wiki/Moved",
      "https://github.com/acme/widget/wiki/Nope",
      "https://github.com/acme/widget/wiki"
    );
    expect(urls.status).toBe(1);
    expect(urls.stdout).toContain(
      "MISSING ANCHOR  https://github.com/acme/widget/wiki/Guide#common-bugs → /guide#common-bugs (ids like: common-bugs-that-arent-bugs)"
    );
    expect(urls.stdout).toContain(
      "ok  https://github.com/Acme/Widget/wiki/Getting-Started#user-content-install → /getting-started#install"
    );
    expect(urls.stdout).toContain(
      "moved  https://github.com/acme/widget/wiki/Moved → https://example.com/moved"
    );
    expect(urls.stdout).toContain(
      "MISSING  https://github.com/acme/widget/wiki/Nope"
    );
    expect(urls.stdout).toContain(
      "ok  https://github.com/acme/widget/wiki → /"
    );
    expect(urls.stdout).toContain("2 problem(s).");

    // A server build keeps its pages in dist/client.
    await rename(join(root, "dist"), join(root, "client"));
    mkdirSync(join(root, "dist", "server"), { recursive: true });
    await rename(join(root, "client"), join(root, "dist", "client"));
    expect(runCodemod(root, "check")).toContain("0 problem(s).");
  });
});
