import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency ReadMe codemod, run the way the
// skill runs it: a bare `node` over the repo-root copy (the package's
// `skills/` is a generated mirror of it).
const SCRIPTS = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts"
);
const CODEMOD = join(SCRIPTS, "readme-codemod.mjs");

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

const project = async (files: Record<string, string>): Promise<string> => {
  const root = mkdtempSync(join(tmpdir(), "blume-readme-codemod-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([relative, content]) => {
      const file = join(root, relative);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    })
  );
  return root;
};

const run = (...args: string[]): string => {
  const result = spawnSync("node", [CODEMOD, ...args], { encoding: "utf-8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
};

const read = (root: string, relative: string): string =>
  readFileSync(join(root, relative), "utf-8");

const front = (root: string, relative: string) =>
  matter(read(root, relative)).data;

const body = (root: string, relative: string): string =>
  matter(read(root, relative)).content;

const page = (fm: string[], ...lines: string[]): string =>
  ["---", ...fm, "---", ...lines, ""].join("\n");

describe("readme-codemod", () => {
  it("moves a synced project into Blume's layout and keeps ReadMe's URLs", async () => {
    const root = await project({
      "changelogs/12-05-2022.md": page(
        [
          "title: May '22",
          "author: Jo",
          "hidden: false",
          "published_at: '2022-05-11T21:49:53.899Z'",
          "type: added",
        ],
        "Released."
      ),
      "custom_pages/_order.yaml": "- landing\n",
      "custom_pages/landing.md": page(
        ["title: Landing", "fullscreen: true", "hidden: false"],
        "Welcome."
      ),
      "docs/Getting Started/_order.yaml": "- intro\n- parent\n- empty\n",
      "docs/Getting Started/empty/_order.yaml": "- leaf\n",
      "docs/Getting Started/empty/index.md": page(["title: Empty parent"]),
      "docs/Getting Started/empty/leaf.md": page(["title: Leaf"], "Leaf."),
      "docs/Getting Started/intro.md": page(
        [
          "title: Intro",
          "excerpt: >-",
          "  A folded",
          "  excerpt.",
          "deprecated: false",
          "hidden: true",
          "icon: fad fa-rocket-launch",
          "metadata:",
          "  title: ''",
          "  description: 'SEO: description'",
          "  keywords: alpha, beta",
          "  robots: noindex",
          "next:",
          "  description: ''",
          "  pages:",
          "    - type: basic",
          "      slug: leaf",
          "      title: Leaf",
          "    - type: basic",
          "      slug: gone",
          "      title: Gone",
          "    - type: link",
          '      title: "Status"',
          "      url: https://status.example.com",
        ],
        "Intro."
      ),
      "docs/Getting Started/parent/_order.yaml": "- child\n",
      "docs/Getting Started/parent/child.md": page(["title: Child"], "Child."),
      "docs/Getting Started/parent/index.md": page(
        ["title: Parent page"],
        "Parent."
      ),
      "docs/_order.yaml": "- Getting Started\n",
    });

    const dry = run(root);
    expect(dry).toContain("Would apply (dry run");
    expect(existsSync(join(root, "docs/Getting Started/intro.md"))).toBe(true);

    run("--write", root);
    expect(existsSync(join(root, "docs/Getting Started"))).toBe(false);
    expect(front(root, "docs/(Getting Started)/intro.mdx")).toEqual({
      description: "A folded excerpt.",
      hidden: true,
      icon: "rocket",
      noindex: true,
      related: ["/docs/leaf", { Status: "https://status.example.com" }],
      search: { exclude: true, keywords: ["alpha", "beta"] },
      seo: { description: "SEO: description" },
      title: "Intro",
    });
    // Nested pages keep ReadMe's flat URL; a page directly in a category
    // already has it.
    expect(front(root, "docs/(Getting Started)/parent/child.mdx").slug).toBe(
      "docs/child"
    );
    expect(front(root, "docs/(Getting Started)/empty/leaf.mdx").slug).toBe(
      "docs/leaf"
    );
    expect(
      front(root, "docs/(Getting Started)/parent/index.mdx").slug
    ).toBeUndefined();
    // The empty parent goes, and its URL answers with its first child.
    expect(
      existsSync(join(root, "docs/(Getting Started)/empty/index.mdx"))
    ).toBe(false);
    const redirects = JSON.parse(read(root, "readme-redirects.json"));
    expect(redirects).toContainEqual({
      from: "/docs/empty",
      status: 302,
      to: "/docs/leaf",
    });
    expect(redirects).toContainEqual({
      from: "/docs",
      status: 302,
      to: "/docs/intro",
    });
    expect(redirects).toContainEqual({
      from: "/changelog.rss",
      to: "/changelog/rss.xml",
    });

    expect(read(root, "docs/meta.ts")).toContain('pages: ["Getting Started"]');
    expect(read(root, "docs/(Getting Started)/meta.ts")).toContain(
      'pages: ["intro","parent","empty"]'
    );
    const parentMeta = read(root, "docs/(Getting Started)/parent/meta.ts");
    expect(parentMeta).toContain('title: "Parent page"');
    expect(parentMeta).toContain('display: "group"');
    expect(read(root, "docs/(Getting Started)/empty/meta.ts")).toContain(
      'title: "Empty parent"'
    );
    expect(existsSync(join(root, "docs/_order.yaml"))).toBe(false);

    // A digit-led stem is pinned, a date like this one included.
    expect(front(root, "changelog/12-05-2022.mdx")).toEqual({
      authors: "Jo",
      changelog: { category: "Added" },
      // An unquoted YAML date, which Blume normalizes.
      date: new Date("2022-05-11"),
      slug: "changelog/12-05-2022",
      title: "May '22",
      type: "changelog",
    });
    expect(front(root, "page/landing.mdx")).toEqual({
      hidden: true,
      mode: "custom",
      title: "Landing",
    });

    // Idempotent.
    expect(run("--write", root)).toContain("Nothing to change.");
  });

  it("rewrites ReadMe syntax in page bodies", async () => {
    const root = await project({
      "docs/Guides/_order.yaml": "- page\n- other\n",
      "docs/Guides/other.md": page(["title: Other"], "Other."),
      "docs/Guides/page.md": page(
        ["title: Page"],
        "# Page",
        "",
        "# Overview",
        "",
        "> 📘 Heads up",
        ">",
        "> Read [this](doc:other) and [that](https://docs.acme.example/docs/other#/).",
        "",
        "> 🚧",
        "> No title here.",
        "",
        "> **👋** A plain quote.",
        "",
        '<Callout icon="📘" theme="info">',
        "  ### Note",
        "",
        "  Body.",
        "</Callout>",
        "",
        '<Callout theme="warn">',
        "  **Bold lead**",
        "",
        "  More.",
        "</Callout>",
        "",
        '<Callout type="tip">Blume\'s own.</Callout>',
        "",
        '<Image align="center" alt={1037} caption="A diagram" src="https://files.readme.io/abc1234-flow.png" />',
        "",
        '<Image src="https://files.readme.io/def5678-My_Chart.png">The chart</Image>',
        "",
        '![1544](https://files.readme.io/aaa1111-screen.png "image (1).png")',
        "",
        '<Embed typeOfEmbed="youtube" url="https://www.google.com/sorry/index?continue=https://www.youtube.com/watch%3Fv%3DAsQl_IlcWRM&q=x" />',
        "",
        '<Table align={["left","left"]}>',
        "  <thead>",
        "    <tr>",
        "      <th>Name</th>",
        "      <th>Notes</th>",
        "    </tr>",
        "  </thead>",
        "  <tbody>",
        "    <tr>",
        "      <td>`id`</td>",
        "      <td>",
        "        First line.",
        "",
        "        Second | line.",
        "      </td>",
        "    </tr>",
        "    <tr>",
        "      <td></td>",
        "      <td></td>",
        "    </tr>",
        "  </tbody>",
        "</Table>",
        "",
        "<Cards columns={3}>",
        '  <Card title="Start" icon="fa-rocket" href="doc:other" iconColor="#ff0066">',
        "    Go.",
        "  </Card>",
        '  <Card title="Source" icon="fab fa-github" href="https://github.com/acme/sdk">',
        "    Code.",
        "  </Card>",
        "</Cards>",
        "",
        '<Accordion title="One" icon="fa-info-circle">',
        "  First.",
        "</Accordion>",
        "",
        '<Accordion title="Two">',
        "  Second.",
        "</Accordion>",
        "",
        "Lone:",
        "",
        '<Accordion title="Solo">',
        "  Alone.",
        "</Accordion>",
        "",
        "Lone with an icon:",
        "",
        '<Accordion title="Iconic" icon="fa-bolt">',
        "  Kept.",
        "</Accordion>",
        "",
        "> ℹ Bare",
        "> No variation selector.",
        "",
        "Ask about <Glossary>CDR</Glossary> and <<glossary:TA>>. Hi {user.name}, <<apiKey>>. :tada: `:tada:`",
        "",
        "Line<br>break",
        "",
        "```javascript Node SDK",
        "const a = 1;",
        "```",
        "```python",
        "a = 1",
        "```",
        "",
        "```bash",
        "# a shell comment, not a heading",
        "curl https://api.example.com",
        "```",
        "",
        "<HTMLBlock>{`",
        '<div class="box"><!-- note --><img src="/x.png"><p>{curly}</p></div>',
        "`}</HTMLBlock>",
        "",
        "<HTMLBlock>{`",
        "<style>p { color: red; }</style>",
        "`}</HTMLBlock>",
        "",
        "<button onClick={() => open()}>Help</button>",
        "",
        "> ❗️ Last line without a newline"
      ).trimEnd(),
    });
    await writeFile(
      join(root, "glossary.json"),
      JSON.stringify([
        { definition: "Consumer Data Right", term: "CDR" },
        { definition: "Trusted Advisor", term: "TA" },
      ])
    );

    const report = run(
      "--write",
      "--site",
      "https://docs.acme.example",
      "--glossary",
      join(root, "glossary.json"),
      root
    );
    const text = body(root, "docs/(Guides)/page.mdx");

    // The H1 repeating the title goes; the others move down a level, but not
    // a comment inside code.
    expect(text).not.toContain("# Page\n");
    expect(text).toContain("## Overview");
    expect(text).toContain("# a shell comment, not a heading");
    expect(text).toContain(
      ":::info[Heads up]\nRead [this](/docs/other) and [that](/docs/other).\n:::"
    );
    expect(text).toContain(":::warning\nNo title here.\n:::");
    expect(text).toContain("> **👋** A plain quote.");
    expect(text).toContain(":::info[Note]\nBody.\n:::");
    expect(text).toContain(":::warning\n**Bold lead**\n\nMore.\n:::");
    expect(text).toContain('<Callout type="tip">Blume\'s own.</Callout>');
    expect(text).toContain(
      '<Frame caption="A diagram">\n\n![A diagram](https://files.readme.io/abc1234-flow.png)\n\n</Frame>'
    );
    expect(text).toContain(
      '<Frame caption="The chart">\n\n![The chart](https://files.readme.io/def5678-My_Chart.png)\n\n</Frame>'
    );
    expect(text).toContain(
      "![screen](https://files.readme.io/aaa1111-screen.png)"
    );
    expect(text).toContain('<YouTube id="AsQl_IlcWRM" />');
    expect(text).toContain(
      "| Name | Notes |\n| --- | --- |\n| `id` | First line.<br />Second \\| line. |"
    );
    expect(text).toContain("<CardGroup cols={3}>");
    expect(text).toContain(
      '<Card title="Start" icon="rocket" href="/docs/other" color="#ff0066">'
    );
    // Lucide still ships a GitHub mark, so the brand icon survives.
    expect(text).toContain(
      '<Card title="Source" icon="github" href="https://github.com/acme/sdk">'
    );
    expect(text).toContain(
      '<Accordion>\n  <AccordionItem title="One" icon="info">'
    );
    expect(text).toContain('<AccordionItem title="Two">');
    expect(text).toContain('<Expandable title="Solo">');
    // <Expandable> takes no icon, so a lone one with an icon keeps it this way.
    expect(text).toContain(
      '<Accordion>\n  <AccordionItem title="Iconic" icon="zap">'
    );
    // ReadMe themes a bare ℹ (no U+FE0F) as its default callout.
    expect(text).toContain(":::note[Bare]\nNo variation selector.\n:::");
    expect(text).toContain(
      'Ask about <Tooltip tip="Consumer Data Right">CDR</Tooltip> and <Tooltip tip="Trusted Advisor">TA</Tooltip>. Hi {{name}}, {{apiKey}}. 🎉 `:tada:`'
    );
    expect(text).toContain("Line<br />break");
    expect(text).toContain(
      '<CodeGroup>\n\n```javascript title="Node SDK"\nconst a = 1;\n```\n\n```python Python\na = 1\n```\n\n</CodeGroup>'
    );
    expect(text).toContain(
      '<div class="box"><img src="/x.png" /><p>&#123;curly&#125;</p></div>'
    );
    expect(text).toContain("<HTMLBlock>{`\n<style>");
    expect(text).toContain(":::danger[Last line without a newline]\n:::");

    expect(report).toContain("define these in blume.config.ts variables");
    expect(report).toContain("apiKey, name");
    expect(report).toContain("inline JSX event handlers");
    expect(report).toContain("<HTMLBlock> with <style>");
    expect(run(root)).toContain("Nothing to change.");
  });

  it("keeps code, lazy lines, and words intact around what it converts", async () => {
    const root = await project({
      "docs/Guides/_order.yaml": "- page\n",
      "docs/Guides/page.md": page(
        ["title: Page"],
        "# Section",
        "",
        "> 📘 Code inside",
        ">",
        "> ```bash",
        "> # a comment",
        ">",
        "> npm i",
        "> ```",
        "",
        "> 👍 Lazy",
        "> First line",
        "lazy line",
        "",
        "> 🎉No space, so a plain quote.",
        "",
        "> 🇦🇺 Flag",
        "",
        '<Callout icon="🚧" theme="warn">',
        "  ### Heads up",
        "",
        "  ```js",
        "  run();",
        "    nested();",
        "  ```",
        "</Callout>",
        "",
        "Hello <!-- a note --> world, glued<!-- x -->text.",
        "",
        "```inline``` code, not a fence :tada:",
        "",
        "```md",
        "> 📘 A sample",
        "```"
      ),
    });

    run("--write", root);
    const text = body(root, "docs/(Guides)/page.mdx");
    expect(text).toContain(
      ":::info[Code inside]\n```bash\n# a comment\n\nnpm i\n```\n:::"
    );
    expect(text).toContain(":::success[Lazy]\nFirst line\nlazy line\n:::");
    expect(text).toContain("> 🎉No space, so a plain quote.");
    expect(text).toContain(":::note[Flag]\n:::");
    expect(text).toContain(
      ":::warning[Heads up]\n```js\nrun();\n  nested();\n```\n:::"
    );
    expect(text).toContain("Hello world, gluedtext.");
    expect(text).toContain("```inline``` code, not a fence 🎉");
    expect(text).toContain("```md\n> 📘 A sample\n```");
    expect(run(root)).toContain("Nothing to change.");
  });

  it("converts magic blocks, tables, and links without breaking their code", async () => {
    const callout = {
      body: "Send `<API_KEY>` as `{ key }`, not {key}.\n\n```json\n{}\n```",
      title: "Keys",
      type: "info",
    };
    const root = await project({
      "docs/Guides/_order.yaml": "- page\n- other\n",
      "docs/Guides/other.md": page(["title: Other"], "Other."),
      "docs/Guides/page.md": page(
        ["title: Page"],
        "[block:callout]",
        JSON.stringify(callout, null, 2),
        "[/block]",
        "",
        "[block:callout]",
        '{ "type": "danger", "body": "never closed" }',
        "",
        "[block:api-header]",
        '{ "title": "Next" }',
        "[/block]",
        "",
        "```text",
        "[block:api-header]",
        '{ "title": "In a fence" }',
        "[/block]",
        "```",
        "",
        "<Table>",
        "  <tbody>",
        "    <tr>",
        "      <td>`a|b`</td>",
        "      <td>c</td>",
        "    </tr>",
        "  </tbody>",
        "</Table>",
        "",
        "<Table>",
        "  <tbody>",
        "    <tr>",
        "      <td colSpan={2}>Wide</td>",
        "    </tr>",
        "  </tbody>",
        "</Table>",
        "",
        "See [one](doc:other 'Other') and [two][two].",
        "",
        "[two]: <doc:other>"
      ),
    });

    const report = run("--write", root);
    const text = body(root, "docs/(Guides)/page.mdx");
    expect(text).toContain(
      ":::info[Keys]\nSend `<API_KEY>` as `{ key }`, not \\{key\\}.\n\n```json\n{}\n```\n:::"
    );
    expect(text).toContain("[block:callout]");
    expect(text).toContain("## Next");
    expect(text).toContain(
      '```text\n[block:api-header]\n{ "title": "In a fence" }'
    );
    expect(text).toContain("| `a\\|b` | c |");
    expect(text).toContain("<table>\n  <tbody>");
    expect(text).toContain(
      "See [one](/docs/other 'Other') and [two][two].\n\n[two]: </docs/other>"
    );
    expect(report).toContain("[block:callout] has no [/block]");
    expect(report).toContain("cells spanning columns or rows kept as <table>");
    expect(run(root)).toContain("Nothing to change.");
  });

  it("keeps category labels, and reads a BOM and odd frontmatter values", async () => {
    const root = await project({
      "docs/API Keys/_order.yaml": "- keys\n",
      "docs/API Keys/keys.md": page(["title: Keys"], "Keys."),
      "docs/Self-Serve/_order.yaml": "- one\n- one\n- gone\n",
      "docs/Self-Serve/one.md": `﻿${page(["title: One", "excerpt: First."], "One.")}`,
      "docs/_order.yaml": "- Self-Serve\n- getting started\n- API Keys\n",
      "docs/getting started/_order.yaml": "- start\n- many\n- legacy\n",
      "docs/getting started/legacy.md": page(
        ["title: Legacy", "category: 5f4d3c2b1a0f9e8d7c6b5a49", "hidden: true"],
        "Old."
      ),
      "docs/getting started/many.md": page(
        [
          "title: Many",
          "metadata:",
          "  image:",
          "    uri: /images/5f4d3c2b1a0f9e8d7c6b5a49",
          "next:",
          "  pages:",
          ...Array.from({ length: 11 }, (_, index) => [
            "    - type: link",
            `      url: https://example.com/${index}`,
          ]).flat(),
        ],
        "Many."
      ),
      "docs/getting started/start.md": page(
        ["title: Start", 'hidden: "true"'],
        "Start."
      ),
    });

    const report = run("--write", root);
    // Blume would label these "Self Serve" and "Getting started".
    expect(read(root, "docs/(Self-Serve)/meta.ts")).toContain(
      'title: "Self-Serve",\n  pages: ["one"],'
    );
    expect(read(root, "docs/(getting started)/meta.ts")).toContain(
      'title: "getting started"'
    );
    expect(read(root, "docs/(API Keys)/meta.ts")).not.toContain("title:");
    expect(front(root, "docs/(Self-Serve)/one.mdx")).toEqual({
      description: "First.",
      title: "One",
    });
    expect(read(root, "docs/(Self-Serve)/one.mdx").startsWith("---\n")).toBe(
      true
    );
    expect(report).toContain('hidden: "true" isn\'t true or false');
    expect(front(root, "docs/(getting started)/many.mdx").related).toHaveLength(
      10
    );
    expect(report).toContain("related keeps the first 10 of 11");
    expect(report).toContain("metadata.image has no URL");
    expect(report).toContain(
      "hidden: true in rdme ≤ 9 frontmatter: check the live URL"
    );
    expect(run(root)).toContain("Nothing to change.");
  });

  it("maps changelog and custom-page frontmatter outside the sync layout", async () => {
    const root = await project({
      "changelogs/fix.md": page(
        ["title: Fix", "type: fixed", "date: 2023-01-03"],
        "Fixed."
      ),
      "custom_pages/full.md": page(
        ["title: Full", "appearance:", "  fullscreen: true"],
        "Wide."
      ),
      "custom_pages/landing.md": page(["title: Landing"], "Hi."),
      "docs/status.md": page([
        "title: Status",
        "content:",
        "  link:",
        "    url: https://status.example.com",
      ]),
    });

    const report = run("--write", root);
    expect(report).toContain(
      "link page to https://status.example.com: delete it and redirect its URL there"
    );
    // rdme uploads leave no _order.yaml: nothing moves, but the entry is still
    // a changelog entry rather than a page of type "fixed".
    expect(front(root, "changelogs/fix.mdx")).toEqual({
      changelog: { category: "Fixed" },
      date: new Date("2023-01-03"),
      title: "Fix",
      type: "changelog",
    });
    // rdme@10 writes fullscreen under appearance.
    expect(front(root, "custom_pages/full.mdx")).toEqual({
      hidden: true,
      mode: "custom",
      title: "Full",
    });
    expect(front(root, "custom_pages/landing.mdx")).toEqual({
      hidden: true,
      mode: "center",
      title: "Landing",
    });
    expect(run(root)).toContain("Nothing to change.");
  });

  it("turns endpoint pages into an inventory, overlays, redirects, and tag order", async () => {
    const spec = {
      info: { title: "Pets", version: "1" },
      openapi: "3.0.0",
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            responses: { 200: { description: "OK" } },
            tags: ["Pets"],
          },
        },
        "/pets/{id}": {
          get: {
            description: "Fetch one.\n\n> 🚧 Careful\n> It bites.",
            operationId: "getPet",
            responses: { 200: { description: "OK" } },
            tags: ["Pets"],
          },
        },
      },
      tags: [{ name: "Pets" }],
    };
    const root = await project({
      "docs/Guides/_order.yaml": "- start\n",
      "docs/Guides/start.md": page(
        ["title: Start"],
        "See [one](ref:getpet), [all](/reference/pets), and [list](/reference/listpets#response).",
        "",
        "```bash",
        'curl "https://docs.acme.example/x" -H "Referer: /reference/getpet"',
        "```"
      ),
      "reference/Pets API/_order.yaml": "- pets\n",
      "reference/Pets API/pets/_order.yaml": "- getpet\n- listpets\n",
      "reference/Pets API/pets/getpet.md": page(
        ["api:", "  file: pets.json", "  operationId: getPet"],
        "> 📘 Note",
        "> Cached for a minute.",
        "",
        "<br />"
      ),
      "reference/Pets API/pets/index.md": page([
        "title: Pets",
        "hidden: false",
      ]),
      "reference/Pets API/pets/listpets.md": page([
        "api:",
        "  file: pets.json",
        "  operationId: listPets",
      ]),
      "reference/_order.yaml": "- Pets API\n",
      "reference/pets.json": JSON.stringify(spec, null, 2),
    });

    run("--write", root);
    expect(existsSync(join(root, "reference/Pets API"))).toBe(false);
    const overlay = JSON.parse(
      read(root, "reference/overlays/pets.overlay.json")
    );
    expect(overlay.actions).toEqual([
      {
        description:
          "ReadMe callouts as directives; the ReadMe endpoint page's prose (getPet)",
        target: "$.paths['/pets/{id}'].get",
        update: {
          description:
            "Fetch one.\n\n:::warning[Careful]\nIt bites.\n:::\n\n:::info[Note]\nCached for a minute.\n:::",
        },
      },
    ]);
    const inventory = JSON.parse(read(root, "readme-migration.json"));
    expect(
      inventory.endpoints.map((entry: { oldUrl: string }) => entry.oldUrl)
    ).toEqual(["/reference/getpet", "/reference/listpets"]);
    expect(body(root, "docs/(Guides)/start.mdx")).toContain(
      "[one](/reference/getpet)"
    );

    // What operation-routes.mjs prints for the built site.
    const routes = join(root, "routes.json");
    await writeFile(
      routes,
      JSON.stringify({
        references: {
          "/reference/pets-api": {
            endpoints: {
              "GET /pets": "/reference/pets-api/pets/list-pets",
              "GET /pets/{id}": "/reference/pets-api/pets/get-pet",
            },
            operationIds: {
              getPet: "/reference/pets-api/pets/get-pet",
              listPets: "/reference/pets-api/pets/list-pets",
            },
            title: "Pets",
            webhooks: [],
          },
        },
      })
    );
    const report = run(
      "--routes",
      routes,
      "--spec",
      "/reference/pets-api=reference/pets.json",
      "--write",
      root
    );
    const redirects = JSON.parse(read(root, "readme-redirects.json"));
    expect(redirects).toContainEqual({
      from: "/reference/getpet",
      to: "/reference/pets-api/pets/get-pet",
    });
    expect(redirects).toContainEqual({
      from: "/reference/pets",
      status: 302,
      to: "/reference/pets-api/pets/get-pet",
    });
    // ReadMe's endpoint order, which can differ from the spec's.
    expect(read(root, "reference/pets-api/pets/meta.ts")).toBe(
      [
        'import { defineMeta } from "blume";',
        "",
        "export default defineMeta({",
        '  title: "Pets",',
        "  order: 0,",
        '  pages: ["get-pet","list-pets"],',
        "});",
        "",
      ].join("\n")
    );
    expect(body(root, "docs/(Guides)/start.mdx")).toContain(
      "See [one](/reference/pets-api/pets/get-pet), [all](/reference/pets-api/pets/get-pet), and [list](/reference/pets-api/pets/list-pets)."
    );
    // A fenced sample keeps the URL it shows.
    expect(body(root, "docs/(Guides)/start.mdx")).toContain(
      '-H "Referer: /reference/getpet"'
    );
    expect(report).toContain("anchor #response dropped");
    expect(report).toContain(
      "reference/pets-api/meta.ts: defineMeta({ order: 0 })"
    );
    expect(
      run(
        "--routes",
        routes,
        "--spec",
        "/reference/pets-api=reference/pets.json",
        root
      )
    ).toContain("Nothing to change.");

    // A single spec's overview lives at /reference: no redirect may hide it.
    const single = join(root, "single.json");
    await writeFile(
      single,
      JSON.stringify({
        references: {
          "/reference": {
            endpoints: {
              "GET /pets": "/reference/pets/list-pets",
              "GET /pets/{id}": "/reference/pets/get-pet",
            },
            title: "Pets",
            webhooks: [],
          },
        },
      })
    );
    expect(run("--routes", single, "--write", root)).toContain(
      "/reference is now a reference page"
    );
    expect(
      JSON.parse(read(root, "readme-redirects.json")).map(
        (entry: { from: string }) => entry.from
      )
    ).not.toContain("/reference");
  });

  it("leaves what needs a person, and says so", async () => {
    const component = [
      'import { useState } from "react";',
      "",
      "export const Counter = () => {",
      "  const [n, setN] = useState(0);",
      "  return (",
      '    <button onClick={() => setN(n + 1)} style={{ margin: "4px" }}>',
      "      Don't click {n}",
      "      <input onChange={(e) => setN(Number(e.target.value))}>",
      "    </button>",
      "  );",
      "};",
    ].join("\n");
    const root = await project({
      "custom_blocks/Notice.md": page(
        ["name: Notice"],
        "Shared :sparkles: text."
      ),
      "custom_blocks/Widget.mdx": page(
        ["name: Widget"],
        "export const Widget = () => <div />;",
        "",
        "<Widget />"
      ),
      "docs/Guides/_order.yaml": "- page\n- broken\n",
      "docs/Guides/broken.md": "---\ntitle: [unclosed\n---\nBody.\n",
      "docs/Guides/page.md": page(
        ["title: Page", "custom_key: kept"],
        component,
        "",
        "<Counter />",
        "",
        "<Widget />",
        "",
        "<Notice />",
        "",
        "<PlanTable />"
      ),
      "reference/openapi.yaml": "openapi: 3.0.0\ninfo:\n  title: X\n",
    });

    const report = run("--write", root);
    const text = read(root, "docs/(Guides)/page.mdx");
    // The inline component is left byte for byte.
    expect(text).toContain(component);
    expect(text).toContain("<include>/_snippets/notice.mdx</include>");
    expect(read(root, "_snippets/notice.mdx")).toBe("Shared ✨ text.\n");
    expect(front(root, "docs/(Guides)/page.mdx")).toEqual({
      custom_key: "kept",
      title: "Page",
    });
    expect(read(root, "docs/Guides/broken.md")).toBe(
      "---\ntitle: [unclosed\n---\nBody.\n"
    );
    expect(report).toContain("import/export in the page, left untouched");
    expect(report).toContain("custom component <Widget>");
    expect(report).toContain("unknown component <PlanTable>");
    expect(report).toContain('frontmatter key "custom_key" kept as is');
    expect(report).toContain("frontmatter not converted");
    expect(report).toContain("reference/openapi.yaml is YAML");
    expect(report).toContain("custom_blocks/Widget.mdx is a React component");
  });

  it("maps every Font Awesome icon to a Lucide name Blume ships", async () => {
    const source = await readFile(CODEMOD, "utf-8");
    const table = source.slice(
      source.indexOf("const FONT_AWESOME = {"),
      source.indexOf("};", source.indexOf("const FONT_AWESOME = {"))
    );
    const names = [...table.matchAll(/:\s*"(?<name>[a-z0-9-]+)"/gu)].map(
      (match) => match.groups?.name ?? ""
    );
    expect(names.length).toBeGreaterThan(100);
    const { aliases = {}, icons } = JSON.parse(
      await readFile(
        join(
          import.meta.dir,
          "..",
          "node_modules",
          "@iconify-json",
          "lucide",
          "icons.json"
        ),
        "utf-8"
      )
    );
    const missing = names.filter((name) => !(name in icons || name in aliases));
    expect(missing).toEqual([]);
  });
});
