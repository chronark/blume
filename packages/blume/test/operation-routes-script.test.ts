import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { packageRoot } from "../src/core/package-root.ts";

// The blume-migrate skill's zero-dependency operation-route reader, run the
// way the skill runs it: a bare `node` over the repo-root copy (the package's
// `skills/` is a generated mirror of it).
const SCRIPT = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "operation-routes.mjs"
);

const PACKAGE_ROOT = packageRoot();
const CLI = join(PACKAGE_ROOT, "bin", "blume.mjs");
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

interface Reference {
  endpoints: Record<string, string>;
  operationIds?: Record<string, string>;
  title?: string;
  webhooks: string[];
}

interface Output {
  references: Record<string, Reference>;
  unlisted?: Record<string, string[]>;
}

/** One reference from the output, failing the test when it's missing. */
const referenceAt = (output: Output, route: string): Reference => {
  const reference = output.references[route];
  if (!reference) {
    throw new Error(`no reference at ${route} in ${JSON.stringify(output)}`);
  }
  return reference;
};

/** The route an endpoint maps to, failing the test when it's missing. */
const routeFor = (reference: Reference, endpoint: string): string => {
  const route = reference.endpoints[endpoint];
  if (route === undefined) {
    throw new Error(`no route for ${endpoint}`);
  }
  return route;
};

const run = (...args: string[]) =>
  spawnSync("node", [SCRIPT, ...args], { encoding: "utf-8" });

const runJson = (...args: string[]): Output => {
  const result = run(...args);
  expect(result.status, result.stderr).toBe(0);
  // SAFETY: the script prints one JSON document on success.
  return JSON.parse(result.stdout) as Output;
};

const writeFiles = async (root: string, files: Record<string, string>) => {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const path = join(root, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
    })
  );
};

// --- a real build ----------------------------------------------------------------

const ACME_SPEC = {
  info: { title: "Acme API", version: "1.0.0" },
  openapi: "3.1.0",
  paths: {
    "/hooks": {
      post: {
        // A tag named "Webhook" and a description quoting the webhook note
        // don't make an endpoint a webhook.
        description: "**Webhook.** Registers a callback URL.",
        operationId: "createHook",
        responses: { 201: { description: "ok" } },
        summary: "Create a hook",
        tags: ["Webhook"],
      },
    },
    "/pets": {
      get: {
        operationId: "listPets",
        responses: { 200: { description: "ok" } },
        summary: "List pets",
        tags: ["Pets"],
      },
      post: {
        // Dotted ids, as NestJS generators write them.
        operationId: "PetsController.createPet",
        responses: { 201: { description: "ok" } },
        summary: "Create a pet",
        tags: ["Pets"],
      },
    },
    "/pets/{id}": {
      get: {
        // No operationId: Blume derives the route from the method and path.
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "ok" } },
        summary: "Get a pet",
        tags: ["Pets"],
      },
    },
    "/status": {
      get: {
        description: "A description line that is only code:\n\n`GET /decoy`",
        operationId: "getStatus",
        responses: { 200: { description: "ok" } },
        summary: "Status",
        tags: ["status"],
      },
    },
  },
  servers: [{ url: "https://api.acme.test" }],
  tags: [{ name: "Pets" }, { name: "status" }, { name: "Webhook" }],
  webhooks: {
    petAdopted: {
      post: {
        operationId: "pet_adopted",
        responses: { 200: { description: "ok" } },
        summary: "Pet adopted",
        tags: ["Pets"],
      },
    },
  },
};

const ADMIN_SPEC = {
  info: { title: "Admin API", version: "1.0.0" },
  openapi: "3.1.0",
  paths: {
    // The same endpoint as the Acme API: references keep them apart.
    "/status": {
      get: {
        operationId: "adminStatus",
        responses: { 200: { description: "ok" } },
        summary: "Admin status",
      },
    },
  },
};

/**
 * Every font role pinned to a local file, so the build never reaches Google
 * Fonts (see `offlineFontsSource` in configured-integrations.test.ts).
 */
