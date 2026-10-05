import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { dirname, join } from "pathe";

const PACKAGE_ROOT = join(import.meta.dir, "..");
const NODE_MODULES = join(PACKAGE_ROOT, "node_modules");

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  peerDependencies?: Record<string, string>;
  version: string;
}

const readManifest = async (dir: string): Promise<Manifest | null> => {
  try {
    // SAFETY: every package.json under node_modules is a package manifest.
    return JSON.parse(
      await readFile(join(dir, "package.json"), "utf-8")
    ) as Manifest;
  } catch {
    return null;
  }
};

/**
 * The manifest of package `name` that `file` (a resolved entry point) belongs
 * to, found by walking up from it — `@vitejs/plugin-react` doesn't export its
 * package.json, and nested `dist/package.json` files carry no name.
 */
const owningManifest = async (
  file: string,
  name: string
): Promise<Manifest | null> => {
  const dir = dirname(file);
  if (dir === file) {
    return null;
  }
  const manifest = await readManifest(dir);
  return manifest?.name === name ? manifest : owningManifest(dir, name);
};

// A fresh `blume init` project installs exactly Blume's dependency graph, so a
// dependency whose `peerDependencies.astro` excludes the Astro Blume ships
// surfaces as an "incorrect peer dependency" warning on the user's very first
// install (and npm quietly nests a second Astro to satisfy it). Every direct
// dependency that declares an Astro peer has to accept the installed version.
describe("astro peer ranges", () => {
  it("every direct dependency accepts the Astro version Blume installs", async () => {
    const blume = await readManifest(PACKAGE_ROOT);
    const astro = await readManifest(join(NODE_MODULES, "astro"));
    expect(blume).not.toBeNull();
    expect(astro).not.toBeNull();
    if (!(blume && astro)) {
      return;
    }

    const names = Object.keys({
      ...blume.dependencies,
      ...blume.devDependencies,
    });
    const manifests = await Promise.all(
      names.map(async (name) => ({
        manifest: await readManifest(join(NODE_MODULES, name)),
        name,
      }))
    );
    const checked: string[] = [];
    const rejected: string[] = [];
    for (const { manifest, name } of manifests) {
      const range = manifest?.peerDependencies?.astro;
      if (!(manifest && range)) {
        continue;
      }
      checked.push(name);
      if (!Bun.semver.satisfies(astro.version, range)) {
        rejected.push(`${name}@${manifest.version} wants astro ${range}`);
      }
    }

    // The Astro integrations Blume always ships declare a peer, so an empty
    // list means the walk looked in the wrong place, not that all is well.
    expect(checked).toContain("@astrojs/mdx");
    expect(checked).toContain("@scalar/astro");
    expect(rejected).toEqual([]);
  });
});

// Blume ships `oxc-transform-react`, which both `@astrojs/react` and the
// `@vitejs/plugin-react` it loads the React Compiler through declare as an
// optional peer. When those two ranges stop overlapping (plugin-react 6.1.2
// moved to ^0.152.0 in a patch while @astrojs/react 7.0.0 kept ^0.145.0), npm
// swaps the hoisted copy between them until it runs out of memory, so Blume
// pins plugin-react exactly and npm dedupes @astrojs/react onto that pin. Walk
// the chain the compiler actually loads through and check every peer range
// accepts the oxc-transform-react installed at its end.
describe("oxc-transform-react peer ranges", () => {
  it("the React Compiler chain accepts the oxc-transform-react Blume installs", async () => {
    const astroReact = createRequire(
      pathToFileURL(join(PACKAGE_ROOT, "_.js")).href
    ).resolve("@astrojs/react");
    const pluginReact = createRequire(astroReact).resolve(
      "@vitejs/plugin-react"
    );
    const oxc = createRequire(pluginReact).resolve("oxc-transform-react");
    const [blume, chain, installed] = await Promise.all([
      readManifest(PACKAGE_ROOT),
      Promise.all([
        owningManifest(astroReact, "@astrojs/react"),
        owningManifest(pluginReact, "@vitejs/plugin-react"),
      ]),
      owningManifest(oxc, "oxc-transform-react"),
    ]);
    const [astroReactManifest, pluginReactManifest] = chain;
    expect(blume).not.toBeNull();
    expect(astroReactManifest).not.toBeNull();
    expect(pluginReactManifest).not.toBeNull();
    expect(installed).not.toBeNull();
    if (!(blume && astroReactManifest && pluginReactManifest && installed)) {
      return;
    }

    // The pin only holds npm steady if @astrojs/react resolves to it.
    expect(pluginReactManifest.version).toBe(
      blume.dependencies?.["@vitejs/plugin-react"] ?? ""
    );
    const rejected = [astroReactManifest, pluginReactManifest]
      .map((manifest) => ({
        manifest,
        range: manifest.peerDependencies?.["oxc-transform-react"] ?? "",
      }))
      .filter(({ range }) => !Bun.semver.satisfies(installed.version, range))
      .map(
        ({ manifest, range }) =>
          `${manifest.name}@${manifest.version} wants oxc-transform-react ${range}`
      );
    expect(rejected).toEqual([]);
  });
});
