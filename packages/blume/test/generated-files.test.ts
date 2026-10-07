import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join, relative } from "pathe";

import { scanProject } from "../src/core/project-graph.ts";
import { publishBuildArtifacts } from "../src/deploy/artifacts.ts";
import {
  generatedFilePaths,
  servedFiles,
} from "../src/deploy/generated-files.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** A docs project on disk, scanned for a build. */
const project = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "blume-generated-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    })
  );
  return { root, scanned: await scanProject(root, { mode: "build" }) };
};

const HOME = "---\ntitle: Home\n---\n# Home\n";

// Every artifact switched on: a site, the skills surface, a Web Bot Auth key,
// and a blog page for the RSS feed.
const EVERYTHING = {
  "blume.config.ts": `export default ${JSON.stringify({
    agents: {
      mcp: { enabled: true },
      skills: "skills",
      webBotAuth: {
        keys: [
          {
            crv: "Ed25519",
            kty: "OKP",
            x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
          },
        ],
      },
    },
    deployment: { site: "https://docs.example.com" },
  })};\n`,
  "docs/blog/launch.md":
    "---\ntitle: Launch\ntype: blog\ndate: 2026-01-01\n---\nHi.\n",
  "docs/index.md": HOME,
  "skills/simple/SKILL.md":
    "---\nname: simple\ndescription: A test skill.\n---\n\n# simple\n",
};

/** Drops the writers' progress lines, which aren't under test. */
const quiet = (): void => {
  // Nothing to log.
};

/** Every file under `dir`, as a root-relative path. */
const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(dir, join(entry.parentPath, entry.name))}`);
};

// What a build writes that no link targets: the search index, the platform
// files, and the skill archives beside the skills index.
const NOT_LINK_TARGETS =
  /^\/(?:pagefind\/|_redirects$|_headers$|vercel\.json$|blume-redirects\.json$|\.well-known\/agent-skills\/(?!index\.json$))/u;

describe(generatedFilePaths, () => {
  it("lists every file publishBuildArtifacts writes", async () => {
    // The drift guard: a new artifact the build writes must be listed, or
    // `blume validate` reports links to it as broken.
    const { root, scanned } = await project(EVERYTHING);
    const dist = join(root, "dist");
    await mkdir(dist, { recursive: true });
    await publishBuildArtifacts(
      scanned,
      dist,
      { info: quiet, warn: quiet },
      () => Promise.resolve(0)
    );
    const files = await listFiles(dist);
    const written = files.filter((path) => !NOT_LINK_TARGETS.test(path));
    const listed = generatedFilePaths(scanned);
    expect(written.length).toBeGreaterThan(8);
    expect(written.filter((path) => !listed.includes(path))).toStrictEqual([]);
    expect(listed).toContain("/blog/rss.xml");
    expect(listed).toContain("/.well-known/mcp.json");
  });

  it("drops a file when the config turns its feature off", async () => {
    const { scanned } = await project({
      "blume.config.ts":
        "export default { agents: { api: false, llmsTxt: false } };\n",
      "docs/index.md": HOME,
    });
    // No site either, so no sitemap, catalogs, or feeds.
    expect(generatedFilePaths(scanned)).toStrictEqual([
      "/robots.txt",
      "/agent-readability.json",
    ]);
  });
});

describe(servedFiles, () => {
  it("answers for public files and the generated ones", async () => {
    const { scanned } = await project({
      "docs/index.md": HOME,
      "public/spec.pdf": "pdf",
    });
    const servesFile = servedFiles(scanned);
    expect(servesFile("/spec.pdf")).toBe(true);
    expect(servesFile("/llms.txt")).toBe(true);
    expect(servesFile("/missing.pdf")).toBe(false);
  });
});