const LOCAL_FONT = join(
  PACKAGE_ROOT,
  "node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2"
);
const localFont = { name: "Probe", variants: [{ src: LOCAL_FONT }] };

const CONFIG = `import { defineConfig } from "blume";
import { openapi } from "blume/reference";

export default defineConfig({
  title: "Acme",
  theme: { fonts: ${JSON.stringify({ body: localFont, display: localFont, mono: localFont })} },
  reference: [
    openapi({
      sources: [
        { spec: "acme.json", route: "/api", label: "Acme API" },
        { spec: "admin.json", route: "/admin/reference", label: "Admin API" },
      ],
    }),
  ],
});
`;

/** `blume build` in `root`, killed and retried once if it never exits. */
const build = async (root: string, attemptsLeft = 2): Promise<string> => {
  const proc = Bun.spawn(["bun", CLI, "build"], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const output = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await Promise.race([
    proc.exited,
    Bun.sleep(120_000).then(() => null),
  ]);
  if (exitCode === null) {
    proc.kill("SIGKILL");
    await proc.exited;
    if (attemptsLeft <= 1) {
      throw new Error("`blume build` never exited");
    }
    return build(root, attemptsLeft - 1);
  }
  const [stdout, stderr] = await Promise.race([
    output,
    Bun.sleep(5000).then((): [string, string] => ["", ""]),
  ]);
  expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
  return join(root, "dist");
};

describe("operation-routes on a real build", () => {
  it("maps every endpoint to the page Blume built for it", async () => {
    // Fixtures live in the package (gitignored `blume-integrations-*`) so
    // Blume's sources keep one realpath for Astro's compiler, as the other
    // build tests do.
    const root = await mkdtemp(
      join(PACKAGE_ROOT, "blume-integrations-operation-routes-")
    );
    roots.push(root);
    await writeFiles(root, {
      "acme.json": JSON.stringify(ACME_SPEC),
      "admin.json": JSON.stringify(ADMIN_SPEC),
      "blume.config.ts": CONFIG,
      // A guide listing an endpoint the way an overview does isn't a reference.
      "docs/guide.md":
        "---\ntitle: Guide\n---\n\n- [`GET /pets`](/api/pets/list-pets) — List pets.\n",
      "docs/index.md": "---\ntitle: Home\n---\n\nHello.\n",
    });
    await mkdir(join(root, "node_modules"), { recursive: true });
    await symlink(PACKAGE_ROOT, join(root, "node_modules/blume"), "junction");

    const dist = await build(root);
    const output = runJson(dist, "--spec", `/api=${join(root, "acme.json")}`);

    expect(Object.keys(output.references)).toEqual([
      "/admin/reference",
      "/api",
    ]);
    expect(output.unlisted).toBeUndefined();

    const acme = referenceAt(output, "/api");
    expect(acme.title).toBe("Acme API");
    expect(Object.keys(acme.endpoints).toSorted()).toEqual([
      "GET /pets",
      "GET /pets/{id}",
      "GET /status",
      "POST /hooks",
      "POST /pets",
      "POST petAdopted",
    ]);
    expect(acme.webhooks).toEqual(["POST petAdopted"]);
    // The decoy line in the status description isn't taken for the endpoint.
    expect(acme.endpoints["GET /decoy"]).toBeUndefined();
    // operationIds join on method and path, onto the same routes.
    expect(acme.operationIds).toEqual({
      "PetsController.createPet": routeFor(acme, "POST /pets"),
      createHook: routeFor(acme, "POST /hooks"),
      getStatus: routeFor(acme, "GET /status"),
      listPets: routeFor(acme, "GET /pets"),
      pet_adopted: routeFor(acme, "POST petAdopted"),
    });
    // The guide's list resolves, so it was read and skipped, not missed.
    expect(routeFor(acme, "GET /pets")).toBe("/api/pets/list-pets");

    const admin = referenceAt(output, "/admin/reference");
    expect(admin.endpoints).toEqual({
      "GET /status": expect.stringMatching(/^\/admin\/reference\//u),
    });
    expect(admin.endpoints["GET /status"]).not.toBe(
      acme.endpoints["GET /status"]
    );

    // Every route is a page Blume built, under its reference, whose own
    // Markdown mirror names that endpoint.
    const pages = Object.entries(output.references).flatMap(
      ([base, reference]) =>
        Object.entries(reference.endpoints).map(([endpoint, route]) => ({
          base,
          endpoint,
          route,
        }))
    );
    const mirrors = await Promise.all(
      pages.map(({ route }) => readFile(join(dist, `${route}.md`), "utf-8"))
    );
    for (const [index, { base, endpoint, route }] of pages.entries()) {
      expect(route.startsWith(`${base}/`)).toBe(true);
      expect(existsSync(join(dist, route, "index.html"))).toBe(true);
      expect(mirrors[index]).toContain(`\`${endpoint}\``);
    }
  }, 300_000);
});

// --- edge cases on a hand-written dist ---------------------------------------------

const operationMirror = (
  title: string,
  body: string,
  tags: string[] = []
): string =>
  [
    "---",
    ...(tags.length > 0
      ? ["search:", "  tags:", ...tags.map((tag) => `    - ${tag}`)]
      : []),
    `title: "${title}"`,
    "type: openapi-operation",
    "---",
    body,
    "",
  ].join("\n");

describe("operation-routes edge cases", () => {
  it("follows base-prefixed and angle-bracket links and skips code lines in fences", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-operation-routes-"));
    roots.push(root);
    await writeFiles(root, {
      // Not operation pages: unclosed frontmatter, a home page, no frontmatter.
      "broken.md": "---\ntitle: Unclosed\n",
      "index.md": "---\ntitle: Home\n---\n\nHi.\n",
      "notes.md": "No frontmatter at all.\n",
      // An overview whose links carry a deployment base, one angle-bracketed.
      "ref.md": [
        "---",
        "title: Ref API",
        "---",
        "## Things",
        "",
        "- [`GET /things`](/base/ref/things/list-things) — List things.",
        "- [`` GET /odd`name ``](</base/ref/things/odd name>) — Odd.",
        "- [`GET /gone`](/base/ref/things/missing) — Not built.",
        "",
      ].join("\n"),
      "ref/things/list-things.md": operationMirror(
        "List things",
        [
          "`GET /decoy`",
          "",
          "```bash",
          "`GET /in-a-fence`",
          "```",
          "",
          "`GET /things`",
        ].join("\n")
      ),
      "ref/things/odd name.md": operationMirror(
        "Odd",
        "`` GET /odd`name ``\n\n**Webhook.** The API sends this request to your endpoint."
      ),
      // An operation page with no endpoint line, and one no overview lists.
      "stray/blank.md": operationMirror("Blank", "No endpoint here."),
      "stray/op.md": operationMirror("Stray", "`DELETE /stray`", ["Webhook"]),
    });

    const result = run(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      "2 operation page(s) appear in no overview list"
    );
    // SAFETY: the script prints one JSON document on success.
    const output = JSON.parse(result.stdout) as Output;
    expect(output.references).toEqual({
      "/ref": {
        endpoints: {
          "GET /odd`name": "/ref/things/odd name",
          "GET /things": "/ref/things/list-things",
        },
        title: "Ref API",
        webhooks: ["GET /odd`name"],
      },
    });
    expect(output.unlisted).toEqual({
      "(no endpoint line) /stray/blank": ["/stray/blank"],
      "DELETE /stray": ["/stray/op"],
    });
  });

  it("warns when an overview disagrees with the page or lists a duplicate", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-operation-routes-"));
    roots.push(root);
    await writeFiles(root, {
      "a.md": operationMirror("A", "`GET /a`"),
      "b.md": operationMirror("B", "`GET /b`"),
      "c.md": operationMirror("C", "`GET /a`"),
      "index.md": [
        "---",
        "title: 'It''s an API'",
        "---",
        "- [`GET /a`](/a) — A.",
        "- [`GET /z`](/b) — Listed under another endpoint than the page's.",
        "- [`GET /a`](/c) — The same endpoint again.",
        "",
      ].join("\n"),
    });
    const result = run(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      '/b: the overview lists it as "GET /z" but the page reads "GET /b"'
    );
    expect(result.stderr).toContain(
      '/: "GET /a" maps to both /a and /c; keeping the first'
    );
    // SAFETY: the script prints one JSON document on success.
    const output = JSON.parse(result.stdout) as Output;
    expect(output.references["/"]).toEqual({
      endpoints: { "GET /a": "/a", "GET /b": "/b" },
      title: "It's an API",
      webhooks: [],
    });
    expect(output.unlisted).toEqual({ "GET /a": ["/c"] });

    // A reference whose links resolve to nothing is left out entirely.
    await writeFiles(root, {
      "index.md": "---\ntitle: X\n---\n- [`GET /x`](/nowhere) — X.\n",
    });
    expect(runJson(root).references).toEqual({});
  });

  it("reports operationIds a spec has but the build doesn't, and rejects bad input", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-operation-routes-"));
    roots.push(root);
    await writeFiles(root, {
      "api.md": "---\ntitle: API\n---\n- [`GET /a`](/api/a) — A.\n",
      "api/a.md": operationMirror("A", "`GET /a`"),
      "bad.json": "{",
      "spec.json": JSON.stringify({
        paths: {
          "/a": { get: { operationId: "getA" }, parameters: [] },
          "/missing": { post: { operationId: "postMissing" } },
          "/no-id": { get: {} },
          "/null": null,
        },
      }),
      "spec.yaml": "openapi: 3.1.0\n",
    });

    const joined = run(root, `--spec=/api/=${join(root, "spec.json")}`);
    expect(joined.status, joined.stderr).toBe(0);
    expect(joined.stderr).toContain(
      "POST /missing (postMissing) has no page under /api"
    );
    // SAFETY: the script prints one JSON document on success.
    expect(
      referenceAt(JSON.parse(joined.stdout) as Output, "/api").operationIds
    ).toEqual({
      getA: "/api/a",
    });

    const yaml = run(root, "--spec", `/api=${join(root, "spec.yaml")}`);
    expect(yaml.status).toBe(1);
    expect(yaml.stderr).toContain("npx @redocly/cli bundle");

    const bad = run(root, "--spec", `/api=${join(root, "bad.json")}`);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("not readable as JSON");

    const noReference = run(
      root,
      "--spec",
      `/other=${join(root, "spec.json")}`
    );
    expect(noReference.status).toBe(1);
    expect(noReference.stderr).toContain(
      "no reference overview at /other. References: /api"
    );

    for (const args of [["--spec"], ["--spec", "/api"], ["--spec", "/api="]]) {
      const malformed = run(root, ...args);
      expect(malformed.status).toBe(1);
      expect(malformed.stderr).toContain(
        "--spec takes <reference-route>=<file.json>"
      );
    }
  });

  it("reads a server build's client half", async () => {
    const root = await mkdtemp(join(tmpdir(), "blume-operation-routes-"));
    roots.push(root);
    await writeFiles(root, {
      "client/api.md": "---\ntitle: API\n---\n- [`GET /a`](/api/a) — A.\n",
      "client/api/a.md": operationMirror("A", "`GET /a`"),
      "server/entry.mjs": "",
    });
    const result = run(root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("a server build's pages");
    // SAFETY: the script prints one JSON document on success.
    expect((JSON.parse(result.stdout) as Output).references).toEqual({
      "/api": { endpoints: { "GET /a": "/api/a" }, title: "API", webhooks: [] },
    });
  });

  it("explains usage, unknown options, and a dist with no operation pages", async () => {
    const help = run("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: node operation-routes.mjs");

    expect(run("--nope").stderr).toContain("unknown option --nope");
    expect(run("a", "b").stderr).toContain("one dist directory only");

    const missing = run(join(tmpdir(), "blume-operation-routes-missing"));
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Run `blume build` first");

    const root = await mkdtemp(join(tmpdir(), "blume-operation-routes-"));
    roots.push(root);
    await writeFiles(root, { "index.md": "---\ntitle: Home\n---\n" });
    const empty = run(root);
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain("no generated operation pages");
    expect(empty.stderr).toContain(".vercel/output/static");
  });
});
