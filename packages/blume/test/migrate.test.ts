import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import {
  MIGRATE_SOURCES,
  detectMigrateSource,
  isMigrateSource,
  migratePrompt,
} from "../src/migrate/migrate.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-migrate-"));
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

const deps = (field: string, names: string[]): string =>
  JSON.stringify({
    [field]: Object.fromEntries(names.map((name) => [name, "^1.0.0"])),
  });

describe("isMigrateSource", () => {
  it("accepts each supported framework and nothing else", () => {
    for (const source of MIGRATE_SOURCES) {
      expect(isMigrateSource(source)).toBe(true);
    }
    expect(isMigrateSource("hugo")).toBe(false);
  });
});

describe("detectMigrateSource", () => {
  it("returns null when nothing gives the framework away", async () => {
    expect(await detectMigrateSource(await project({}))).toBeNull();
  });

  it("detects Mintlify from docs.json or mint.json", async () => {
    expect(
      await detectMigrateSource(await project({ "docs.json": "{}" }))
    ).toEqual({ evidence: "docs.json", source: "mintlify" });
    expect(
      await detectMigrateSource(await project({ "mint.json": "{}" }))
    ).toEqual({ evidence: "mint.json", source: "mintlify" });
  });

  it("detects Docusaurus from its config file", async () => {
    expect(
      await detectMigrateSource(
        await project({ "docusaurus.config.ts": "export default {};" })
      )
    ).toEqual({ evidence: "docusaurus.config.ts", source: "docusaurus" });
  });

  it("detects Fumadocs from source.config.ts or its packages", async () => {
    expect(
      await detectMigrateSource(await project({ "source.config.ts": "" }))
    ).toEqual({ evidence: "source.config.ts", source: "fumadocs" });
    expect(
      await detectMigrateSource(
        await project({ "package.json": deps("dependencies", ["fumadocs-ui"]) })
      )
    ).toEqual({ evidence: "fumadocs-ui in package.json", source: "fumadocs" });
  });

  it("detects Nextra and Starlight from their packages", async () => {
    expect(
      await detectMigrateSource(
        await project({ "package.json": deps("dependencies", ["nextra"]) })
      )
    ).toEqual({ evidence: "nextra in package.json", source: "nextra" });
    expect(
      await detectMigrateSource(
        await project({
          "package.json": deps("devDependencies", ["@astrojs/starlight"]),
        })
      )
    ).toEqual({
      evidence: "@astrojs/starlight in package.json",
      source: "starlight",
    });
  });

  it("detects VitePress from its config, at the root or in docs/", async () => {
    expect(
      await detectMigrateSource(
        await project({ "docs/.vitepress/config.mts": "export default {};" })
      )
    ).toEqual({ evidence: "docs/.vitepress/config.mts", source: "vitepress" });
    expect(
      await detectMigrateSource(
        await project({
          "package.json": deps("devDependencies", ["vitepress"]),
        })
      )
    ).toEqual({ evidence: "vitepress in package.json", source: "vitepress" });
  });

  it("detects VuePress from its config or packages", async () => {
    expect(
      await detectMigrateSource(
        await project({ "docs/.vuepress/config.js": "module.exports = {};" })
      )
    ).toEqual({ evidence: "docs/.vuepress/config.js", source: "vuepress" });
    expect(
      await detectMigrateSource(
        await project({ "package.json": deps("devDependencies", ["vuepress"]) })
      )
    ).toEqual({ evidence: "vuepress in package.json", source: "vuepress" });
  });

  it("detects MkDocs from its config, or Zensical's and ProperDocs'", async () => {
    const files = [
      "mkdocs.yml",
      "mkdocs.yaml",
      "zensical.toml",
      "properdocs.yml",
    ];
    const detected = await Promise.all(
      files.map(async (file) =>
        detectMigrateSource(await project({ [file]: "" }))
      )
    );
    expect(detected).toEqual(
      files.map((file) => ({ evidence: file, source: "mkdocs" }))
    );
  });

  it("prefers a JavaScript framework's config over a stale mkdocs.yml", async () => {
    expect(
      await detectMigrateSource(
        await project({ "docs.json": "{}", "mkdocs.yml": "" })
      )
    ).toEqual({ evidence: "docs.json", source: "mintlify" });
  });

  it("detects Fern from fern/docs.yml, not an SDK-only fern/ folder", async () => {
    expect(
      await detectMigrateSource(
        await project({ "fern/docs.yml": "", "fern/fern.config.json": "{}" })
      )
    ).toEqual({ evidence: "fern/docs.yml", source: "fern" });
    expect(
      await detectMigrateSource(
        await project({ "fern/fern.config.json": "{}" })
      )
    ).toBeNull();
  });

  it("detects GitBook from its Git Sync files or a legacy toolchain", async () => {
    const files = ["gitbook-docs.yaml", ".gitbook.yaml", ".gitbook.yml"];
    const detected = await Promise.all(
      files.map(async (file) =>
        detectMigrateSource(await project({ [file]: "" }))
      )
    );
    expect(detected).toEqual(
      files.map((file) => ({ evidence: file, source: "gitbook" }))
    );
    expect(
      await detectMigrateSource(
        await project({ "package.json": deps("devDependencies", ["honkit"]) })
      )
    ).toEqual({ evidence: "honkit in package.json", source: "gitbook" });
    expect(
      await detectMigrateSource(await project({ "SUMMARY.md": "" }))
    ).toBeNull();
  });

  it("detects Redocly from sidebars.yaml or a Realm package", async () => {
    expect(
      await detectMigrateSource(await project({ "sidebars.yaml": "" }))
    ).toEqual({ evidence: "sidebars.yaml", source: "redocly" });
    expect(
      await detectMigrateSource(
        await project({
          "package.json": deps("dependencies", ["@redocly/realm"]),
        })
      )
    ).toEqual({
      evidence: "@redocly/realm in package.json",
      source: "redocly",
    });
  });

  it("doesn't take a lint-only redocly.yaml or the Redocly CLI for a portal", async () => {
    expect(
      await detectMigrateSource(
        await project({
          "package.json": deps("devDependencies", ["@redocly/cli"]),
          "redocly.yaml": "extends:\n  - recommended\n",
        })
      )
    ).toBeNull();
    expect(
      await detectMigrateSource(
        await project({
          "docusaurus.config.ts": "export default {};",
          "redocly.yaml": "extends:\n  - recommended\n",
        })
      )
    ).toEqual({ evidence: "docusaurus.config.ts", source: "docusaurus" });
  });

  it("detects ReadMe from its Git sync _order.yaml files", async () => {
    expect(
      await detectMigrateSource(await project({ "docs/_order.yaml": "" }))
    ).toEqual({ evidence: "docs/_order.yaml", source: "readme" });
    expect(
      await detectMigrateSource(await project({ "reference/_order.yaml": "" }))
    ).toEqual({ evidence: "reference/_order.yaml", source: "readme" });
  });

  it("detects Docsify from its packages, not a _sidebar.md", async () => {
    expect(
      await detectMigrateSource(
        await project({
          "package.json": deps("devDependencies", ["docsify-cli"]),
        })
      )
    ).toEqual({ evidence: "docsify-cli in package.json", source: "docsify" });
    expect(
      await detectMigrateSource(await project({ "docs/_sidebar.md": "" }))
    ).toBeNull();
  });

  it("falls back to file signals when package.json can't be parsed", async () => {
    const root = await project({
      "docs.json": "{}",
      "package.json": "{ not json",
    });
    expect(await detectMigrateSource(root)).toEqual({
      evidence: "docs.json",
      source: "mintlify",
    });
    expect(
      await detectMigrateSource(await project({ "package.json": "{ not json" }))
    ).toBeNull();
  });
});

