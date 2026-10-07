import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency Fern codemod, run the way the
// skill runs it: a bare `node` over the repo-root copy, from the folder that
// holds `fern/` (the package's `skills/` is a generated mirror of it).
const CODEMOD = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "fern-codemod.mjs"
);

const root = mkdtempSync(join(tmpdir(), "blume-fern-codemod-"));

const DOCS_YML = `# A small Fern project: tabs, a skip-slug section, a hidden page,
# an api summary, and a changelog tab.
instances:
  - url: acme.docs.buildwithfern.com
    custom-domain: docs.acme.dev
title: Acme | Docs
ai-search:
  system-prompt:
    You answer questions about Acme.
    Stay on topic.
tabs:
  guides:
    display-name: Guides
    icon: fa-solid fa-book
  api:
    display-name: API Reference
    icon: terminal
  changelog:
    display-name: Changelog
    icon: light clock
    changelog: ./changelog
navigation:
  - tab: guides
    layout:
      - section: Get Started
        skip-slug: true
        contents:
          - page: Welcome
            icon: fa-solid fa-hand
            path: pages/welcome.mdx
          - page: Secret
            hidden: true
            path: pages/secret.mdx
      - section: Core Concepts
        icon: fa-solid fa-bolt
        collapsed: true
        contents:
          - page: Inboxes
            path: pages/inboxes.mdx
          - page: Messages
            path: pages/messages.mdx
  - tab: api
    layout:
      - api: API Reference
        api-name: api
        summary: pages/api.mdx
  - tab: changelog
redirects:
  - source: /old
    destination: /guides/core-concepts/inboxes
  - source: /maybe
    destination: /nowhere
    permanent: false
`;

const WELCOME = `---
title: Welcome to Acme
subtitle: Start here.
description: The Acme welcome page.
headline: Welcome to Acme
---

<!-- an editor's note -->

<Note title="Heads up">
  Read this first.
</Note>

<CodeBlocks>
\`\`\`python
print("hi")
\`\`\`
\`\`\`ts Snippet with title wordWrap
console.log("hi")
\`\`\`
</CodeBlocks>

<Cards>
  <Card title="Inboxes" icon="fa-solid fa-rocket" iconPosition="left" href="https://docs.acme.dev/guides/core-concepts/inboxes" />
</Cards>

<AccordionGroup>
  <Accordion title="Q1">Answer one.</Accordion>
</AccordionGroup>

<Accordion title="Alone">Lone answer.</Accordion>

<Steps>
  <Step title="Go">
    <Warning title="Careful" icon="fa-solid fa-bolt">Nested.</Warning>
  </Step>
</Steps>

<Icon icon="fa-solid fa-bolt" size="5" />

<Markdown src="/snippets/plan.mdx" planName="Pro" />

![Diagram](../assets/diagram.png)

See [the threads endpoint](/api-reference/inboxes/threads/get).

<EndpointRequestSnippet endpoint="GET /v0/inboxes" />

<ParamField path="username" type="string" required={true} toc={true}>
  The user's display name.
</ParamField>

<ParamField path={"user.email"} type="string" default="none" />
`;

const FILES = {
  "fern/assets/diagram.png": "png",
  "fern/changelog/2026-01-05-launch.mdx": "## Launch\n\nWe launched.\n",
  "fern/changelog/2026-01-05.mdx":
    '---\ntags: ["api", "sdk"]\n---\n\n## Fixes\n',
  "fern/changelog/overview.mdx": "# Changelog\n\nWhat changed.\n",
  "fern/definition/api.yml": "name: api\n",
  "fern/docs.yml": DOCS_YML,
  "fern/fern.config.json": '{ "organization": "acme", "version": "5.0.0" }\n',
  "fern/generators.yml": "default-group: local\n",
  "fern/pages/api.mdx":
    '---\ntitle: API Welcome\nslug: api-reference\n---\n\n<Cards>\n  <Card title="Python" icon="fa-brands fa-python" />\n</Cards>\n',
  "fern/pages/draft.mdx": "---\ntitle: Draft\n---\n\nNot linked.\n",
  "fern/pages/inboxes.mdx": "# Inboxes\n\nAn inbox.\n",
  "fern/pages/messages.mdx":
    "---\ntitle: Messages\nsidebar_position: 2\n---\n\nMessages.\n",
  "fern/pages/secret.mdx": "---\ntitle: Secret\n---\n\nHidden.\n",
  "fern/pages/welcome.mdx": WELCOME,
  "fern/snippets/plan.mdx": "Upgrade to {{planName}}.\n",
};

