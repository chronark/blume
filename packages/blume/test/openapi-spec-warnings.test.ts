import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { resolveDocsUrl } from "../src/core/diagnostics.ts";
import { scanProject } from "../src/core/project-graph.ts";
import { nullableIssues, specIssues } from "../src/openapi/checks.ts";
import type { ApiDocument } from "../src/openapi/model.ts";
import { parseSpec } from "../src/openapi/parse.ts";

/**
 * Spec mistakes that would publish quietly: a server only the author's
 * machine can reach, a 3.1 spec still using 3.0's `nullable`, and a
 * `public/openapi.json` that takes over Blume's own `/openapi.json`.
 */

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const makeDir = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-spec-warnings-"));
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

/** Any value a parsed YAML/JSON document can hold. */
type Fixture = string | number | boolean | null | Fixture[] | FixtureObject;

interface FixtureObject {
  [key: string]: Fixture;
}

const document = (extra: Partial<ApiDocument>): ApiDocument => ({
  info: { title: "API", version: "1" },
  openapi: "3.1.0",
  ...extra,
});

describe("local servers", () => {
  it("warns once per local server URL, wherever it's declared", () => {
    const issues = specIssues(
      document({
        paths: {
          "/a": {
            get: { servers: [{ url: "http://0.0.0.0:3000" }] },
            servers: [{ url: "http://127.0.0.1:8000/v1" }],
          },
          "/b": { $ref: "#/components/pathItems/b" },
          "/c": {
            post: { servers: [{ url: "http://[::1]/api" }] },
          },
        },
        servers: [
          { url: "http://localhost:8000/api" },
          {
            url: "https://{host}/v2",
            variables: { host: { default: "api.localhost" } },
          },
          { url: "https://api.example.com" },
          { url: "/relative" },
          { url: "http://{unresolved}/" },
          { url: "http://localhost:8000/api" },
        ],
      })
    ).filter((issue) => issue.code === "BLUME_OPENAPI_LOCAL_SERVER");
    expect(issues.map((issue) => issue.message)).toStrictEqual(
      [
        "http://localhost:8000/api",
        "https://api.localhost/v2",
        "http://127.0.0.1:8000/v1",
        "http://0.0.0.0:3000",
        "http://[::1]/api",
      ].map(
        (url) =>
          `The spec's server ${url} is a local address, so the reference publishes it as the server Try it sends requests to and the code samples call, which readers can't reach.`
      )
    );
    expect(issues[0]?.suggestion).toContain("target: $.servers[0]");
  });

  it("stays quiet about public servers, and one without a URL", () => {
    const servers: Fixture[] = [
      { url: "https://api.acme.dev" },
      { description: "A server a hand-written spec left the URL off" },
    ];
    // SAFETY: a minimal parsed document, malformed on purpose; the checks
    // guard every field they read.
    const spec = { ...document({ paths: {} }), servers } as ApiDocument;
    expect(specIssues(spec)).toStrictEqual([]);
  });
});

/** A spec file of `openapi` version with one `nullable` schema. */
const nullableSpec = (openapi: string): string =>
  JSON.stringify({
    components: { schemas: { A: { nullable: true, type: "string" } } },
    info: { title: "API", version: "1" },
    openapi,
    paths: {},
  });

describe("nullable in a 3.1 spec", () => {
  it("names where a 3.1 spec sets nullable, past examples and names", () => {
    const issues = nullableIssues({
      components: {
        schemas: {
          Pet: {
            example: { nullable: true },
            properties: {
              // A property named `nullable` isn't the keyword.
              nullable: { type: "boolean" },
              tag: { nullable: true, type: "string" },
            },
            "x-meta": { nullable: true },
          },
        },
      },
      openapi: "3.1.0",
      paths: {
        "/pets/{id}": {
          get: {
            parameters: [{ schema: { nullable: false, type: "string" } }],
            responses: {
              default: {
                content: {
                  "application/json": {
                    schema: { items: { nullable: true }, type: "array" },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("BLUME_OPENAPI_NULLABLE");
    expect(issues[0]?.message).toBe(
      "The spec is OpenAPI 3.1.0, which removed `nullable`, but sets it at #/components/schemas/Pet/properties/tag/nullable, #/paths/~1pets~1{id}/get/parameters/0/schema/nullable, #/paths/~1pets~1{id}/get/responses/default/content/application~1json/schema/items/nullable. Blume still shows those values as nullable, but tools that follow 3.1.0, like validators and SDK generators, read them as never null."
    );
  });

  it("counts the places past the first few", () => {
    const schema = { nullable: true };
    const [issue] = nullableIssues({
      components: { schemas: { A: schema, B: schema, C: schema, D: schema } },
      openapi: "3.2.0",
    });
    expect(issue?.message).toContain(
      "#/components/schemas/C/nullable and 1 more."
    );
  });

  it("leaves a 3.0 spec alone, or one without nullable", () => {
    const schemas = { A: { nullable: true } };
    expect(
      nullableIssues({ components: { schemas }, openapi: "3.0.3" })
    ).toStrictEqual([]);
    expect(nullableIssues({ components: { schemas } })).toStrictEqual([]);
    expect(nullableIssues({ openapi: "3.1.0", paths: {} })).toStrictEqual([]);
  });

  it("reads the spec as written, before a 3.0 upgrade rewrites nullable", async () => {
    const root = await makeDir({
      "a.json": nullableSpec("3.0.3"),
      "b.json": nullableSpec("3.1.0"),
    });
    const upgraded = await parseSpec("a.json", root);
    const written = await parseSpec("b.json", root);
    expect(upgraded.issues).toStrictEqual([]);
    expect(written.issues.map((issue) => issue.code)).toStrictEqual([
      "BLUME_OPENAPI_NULLABLE",
    ]);
  });
});

describe("a public/openapi.json", () => {
  it("warns that it replaces the docs API's description", async () => {
    const root = await makeDir({
      "docs/index.md": "# Home\n",
      "public/openapi.json": "{}",
    });
    const project = await scanProject(root);
    const warning = project.diagnostics.find(
      (diagnostic) => diagnostic.code === "BLUME_PUBLIC_OPENAPI_JSON"
    );
    expect(warning?.file).toBe(join(root, "public", "openapi.json"));
    expect(warning?.severity).toBe("warning");
    expect(warning?.suggestion).toContain("public/specs/openapi.json");
  });

  it("stays quiet when the docs API is off", async () => {
    const root = await makeDir({
      "blume.config.ts": "export default { agents: { api: false } };\n",
      "docs/index.md": "# Home\n",
      "public/openapi.json": "{}",
    });
    const project = await scanProject(root);
    expect(
      project.diagnostics.map((diagnostic) => diagnostic.code)
    ).not.toContain("BLUME_PUBLIC_OPENAPI_JSON");
  });
});

describe("docs links", () => {
  it("points each new warning at the page that explains it", () => {
    expect(resolveDocsUrl("BLUME_OPENAPI_LOCAL_SERVER")).toBe(
      "https://useblume.dev/docs/references/openapi#spec-warnings"
    );
    expect(resolveDocsUrl("BLUME_PUBLIC_OPENAPI_JSON")).toBe(
      "https://useblume.dev/docs/discoverability/json-api"
    );
  });
});
