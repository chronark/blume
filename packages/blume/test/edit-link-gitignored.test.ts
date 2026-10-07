import { afterAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { buildRuntimeData } from "../src/astro/generate.ts";
import { gitIgnoredPaths } from "../src/core/git-ignored.ts";
import { scanProject } from "../src/core/project-graph.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

// The repo-locating variables a parent git process (a pre-commit hook in a
// linked worktree) exports would point the fixture's git at the real repo.
const GIT_LOCATION_VARS = new Set([
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_WORK_TREE",
]);

const runGit = (root: string, args: string[]): string =>
  // oxlint-disable-next-line sonarjs/no-os-command-from-path -- the fixture drives a real git repository
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf-8",
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !GIT_LOCATION_VARS.has(key))
    ),
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

/** Write `files` to a fresh dir; with `git`, as a repository, all committed. */
const writeProject = async (
  files: Record<string, string>,
  git: boolean
): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "blume-edit-ignored-"));
  dirs.push(dir);
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = join(dir, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    })
  );
  if (!git) {
    return dir;
  }
  runGit(dir, ["init"]);
  runGit(dir, ["config", "user.email", "test@blume.dev"]);
  runGit(dir, ["config", "user.name", "Blume Test"]);
  // `add -A` skips what .gitignore matches; `-f` tracks one such file anyway.
  runGit(dir, ["add", "-A"]);
  runGit(dir, ["add", "-f", "docs/reference/kept.md"]);
  runGit(dir, ["-c", "commit.gpgsign=false", "commit", "-m", "docs"]);
  // Git's spelling of the root (macOS routes the temp dir through /private).
  return runGit(dir, ["rev-parse", "--show-toplevel"]);
};

// A staged source page carries its own edit link and no file for git to read.
const CONFIG = `export default {
  github: { owner: "acme", repo: "docs" },
  content: {
    sources: [
      { kind: "filesystem", options: { root: "docs" }, requiredSecrets: [], runtimeDeps: [] },
      {
        kind: "custom",
        options: {
          load: () =>
            Promise.resolve({
              diagnostics: [],
              entries: [
                {
                  body: { format: "md", text: "Remote." },
                  data: { title: "Remote" },
                  editUrl: "https://example.com/edit/remote.md",
                  raw: "---\\ntitle: Remote\\n---\\nRemote.",
                  ref: "remote.md",
                },
              ],
            }),
          name: "remote",
          staged: true,
        },
        requiredSecrets: [],
        runtimeDeps: [],
      },
    ],
  },
};
`;

const FILES = {
  ".gitignore": "docs/reference/\n",
  "blume.config.ts": CONFIG,
  "docs/index.md": "# Home\n",
  // Generated into a gitignored folder: never in the repository.
  "docs/reference/api.md": "# API\n",
  // Matched by the same rule, but tracked, so it's on GitHub.
  "docs/reference/kept.md": "# Kept\n",
};

/** A route's path and edit link, as the runtime data holds them. */
interface RouteEdit {
  editUrl: string | null;
  path: string;
}

const editUrls = async (
  root: string
): Promise<Record<string, string | null>> => {
  const data = JSON.parse(buildRuntimeData(await scanProject(root)));
  return Object.fromEntries(
    data.routes.map((route: RouteEdit) => [route.path, route.editUrl])
  );
};

describe("edit links for files git ignores", () => {
  it("drops the link from a page git ignores and keeps the rest", async () => {
    const root = await writeProject(FILES, true);
    expect(await editUrls(root)).toStrictEqual({
      "/": "https://github.com/acme/docs/edit/main/docs/index.md",
      "/reference/api": null,
      "/reference/kept":
        "https://github.com/acme/docs/edit/main/docs/reference/kept.md",
      "/remote": "https://example.com/edit/remote.md",
    });
  });

  it("keeps every link outside a repository", async () => {
    const root = await writeProject(FILES, false);
    const urls = await editUrls(root);
    expect(urls["/reference/api"]).toBe(
      "https://github.com/acme/docs/edit/main/docs/reference/api.md"
    );
  });
});

describe(gitIgnoredPaths, () => {
  it("reads only paths inside the repository, and nothing when none is ignored", async () => {
    const root = await writeProject(FILES, true);
    const outside = await writeProject({ "x.md": "# X\n" }, false);
    const api = join(root, "docs/reference/api.md");
    expect(
      gitIgnoredPaths(root, [api, join(outside, "x.md"), join(root, "a.md")])
    ).toStrictEqual(new Set([api]));
    expect(gitIgnoredPaths(root, [join(root, "docs/index.md")])).toStrictEqual(
      new Set()
    );
    expect(gitIgnoredPaths(root, [])).toStrictEqual(new Set());
  });
});