const runIn = (cwd: string, ...args: string[]): string => {
  const result = spawnSync("node", [CODEMOD, ...args], {
    cwd,
    encoding: "utf-8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
};

const runCodemod = (...args: string[]): string => runIn(root, ...args);

const read = (path: string, dir = root): Promise<string> =>
  readFile(join(dir, path), "utf-8");

/** Every file under a fixture, with its contents, for idempotency checks. */
const snapshot = async (dir = root): Promise<Record<string, string>> => {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [path, await readFile(path, "utf-8")] as const;
      })
  );
  return Object.fromEntries(entries.toSorted(([a], [b]) => (a < b ? -1 : 1)));
};

const writeFixture = (dir: string, files: Record<string, string>) =>
  Promise.all(
    Object.entries(files).map(async ([path, text]) => {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), text);
    })
  );

// Edge cases that once corrupted pages or crashed --write: a `# comment` in a
// fence on a page with no title, one file listed twice, a page linking the
// spec SDK generation reads, a callout closed mid-line, and <CodeBlock>
// wrappers in and out of a group.
const edges = mkdtempSync(join(tmpdir(), "blume-fern-codemod-edges-"));

const EDGE_SETUP = `Install it:

\`\`\`bash
# install the SDK
npm i acme
\`\`\`

<Note title="Fenced">
  Run:

  \`\`\`bash
  npm i
  \`\`\`

  <Warning>Nested.</Warning>
</Note>

<Tip>
Body.
</Tip> More text.

<CodeBlocks>
  <CodeBlock title="Client">
  \`\`\`python
  import acme
  \`\`\`
  </CodeBlock>
  \`\`\`ts
  import acme from "acme";
  \`\`\`
</CodeBlocks>

<CodeBlock title="server.ts">
\`\`\`ts
serve();
\`\`\`
</CodeBlock>
`;

const EDGE_FILES = {
  "fern/assets/spec-icon.svg": "<svg/>",
  "fern/docs.yml": `navigation:
  - section: Guides
    path: pages/guides.mdx
    contents:
      - page: Setup
        path: pages/setup.mdx
      - page: Setup Again
        path: pages/setup.mdx
      - page: Spec
        icon: ./assets/spec-icon.svg
        path: pages/spec.mdx
  - api: API Reference
`,
  "fern/fern.config.json": '{ "organization": "acme", "version": "5.0.0" }\n',
  "fern/generators.yml":
    "api:\n  specs:\n    - openapi: ./openapi/openapi.yml\n",
  "fern/openapi/openapi.yml": "openapi: 3.0.1\n",
  "fern/pages/guides.mdx": "---\ntitle: Guides\n---\n\nStart here.\n",
  "fern/pages/setup.mdx": EDGE_SETUP,
  "fern/pages/spec.mdx":
    "---\ntitle: Spec\n---\n\nDownload [the spec](../openapi/openapi.yml).\n",
};

beforeAll(async () => {
  await Promise.all([
    writeFixture(root, FILES),
    writeFixture(edges, EDGE_FILES),
  ]);
});

afterAll(async () => {
  await Promise.all([
    rm(root, { force: true, recursive: true }),
    rm(edges, { force: true, recursive: true }),
  ]);
});

