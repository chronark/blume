import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { scanProject } from "../src/core/project-graph.ts";

/**
 * A date-named file (`12-05-2022.md`, `2024-01.md`) once lost its first number
 * as an ordering prefix. It now keeps its whole name, and the scan redirects
 * the old URL to the new one.
 */

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const scan = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "blume-former-routes-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    })
  );
  return scanProject(root, { mode: "build" });
};

const page = (title: string): string => `# ${title}\n`;

describe("former-route redirects", () => {
  it("redirects a date-named page's old URL unless something else owns it", async () => {
    const project = await scan({
      "blume.config.ts":
        'export default { redirects: [{ from: "/changelog/07-2022", to: "/changelog" }] };\n',
      // The config already redirects /changelog/07-2022.
      "docs/changelog/01-07-2022.md": page("July 1"),
      // /changelog/02 is a real page now, so 2024-02 isn't redirected there.
      "docs/changelog/02.md": page("Two"),
      // 11-06-2022 and 12-06-2022 both once resolved to /changelog/06-2022,
      // a duplicate route that never served, so neither claims it.
      "docs/changelog/11-06-2022.md": page("June 11"),
      // Its old URL, /changelog/05-2022, is free: it redirects.
      "docs/changelog/12-05-2022.md": page("May 12"),
      "docs/changelog/12-06-2022.md": page("June 12"),
      // A date-named folder moves every page under it.
      "docs/changelog/2023-03/notes.md": page("Notes"),
      "docs/changelog/2024-02.md": page("February"),
      "docs/index.md": page("Home"),
    });
    expect(
      project.graph.pages.map((entry) => entry.route).toSorted()
    ).toContain("/changelog/12-05-2022");
    expect(project.config.redirects).toStrictEqual([
      { from: "/changelog/07-2022", status: 301, to: "/changelog" },
      { from: "/changelog/05-2022", status: 301, to: "/changelog/12-05-2022" },
      {
        from: "/changelog/03/notes",
        status: 301,
        to: "/changelog/2023-03/notes",
      },
    ]);
  });

  it("writes both ends base-less under a basePath", async () => {
    const project = await scan({
      "blume.config.ts": 'export default { basePath: "/docs" };\n',
      "docs/news/12-05-2022.md": page("May 12"),
    });
    expect(project.config.redirects).toStrictEqual([
      { from: "/news/05-2022", status: 301, to: "/news/12-05-2022" },
    ]);
  });

  it("leaves the config alone when no page moved", async () => {
    const project = await scan({
      "blume.config.ts": "export default {};\n",
      "docs/01-intro.md": page("Intro"),
    });
    expect(project.config.redirects).toStrictEqual([]);
  });
});
