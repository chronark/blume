import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { scanProject } from "../src/core/project-graph.ts";
import type { NavNode } from "../src/core/types.ts";
import { platformRedirects } from "../src/deploy/redirects.ts";
import { extractOperations } from "../src/openapi/model.ts";
import type { ApiDocument, ApiSpecData } from "../src/openapi/model.ts";
import { operationMdx } from "../src/openapi/render-mdx.ts";

/**
 * Where an operation page lives and how its group lists it: tag slugs split
 * like operation ids, an operation's URL only unique within its tag, the
 * routes earlier releases gave redirecting to the new ones, operations in the
 * spec's order, and a tag's `x-displayName` as its label.
 */

const document = (
  paths: ApiDocument["paths"],
  extra: Partial<ApiDocument> = {}
): ApiDocument => ({
  info: { title: "API", version: "1" },
  openapi: "3.1.0",
  paths,
  ...extra,
});

type PathItem = NonNullable<ApiDocument["paths"]>[string];
type Operation = NonNullable<PathItem["get"]>;

/** An object whose key order is the one under test, as a spec writes it. */
const inOrder = <Value>(entries: [string, Value][]): Record<string, Value> =>
  Object.fromEntries(entries);

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const makeProject = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-openapi-routes-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    })
  );
  return root;
};

/** A config file listing one `openapi()` reference, without an import. */
const config = (options: string, extra = ""): string =>
  `export default {\n  reference: [{ kind: "openapi", options: ${options}, requiredSecrets: [], runtimeDeps: [] }],${extra}\n};\n`;

const groupNamed = (
  nodes: NavNode[],
  label: string
): Extract<NavNode, { kind: "group" }> | undefined => {
  for (const node of nodes) {
    if (node.kind !== "group") {
      continue;
    }
    if (node.label === label) {
      return node;
    }
    const nested = groupNamed(node.children, label);
    if (nested) {
      return nested;
    }
  }
  return undefined;
};

describe("operation routes", () => {
  it("splits a PascalCase tag into words, and records the route it had", () => {
    const extracted = extractOperations(
      document({
        "/threads": {
          get: { operationId: "listThreads", tags: ["InboxesThreads"] },
        },
      }),
      "/api"
    );
    expect(extracted.tags[0]?.slug).toBe("inboxes-threads");
    expect(extracted.operations[0]?.route).toBe(
      "/api/inboxes-threads/list-threads"
    );
    expect(extracted.moved).toStrictEqual([
      {
        from: "/api/inboxesthreads/list-threads",
        to: "/api/inboxes-threads/list-threads",
      },
    ]);
  });

  it("keeps an operation's URL short when its key repeats in another tag", () => {
    const extracted = extractOperations(
      document({
        "/pets": { get: { operationId: "list", tags: ["pets"] } },
        "/stores": { get: { operationId: "list", tags: ["stores"] } },
      }),
      "/api"
    );
    const [pets, stores] = extracted.operations;
    // The key stays unique across the spec: it names the operation in
    // `<Operation id>`. Only the route segment is scoped to the tag.
    expect(pets?.key).toBe("list");
    expect(stores?.key).toBe("list-get");
    expect(pets?.route).toBe("/api/pets/list");
    expect(stores?.route).toBe("/api/stores/list");
    expect(extracted.moved).toStrictEqual([
      { from: "/api/stores/list-get", to: "/api/stores/list" },
    ]);
  });

  it("still tells two operations apart that share a key within one tag", () => {
    const extracted = extractOperations(
      document({
        "/pets": {
          get: { operationId: "pets", tags: ["pets"] },
          post: { operationId: "pets", tags: ["pets"] },
        },
      }),
      "/"
    );
    expect(extracted.operations.map((op) => op.route)).toStrictEqual([
      "/pets/pets",
      "/pets/pets-post",
    ]);
    // Those are the routes they always had.
    expect(extracted.moved).toStrictEqual([]);
  });

  it("lists operations in the spec's order, keyed as they always were", () => {
    const extracted = extractOperations(
      document(
        inOrder<PathItem>([
          [
            "/b",
            inOrder<Operation>([
              ["post", { operationId: "same", tags: ["t"] }],
              ["get", { operationId: "same", tags: ["t"] }],
            ]),
          ],
          ["/a", { get: { operationId: "a", tags: ["t"] } }],
        ])
      ),
      "/api"
    );
    expect(
      extracted.operations.map((op) => `${op.method} ${op.path}`)
    ).toStrictEqual(["post /b", "get /b", "get /a"]);
    // GET still claims the bare key, as it did when methods were walked in
    // a fixed order, so neither page moves.
    expect(extracted.operations.map((op) => op.key)).toStrictEqual([
      "same-post",
      "same",
      "a",
    ]);
    expect(extracted.moved).toStrictEqual([]);
  });

  it("labels a tag with its x-displayName, keeping the slug its name gives", () => {
    const extracted = extractOperations(
      document(
        { "/pets": { get: { operationId: "listPets", tags: ["pets"] } } },
        {
          tags: [
            { description: "All pets.", name: "pets", "x-displayName": "Pets" },
          ],
        }
      ),
      "/api"
    );
    expect(extracted.tags).toStrictEqual([
      { description: "All pets.", name: "Pets", slug: "pets" },
    ]);
    expect(extracted.operations[0]?.tag).toBe("Pets");
    expect(extracted.operations[0]?.route).toBe("/api/pets/list-pets");
  });
});