describe("fern-codemod", () => {
  it("plans without writing, and reports what needs judgment", async () => {
    const before = await snapshot();
    const report = runCodemod();
    expect(report).toContain("7 page(s) placed (0 already migrated)");
    expect(report).toContain(
      '{ label: "Guides", path: "/guides", icon: "book" }'
    );
    expect(report).toContain(
      '{ label: "API Reference", path: "/api-reference", icon: "terminal" }'
    );
    expect(report).toContain(
      '{ label: "Changelog", path: "/changelog", icon: "clock" }'
    );
    expect(report).toContain("Fern Definition in definition");
    expect(report).toContain("pages/draft.mdx: unpublished draft");
    expect(report).toContain("<EndpointRequestSnippet> (line 47)");
    expect(report).not.toContain("<ParamField>");
    expect(report).toContain(
      'changelog title "Launch" came from the file name'
    );
    expect(report).toContain(
      "icon fa-brands fa-python has no Lucide equivalent"
    );
    expect(report).toContain("frontmatter sidebar_position");
    expect(report).toContain("Dry run.");
    expect(await snapshot()).toEqual(before);
  });

  it("places every page at a path that reproduces its Fern URL", async () => {
    const generators = await read("fern/generators.yml");
    runCodemod("--write");

    // A skip-slug section is a (group) folder; a shared segment a real one.
    const welcome = matter(await read("docs/guides/(get-started)/welcome.mdx"));
    expect(welcome.data).toEqual({
      description: "Start here.",
      icon: "hand",
      seo: { description: "The Acme welcome page.", title: "Welcome to Acme" },
      sidebar: { label: "Welcome" },
      title: "Welcome to Acme",
    });
    expect(
      matter(await read("docs/guides/(get-started)/secret.mdx")).data
    ).toEqual({
      hidden: true,
      search: { exclude: true },
      seo: { noindex: true },
      title: "Secret",
    });
    // The H1 became the title; docs.yml order and the section's icon and
    // collapse land in meta.ts.
    expect(
      matter(await read("docs/guides/core-concepts/inboxes.mdx")).data
    ).toEqual({
      title: "Inboxes",
    });
    expect(await read("docs/guides/core-concepts/meta.ts")).toBe(
      [
        'import { defineMeta } from "blume";',
        "",
        "export default defineMeta({",
        '  title: "Core Concepts",',
        '  icon: "zap",',
        '  display: "group",',
        "  collapsed: true,",
        '  pages: ["inboxes", "messages"],',
        "});",
        "",
      ].join("\n")
    );
    expect(await read("docs/guides/meta.ts")).toContain(
      'pages: ["get-started", "core-concepts"]'
    );
    // The api summary moves off the generated overview's route.
    expect(existsSync(join(root, "docs/api-reference/introduction.mdx"))).toBe(
      true
    );
    // Changelog entries keep their ISO names.
    expect(matter(await read("docs/changelog/2026-01-05.mdx")).data).toEqual({
      changelog: { category: "api" },
      date: new Date("2026-01-05"),
      search: { tags: ["api", "sdk"] },
      title: "January 5, 2026",
      type: "changelog",
    });
    // SDK generation is never touched.
    expect(await read("fern/generators.yml")).toBe(generators);
    expect(existsSync(join(root, "fern/definition/api.yml"))).toBe(true);
    expect(existsSync(join(root, "fern/pages/draft.mdx"))).toBe(true);
  });

  it("converts the components and fences a migration always meets", async () => {
    const body = matter(
      await read("docs/guides/(get-started)/welcome.mdx")
    ).content;
    expect(body).toContain("{/* an editor's note */}");
    expect(body).toContain(":::note[Heads up]\nRead this first.\n:::");
    expect(body).toContain("<CodeGroup>");
    expect(body).toContain('```python title="Python"');
    expect(body).toContain('```ts title="Snippet with title" wrap');
    expect(body).toContain(
      '<CardGroup>\n  <Card title="Inboxes" icon="rocket"'
    );
    expect(body).not.toContain("iconPosition");
    expect(body).toContain('href="/guides/core-concepts/inboxes"');
    expect(body).toContain('<Accordion>\n  <AccordionItem title="Q1">');
    expect(body).toContain('<Accordion>\n<AccordionItem title="Alone">');
    expect(body).toContain(
      '<Callout type="warning" title="Careful" icon="zap">'
    );
    expect(body).toContain('<Icon icon="zap" size={20} />');
    expect(body).toContain(
      '<include planName="Pro">/_snippets/plan.mdx</include>'
    );
    expect(body).toContain("![Diagram](/assets/diagram.png)");
    // Fern's `path` names the field; in Blume it would mark a path parameter.
    expect(body).toContain(
      '<ParamField name="username" type="string" required={true}>'
    );
    expect(body).toContain(
      '<ParamField name={"user.email"} type="string" default="none" />'
    );
    expect(await read("docs/_snippets/plan.mdx")).toBe(
      "Upgrade to {{planName}}.\n"
    );
    expect(await read("public/assets/diagram.png")).toBe("png");
  });

  it("is idempotent: a second run moves nothing", async () => {
    const before = await snapshot();
    const report = runCodemod("--write");
    expect(report).toContain("7 page(s) placed (7 already migrated)");
    expect(await snapshot()).toEqual(before);
  });

  it("joins old endpoint URLs to built routes and writes the redirects", async () => {
    await writeFile(
      join(root, "routes.json"),
      JSON.stringify({
        references: {
          "/api-reference": {
            endpoints: {
              "GET /v0/inboxes": "/api-reference/inboxes/inboxes-list",
              "GET /v0/inboxes/{id}/threads/{thread}":
                "/api-reference/inbox-threads/inboxes-threads-get",
              "POST messageReceived":
                "/api-reference/webhook-events/message-received",
            },
            webhooks: ["POST messageReceived"],
          },
        },
      })
    );
    await writeFile(
      join(root, "spec.json"),
      JSON.stringify({
        paths: {
          "/v0/inboxes": { get: { operationId: "inboxes_list" } },
          "/v0/inboxes/{id}/threads/{thread}": {
            get: { operationId: "inboxes_threads_get" },
          },
        },
      })
    );
    await writeFile(
      join(root, "sitemap.txt"),
      "/api-reference/webhooks/events/message-received\n/guides/welcome\n"
    );
    const report = runCodemod(
      "endpoints",
      "--routes",
      "routes.json",
      "--spec",
      "/api-reference=spec.json",
      "--sitemap",
      "sitemap.txt",
      "--write"
    );
    expect(report).toContain("3 endpoint URL(s) joined, 3 group URL(s)");
    expect(report).toContain("every old URL is served or redirected");
    expect(report).toContain("destination /nowhere isn't a page here");
    const redirects = JSON.parse(await read("fern-redirects.json"));
    expect(redirects).toEqual(
      expect.arrayContaining([
        { from: "/", status: 307, to: "/guides/welcome" },
        {
          from: "/changelog/2026/1/5",
          status: 308,
          to: "/changelog/2026-01-05",
        },
        { from: "/changelog.rss", status: 308, to: "/changelog/rss.xml" },
        { from: "/old", status: 308, to: "/guides/core-concepts/inboxes" },
        { from: "/maybe", status: 307, to: "/nowhere" },
        {
          from: "/api-reference/inboxes/list",
          status: 308,
          to: "/api-reference/inboxes/inboxes-list",
        },
        {
          from: "/api-reference/inboxes/threads/get",
          status: 308,
          to: "/api-reference/inbox-threads/inboxes-threads-get",
        },
        {
          from: "/api-reference/webhooks/events/message-received",
          status: 308,
          to: "/api-reference/webhook-events/message-received",
        },
        {
          from: "/api-reference/inboxes/threads",
          status: 307,
          to: "/api-reference#inbox-threads",
        },
      ])
    );
    // A link to an old endpoint URL now points at the built page.
    expect(await read("docs/guides/(get-started)/welcome.mdx")).toContain(
      "[the threads endpoint](/api-reference/inbox-threads/inboxes-threads-get)"
    );
  });
});

