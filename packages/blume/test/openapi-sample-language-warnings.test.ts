import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import type { BlumeReferenceSource } from "../src/openapi/references.ts";
import { openApiSource } from "../src/openapi/source.ts";

/**
 * A `codeSamples` id Blume generates no sample for is left out of every
 * operation page; the reference source says so instead of dropping it
 * quietly.
 */

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const project = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "blume-sample-ids-"));
  dirs.push(dir);
  await writeFile(
    join(dir, "openapi.json"),
    JSON.stringify({
      info: { title: "API", version: "1" },
      openapi: "3.1.0",
      paths: { "/pets": { get: { operationId: "listPets" } } },
    })
  );
  await writeFile(join(dir, "schema.graphql"), "type Query { pets: String }\n");
  await writeFile(
    join(dir, "events.json"),
    JSON.stringify({
      asyncapi: "3.0.0",
      channels: { pets: { address: "pets" } },
      info: { title: "Events", version: "1" },
      operations: {
        onPet: { action: "receive", channel: { $ref: "#/channels/pets" } },
      },
    })
  );
  return dir;
};

const reference = (
  kind: BlumeReferenceSource["kind"],
  route: string,
  spec: string,
  codeSamples: string[]
): BlumeReferenceSource => ({
  basePath: "",
  display: {
    codeSamples,
    expandSchemas: false,
    playground: { enabled: false, proxy: false },
  },
  includeInLlms: true,
  includeInSearch: true,
  kind,
  label: route,
  noindex: false,
  route,
  seoDescriptionSuffix: true,
  slug: route.slice(1),
  spec,
});

describe("codeSamples ids", () => {
  it("warns once per adapter about ids it generates nothing for", async () => {
    const dir = await project();
    const { diagnostics } = await openApiSource(
      [
        reference("openapi", "/a", "openapi.json", ["curl", "objectivec"]),
        reference("openapi", "/b", "openapi.json", ["curl", "objectivec"]),
        reference("graphql", "/graphql", "schema.graphql", [
          "cplusplus",
          "http",
          "clojure",
        ]),
        // AsyncAPI's ids name tools, matched per protocol binding.
        reference("asyncapi", "/events", "events.json", ["websocat", "nope"]),
      ],
      { cacheDir: join(dir, ".cache"), mode: "build", projectRoot: dir }
    ).load();
    const warnings = diagnostics.filter((diagnostic) =>
      diagnostic.code.endsWith("_UNKNOWN_CODE_SAMPLE")
    );
    expect(warnings.map((warning) => [warning.code, warning.message])).toEqual([
      [
        "BLUME_OPENAPI_UNKNOWN_CODE_SAMPLE",
        "`codeSamples` in openapi() lists \"objectivec\", which isn't a language Blume generates samples in, so it's left out of every operation page.",
      ],
      [
        "BLUME_GRAPHQL_UNKNOWN_CODE_SAMPLE",
        '`codeSamples` in graphql() lists "http", "clojure", which aren\'t languages Blume generates samples in, so they\'re left out of every operation page.',
      ],
    ]);
    expect(warnings[0]?.suggestion).toContain(
      "(curl, python, js, node, typescript, php, go, java, ruby, powershell, swift, csharp, dotnet, c, cpp, kotlin, rust, dart)"
    );
  });
});