describe("migratePrompt", () => {
  const skillDir = "/pkg/skills/blume-migrate";

  it("points at the skill and the detected source's mappings", () => {
    const prompt = migratePrompt({
      detected: { evidence: "docs.json", source: "mintlify" },
      skillDir,
      source: "mintlify",
      version: "2.0.0",
    });
    expect(prompt).toContain(
      "Migrate this documentation project to Blume 2.0.0"
    );
    expect(prompt).toContain("/pkg/skills/blume-migrate/SKILL.md");
    expect(prompt).toContain(
      "The source is Mintlify (detected from docs.json). Its exact mappings are in /pkg/skills/blume-migrate/references/mintlify.md."
    );
    expect(prompt).toContain("`blume@^2.0.0`");
  });

  it("names a source the user chose without claiming detection", () => {
    const prompt = migratePrompt({
      detected: { evidence: "docs.json", source: "mintlify" },
      skillDir,
      source: "docusaurus",
      version: "2.0.0",
    });
    expect(prompt).toContain(
      "The source is Docusaurus. Its exact mappings are in /pkg/skills/blume-migrate/references/docusaurus.md."
    );
    expect(prompt).not.toContain("detected from");
  });

  it("asks for an inventory when no source is known", () => {
    const prompt = migratePrompt({
      detected: null,
      skillDir,
      source: null,
      version: "2.0.0",
    });
    expect(prompt).toContain("wasn't detected");
    expect(prompt).toContain(
      "Mintlify, Fumadocs, Docusaurus, Starlight, Nextra"
    );
    expect(prompt).toContain("/pkg/skills/blume-migrate/references");
  });
});
