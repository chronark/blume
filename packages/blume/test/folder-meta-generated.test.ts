import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { withGeneratedFolderMeta } from "../src/core/meta.ts";
import { scanProject } from "../src/core/project-graph.ts";
import type { FolderMeta } from "../src/core/schema.ts";
import type { NavNode } from "../src/core/types.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const makeTree = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-meta-generated-"));
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

const groupLabels = (nodes: NavNode[]): string[] =>
  nodes.flatMap((node) => (node.kind === "group" ? [node.label] : []));

const SPEC = JSON.stringify({
  info: { title: "API", version: "1" },
  openapi: "3.1.0",
  paths: {
    "/a": { get: { operationId: "a", summary: "A", tags: ["Zebras"] } },
    "/b": { get: { operationId: "b", summary: "B", tags: ["Apples"] } },
    "/c": { get: { operationId: "c", summary: "C", tags: ["Mangos"] } },
  },
  tags: [{ name: "Zebras" }, { name: "Mangos" }, { name: "Apples" }],
});

describe("generated folder meta beneath user meta files", () => {
  it("keeps a tag group's generated order under a title-only meta.ts", async () => {
    const root = await makeTree({
      "blume.config.ts":
        'export default {\n  reference: [{ kind: "openapi", options: { route: "/api", spec: "./openapi.json" }, requiredSecrets: [], runtimeDeps: [] }],\n};\n',
      "docs/api/mangos/meta.ts": 'export default { title: "Mango Ops" };\n',
      "docs/index.md": "# Home\n",
      "openapi.json": SPEC,
    });
    const project = await scanProject(root);
    const api = project.graph.navigation.sidebar.find(
      (node) => node.kind === "group" && node.path === "/api"
    );
    expect(
      api?.kind === "group" ? groupLabels(api.children) : []
    ).toStrictEqual(["Zebras", "Mango Ops", "Apples"]);
  });

  it("fills the gaps of user, shared, and per-locale meta from generated meta", () => {
    const generated = new Map<string, FolderMeta>([
      ["api/pets", { order: 2, title: "Pets" }],
      ["api/stores", { order: 3, title: "Stores" }],
    ]);
    const merged = withGeneratedFolderMeta(
      {
        meta: new Map<string, FolderMeta>([
          ["api/pets", { icon: "dog" }],
          ["fr/api/pets", { title: "Animaux" }],
          ["v1.0/api/pets", { title: "Old pets" }],
          ["guides", { title: "Guides" }],
        ]),
        shared: new Map<string, FolderMeta>([["api/stores", { order: 0 }]]),
      },
      generated,
      ["fr"]
    );
    expect(Object.fromEntries(merged.meta)).toStrictEqual({
      "api/pets": { icon: "dog", order: 2, title: "Pets" },
      "fr/api/pets": { order: 2, title: "Animaux" },
      guides: { title: "Guides" },
      // An archived snapshot reads only meta keyed under its version.
      "v1.0/api/pets": { title: "Old pets" },
    });
    expect(Object.fromEntries(merged.shared)).toStrictEqual({
      "api/pets": { order: 2, title: "Pets" },
      "api/stores": { order: 0, title: "Stores" },
    });
  });
});