describe("fern-codemod edge cases", () => {
  it("reports what it can't carry over without guessing", () => {
    const report = runIn(edges);
    expect(report).toContain(
      "pages/setup.mdx: docs.yml lists it twice: published once, at /guides/setup; /guides/setup-again redirects there"
    );
    expect(report).toContain(
      "pages/spec.mdx: icon ./assets/spec-icon.svg is an image"
    );
    expect(report).toContain(
      "openapi/openapi.yml: a page links it: copied to public/, not moved"
    );
  });

  it("keeps fences, mid-line closings, and the spec intact", async () => {
    runIn(edges, "--write");
    expect(matter(await read("docs/guides/index.mdx", edges)).data).toEqual({
      title: "Guides",
    });
    const setup = matter(await read("docs/guides/setup.mdx", edges));
    // A `# comment` in a fence is neither the title nor removed.
    expect(setup.data).toEqual({ title: "Setup" });
    expect(setup.content).toContain(
      "```bash\n# install the SDK\nnpm i acme\n```"
    );
    expect(setup.content).toContain(
      ':::note[Fenced]\nRun:\n\n```bash\nnpm i\n```\n\n<Callout type="warning">Nested.</Callout>\n:::'
    );
    expect(setup.content).toContain(
      '<Callout type="tip">\nBody.\n</Callout> More text.'
    );
    expect(setup.content).toContain('```python title="Client"');
    expect(setup.content).toContain('```ts title="TypeScript"');
    expect(setup.content).toContain('```ts title="server.ts"\nserve();\n```');
    expect(setup.content).not.toContain("<CodeBlock");
    expect(await read("docs/guides/spec.mdx", edges)).toContain(
      "[the spec](/openapi/openapi.yml)"
    );
    expect(await read("public/openapi/openapi.yml", edges)).toBe(
      "openapi: 3.0.1\n"
    );
    expect(existsSync(join(edges, "fern/openapi/openapi.yml"))).toBe(true);
    const state = JSON.parse(await read("fern-migration.json", edges));
    expect(state.redirects).toContainEqual({
      from: "/guides/setup-again",
      status: 308,
      to: "/guides/setup",
    });
  });

  it("computes an OpenAPI input's old endpoint URLs the way Fern did", async () => {
    await writeFile(
      join(edges, "routes.json"),
      JSON.stringify({
        references: {
          "/api-reference": {
            endpoints: {
              "DELETE /pets/{id}": "/api-reference/pets/delete-pets-id",
              "GET /pets": "/api-reference/pets/pets-list",
              "POST /pets": "/api-reference/pets/add-pet",
            },
          },
        },
      })
    );
    await writeFile(
      join(edges, "spec.json"),
      JSON.stringify({
        paths: {
          "/pets": {
            get: { operationId: "pets_list", tags: ["Pets"] },
            post: {
              operationId: "addPet",
              tags: ["Pets"],
              "x-fern-sdk-group-name": "animals",
              "x-fern-sdk-method-name": "create",
            },
          },
          "/pets/{id}": {
            delete: { summary: "Remove a pet", tags: ["Pets"] },
          },
        },
      })
    );
    await writeFile(
      join(edges, "sitemap.txt"),
      "/api-reference/pets/list\n/api-reference/animals/create\n/api-reference/pets/remove-a-pet\n"
    );
    const report = runIn(
      edges,
      "endpoints",
      "--routes",
      "routes.json",
      "--spec",
      "/api-reference=spec.json",
      "--sitemap",
      "sitemap.txt"
    );
    expect(report).toContain("3 endpoint URL(s) joined");
    expect(report).toContain("every old URL is served or redirected");
  });

  it("stays idempotent with a file listed twice", async () => {
    const before = await snapshot(edges);
    expect(runIn(edges, "--write")).toContain(
      "3 page(s) placed (3 already migrated)"
    );
    expect(await snapshot(edges)).toEqual(before);
  });
});
