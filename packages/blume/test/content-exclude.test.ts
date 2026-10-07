import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { scanProject } from "../src/core/project-graph.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** The routes a project with this `content.exclude` publishes. */
const routesWith = async (exclude: string[]): Promise<string[]> => {
  const root = await mkdtemp(join(tmpdir(), "blume-content-exclude-"));
  dirs.push(root);
  const files = {
    "blume.config.ts": `export default { content: { exclude: ${JSON.stringify(exclude)} } };\n`,
    "docs/.hidden.md": "# Hidden\n",
    "docs/_partial.md": "# Partial\n",
    "docs/drafts/wip.md": "# WIP\n",
    "docs/index.md": "# Home\n",
  };
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    })
  );
  const project = await scanProject(root);
  return project.graph.pages.map((page) => page.route).toSorted();
};

describe("content.exclude", () => {
  it("adds to the default excludes instead of replacing them", async () => {
    // Before, this published `_partial.md` and `.hidden.md`.
    expect(await routesWith(["drafts/**"])).toStrictEqual(["/"]);
  });

  it("publishes underscore files when a negated entry drops that default", async () => {
    expect(await routesWith(["!**/_*"])).toStrictEqual([
      "/",
      "/_partial",
      "/drafts/wip",
    ]);
  });
});