describe("duplicate operationIds", () => {
  it("names both operations, and the URL when they share a tag", () => {
    const { issues } = extractOperations(
      document({
        "/a": { get: { operationId: "listPets", tags: ["pets"] } },
        "/b": { get: { operationId: "listPets", tags: ["pets"] } },
        "/c": { post: { operationId: "listPets", tags: ["other"] } },
      }),
      "/api"
    );
    expect(issues).toStrictEqual([
      {
        code: "BLUME_OPENAPI_DUPLICATE_OPERATION_ID",
        message:
          'GET /a and GET /b share the operationId "listPets", which must be unique in a spec, so Blume names the second one "list-pets-get" in `<Operation id>` and serves its page at /api/pets/list-pets-get.',
        suggestion: "Give each operation its own operationId.",
      },
      {
        code: "BLUME_OPENAPI_DUPLICATE_OPERATION_ID",
        message:
          'GET /a and POST /c share the operationId "listPets", which must be unique in a spec, so Blume names the second one "list-pets-post" in `<Operation id>`.',
        suggestion: "Give each operation its own operationId.",
      },
    ]);
  });
});

describe("sidebar labels", () => {
  it("labels an operation without a summary by its method and path", () => {
    const [get, post] = extractOperations(
      document({ "/pets": { get: {}, post: {} } }),
      "/api"
    ).operations;
    const spec: Pick<ApiSpecData, "kind" | "label" | "slug" | "title"> = {
      kind: "openapi",
      label: "API",
      slug: "api",
      title: "API",
    };
    // SAFETY: `operationMdx` reads only the fields picked above.
    const data = spec as ApiSpecData;
    expect(get && operationMdx(data, get).data.sidebar.label).toBe("GET /pets");
    expect(post && operationMdx(data, post).data.sidebar.label).toBe(
      "POST /pets"
    );
  });
});

/**
 * A spec whose `/threads` operations, POST written first, carry `tags`, and
 * whose `/stores` operation reuses an operationId.
 */
const threadsSpec = (tags?: string[]): string =>
  JSON.stringify({
    info: { title: "API", version: "1" },
    openapi: "3.1.0",
    paths: inOrder<PathItem>([
      [
        "/threads",
        inOrder<Operation>([
          [
            "post",
            { operationId: "createThread", summary: "Zap a thread", tags },
          ],
          ["get", { operationId: "listThreads", summary: "All threads", tags }],
        ]),
      ],
      ["/stores", { get: { operationId: "listThreads", tags: ["Stores"] } }],
    ]),
  });

const SPEC = threadsSpec();

describe("a reference whose routes moved", () => {
  it("redirects each old route to the new one, and lists the spec's order", async () => {
    const root = await makeProject({
      "blume.config.ts": config(
        '{ route: "/api", spec: "./openapi.json" }',
        '\n  redirects: [{ from: "/api/inboxesthreads/create-thread", to: "/" }],'
      ),
      // A page at an old route keeps it: nothing redirects away from a page.
      "docs/api/stores/list-threads-get.md": "# Old stores page\n",
      "docs/index.md": "# Home\n",
      "openapi.json": threadsSpec(["InboxesThreads"]),
    });
    const project = await scanProject(root);
    expect(project.config.redirects).toStrictEqual([
      // The configured redirect wins over the one Blume would add.
      { from: "/api/inboxesthreads/create-thread", status: 301, to: "/" },
      {
        from: "/api/inboxesthreads/list-threads",
        status: 301,
        to: "/api/inboxes-threads/list-threads",
      },
    ]);
    // The host files carry them too, with each page's Markdown copies.
    expect(platformRedirects(project)).toContainEqual({
      from: "/api/inboxesthreads/list-threads.md",
      status: 301,
      to: "/api/inboxes-threads/list-threads.md",
    });

    // The group lists its pages in the spec's order, not by label.
    const group = groupNamed(
      project.graph.navigation.sidebar,
      "InboxesThreads"
    );
    expect(group?.children.map((node) => node.label)).toStrictEqual([
      "Zap a thread",
      "All threads",
    ]);
  });

  it("leaves a meta.ts's page order in charge", async () => {
    const root = await makeProject({
      "blume.config.ts": config('{ route: "/api", spec: "./openapi.json" }'),
      "docs/api/operations/meta.ts":
        'export default { pages: ["list-threads", "create-thread"] };\n',
      "docs/index.md": "# Home\n",
      "openapi.json": SPEC,
    });
    const project = await scanProject(root);
    const group = groupNamed(project.graph.navigation.sidebar, "Operations");
    expect(group?.children.map((node) => node.label)).toStrictEqual([
      "All threads",
      "Zap a thread",
    ]);
  });

  it("redirects a moved route under each locale that serves the page", async () => {
    const root = await makeProject({
      "blume.config.ts": config(
        '{ route: "/api", spec: "./openapi.json" }',
        '\n  i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English" }, { code: "fr", label: "Français" }] },'
      ),
      "docs/fr/index.md": "# Accueil\n",
      "docs/index.md": "# Home\n",
      "openapi.json": SPEC,
    });
    const project = await scanProject(root);
    expect(project.config.redirects).toStrictEqual([
      {
        from: "/api/stores/list-threads-get",
        status: 301,
        to: "/api/stores/list-threads",
      },
      {
        from: "/fr/api/stores/list-threads-get",
        status: 301,
        to: "/fr/api/stores/list-threads",
      },
    ]);
  });
});
