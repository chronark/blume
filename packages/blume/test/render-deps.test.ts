import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import {
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join, normalize, resolve } from "pathe";

import {
  linkRenderDeps,
  packageDirFrom,
  packageNameOf,
  prerenderDepsPlugin,
} from "../src/astro/render-deps.ts";

let root: string;

beforeEach(async () => {
  // Real paths throughout: the plugin compares realpath'd package dirs.
  root = await realpath(await mkdtemp(join(tmpdir(), "blume-render-deps-")));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

/** Write `<modulesDir>/<name>/package.json` at `version`. */
const fakePackage = async (
  modulesDir: string,
  name: string,
  version = "1.0.0"
): Promise<string> => {
  const dir = join(modulesDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name, version }),
    "utf-8"
  );
  return dir;
};

/** Where a link in `modulesDir` points, resolved against its own folder. */
const linkTarget = async (link: string): Promise<string> =>
  normalize(resolve(dirname(link), await readlink(link)));

/**
 * A hoisted npm project where a root `js-yaml@4` shadows Blume's nested
 * `js-yaml@5`, with Blume's source file importing it.
 */
const conflictFixture = async () => {
  const modules = join(root, "project", "node_modules");
  const hoisted = await fakePackage(modules, "js-yaml", "4.1.0");
  const pkgDir = join(modules, "blume");
  const nested = await fakePackage(
    join(pkgDir, "node_modules"),
    "js-yaml",
    "5.4.2"
  );
  await fakePackage(modules, "astro");
  await fakePackage(modules, "@astrojs/mdx");
  const importer = join(pkgDir, "src", "core", "yaml.ts");
  const outDir = join(root, "project", "dist", ".prerender");
  await mkdir(outDir, { recursive: true });
  return { hoisted, importer, nested, outDir, pkgDir };
};

/**
 * An isolated-linker store holding Blume beside its deps, and a server output
 * outside it, so every link into the output adds the rest of the store.
 */
const isolatedFixture = async () => {
  const store = join(root, "node_modules", ".store", "blume@1", "node_modules");
  const pkgDir = join(store, "blume");
  await mkdir(pkgDir, { recursive: true });
  const astro = await fakePackage(store, "astro");
  await fakePackage(store, "@astrojs/mdx");
  const outDir = join(root, "project", "dist", "server");
  await mkdir(outDir, { recursive: true });
  return { astro, outDir, pkgDir, store };
};

/** A plugin context that answers `this.resolve` with `resolved`. */
const context = (
  name: string,
  resolved: { external?: boolean; id: string } | null
) => {
  const calls: { importer?: string; source: string }[] = [];
  return {
    calls,
    ctx: {
      environment: { name },
      resolve: (source: string, importer: string | undefined) => {
        calls.push({ importer, source });
        return Promise.resolve(resolved);
      },
    },
  };
};

describe("packageNameOf", () => {
  it("names the package a bare specifier imports", () => {
    expect(packageNameOf("js-yaml")).toBe("js-yaml");
    expect(packageNameOf("takumi-js/helpers")).toBe("takumi-js");
    expect(packageNameOf("@scalar/openapi-parser/dist/x.js")).toBe(
      "@scalar/openapi-parser"
    );
  });

  it("skips builtins and a bare scope", () => {
    expect(packageNameOf("fs")).toBeNull();
    expect(packageNameOf("fs/promises")).toBeNull();
    expect(packageNameOf("@scope")).toBeNull();
    expect(packageNameOf("")).toBeNull();
  });
});

describe("packageDirFrom", () => {
  it("finds the copy the importer's own ancestors hold first", async () => {
    const { hoisted, importer, nested } = await conflictFixture();
    expect(packageDirFrom("js-yaml", dirname(importer))).toBe(nested);
    // From outside Blume, the walk only reaches the hoisted copy.
    expect(packageDirFrom("js-yaml", join(root, "project", "dist"))).toBe(
      hoisted
    );
  });

  it("returns the real path behind a linked package", async () => {
    const store = await fakePackage(join(root, "store"), "zod");
    const modules = join(root, "app", "node_modules");
    await mkdir(modules, { recursive: true });
    await symlink(store, join(modules, "zod"), "dir");
    expect(packageDirFrom("zod", join(root, "app", "src"))).toBe(store);
  });

  it("returns null when no ancestor holds the package", () => {
    expect(packageDirFrom("missing-package", root)).toBeNull();
  });
});

describe("linkRenderDeps", () => {
  it("links each package to the given copy, relative to the output", async () => {
    const { nested, outDir, pkgDir } = await conflictFixture();
    await linkRenderDeps(outDir, new Map([["js-yaml", nested]]), pkgDir);
    const link = join(outDir, "node_modules", "js-yaml");
    const stats = await lstat(link);
    expect(stats.isSymbolicLink()).toBe(true);
    expect(normalize(await readlink(link))).not.toStartWith("/");
    expect(await linkTarget(link)).toBe(nested);
  });

  it("replaces a whole-directory link an earlier release left", async () => {
    const { nested, outDir, pkgDir } = await conflictFixture();
    const modulesDir = join(outDir, "node_modules");
    await symlink(join(root, "project", "node_modules"), modulesDir, "dir");
    await linkRenderDeps(outDir, new Map([["js-yaml", nested]]), pkgDir);
    const stats = await lstat(modulesDir);
    expect(stats.isDirectory()).toBe(true);
    expect(await linkTarget(join(modulesDir, "js-yaml"))).toBe(nested);
  });

  it("keeps a correct link, re-points a stale one, and leaves a real directory", async () => {
    const { hoisted, nested, outDir, pkgDir } = await conflictFixture();
    const modulesDir = join(outDir, "node_modules");
    await mkdir(join(modulesDir, "@scope"), { recursive: true });
    await symlink(nested, join(modulesDir, "js-yaml"), "dir");
    await symlink(hoisted, join(modulesDir, "stale"), "dir");
    await fakePackage(modulesDir, "vendored");
    const zod = await fakePackage(join(root, "store"), "zod");

    await linkRenderDeps(
      outDir,
      new Map([
        ["js-yaml", nested],
        ["stale", zod],
        ["vendored", zod],
      ]),
      pkgDir
    );

    // The correct link is untouched, so it keeps its absolute target.
    expect(normalize(await readlink(join(modulesDir, "js-yaml")))).toBe(nested);
    expect(await linkTarget(join(modulesDir, "stale"))).toBe(zod);
    const vendored = await lstat(join(modulesDir, "vendored"));
    expect(vendored.isDirectory()).toBe(true);
  });

  it("replaces a link it can't read", async () => {
    const { nested, outDir, pkgDir } = await conflictFixture();
    const link = join(outDir, "node_modules", "js-yaml");
    await mkdir(dirname(link), { recursive: true });
    await symlink(join(root, "gone"), link, "dir");
    const spy = spyOn(fsPromises, "readlink").mockRejectedValue(
      new Error("EIO")
    );
    try {
      await linkRenderDeps(outDir, new Map([["js-yaml", nested]]), pkgDir);
    } finally {
      spy.mockRestore();
    }
    expect(await linkTarget(link)).toBe(nested);
  });

  it("falls back to a junction when a directory symlink can't be created", async () => {
    const { nested, outDir, pkgDir } = await conflictFixture();
    const realSymlink = fsPromises.symlink;
    const types: string[] = [];
    const spy = spyOn(fsPromises, "symlink").mockImplementation(
      (target, path, type) => {
        types.push(String(type));
        if (type === "dir") {
          return Promise.reject(new Error("EPERM"));
        }
        return realSymlink(target, path, type);
      }
    );
    try {
      await linkRenderDeps(outDir, new Map([["js-yaml", nested]]), pkgDir);
    } finally {
      spy.mockRestore();
    }
    expect(types).toEqual(["dir", "junction"]);
    const link = join(outDir, "node_modules", "js-yaml");
    // The junction carries the absolute target.
    expect(normalize(await readlink(link))).toBe(nested);
  });

  it("adds the rest of Blume's store under an isolated linker", async () => {
    const { astro, outDir, pkgDir, store } = await isolatedFixture();
    await mkdir(join(store, ".bin"), { recursive: true });
    const zod = await fakePackage(join(root, "elsewhere"), "zod");

    await linkRenderDeps(outDir, new Map([["zod", zod]]), pkgDir);

    const modulesDir = join(outDir, "node_modules");
    expect(await linkTarget(join(modulesDir, "zod"))).toBe(zod);
    expect(await linkTarget(join(modulesDir, "astro"))).toBe(astro);
    expect(
      existsSync(join(modulesDir, "@astrojs", "mdx", "package.json"))
    ).toBe(true);
    // Blume itself links too (it's in the store); dot-entries never do.
    expect(existsSync(join(modulesDir, ".bin"))).toBe(false);
  });

  it("links nothing else when the output already walks up to Blume's deps", async () => {
    const { outDir, pkgDir } = await conflictFixture();
    await linkRenderDeps(outDir, new Map(), pkgDir);
    expect(existsSync(join(outDir, "node_modules"))).toBe(false);
  });

  it("does nothing when Blume's deps can't be located", async () => {
    const pkgDir = join(root, "lonely", "blume");
    await mkdir(pkgDir, { recursive: true });
    const outDir = join(root, "dist", ".prerender");
    await mkdir(outDir, { recursive: true });
    await linkRenderDeps(outDir, new Map(), pkgDir);
    expect(existsSync(join(outDir, "node_modules"))).toBe(false);
  });
});

describe("prerenderDepsPlugin", () => {
  it("links an external import to the copy its importer resolves", async () => {
    const { importer, nested, outDir, pkgDir } = await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    plugin.configResolved({ root: join(root, "project", ".blume") });
    const { calls, ctx } = context("prerender", {
      external: true,
      id: "js-yaml",
    });

    const resolved = await plugin.resolveId.handler.call(
      ctx,
      "js-yaml",
      `${importer}?v=1`,
      { isEntry: false }
    );
    await plugin.writeBundle.call(
      { environment: { name: "prerender" } },
      { dir: outDir }
    );

    expect(resolved).toEqual({ external: true, id: "js-yaml" });
    expect(calls).toEqual([{ importer: `${importer}?v=1`, source: "js-yaml" }]);
    expect(await linkTarget(join(outDir, "node_modules", "js-yaml"))).toBe(
      nested
    );
  });

  it("keeps the first importer's copy of a package", async () => {
    const { hoisted, importer, nested, outDir, pkgDir } =
      await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    const { ctx } = context("ssr", { external: true, id: "js-yaml" });
    await plugin.resolveId.handler.call(ctx, "js-yaml", importer, {});
    // A second importer outside Blume would resolve the hoisted copy.
    await plugin.resolveId.handler.call(
      ctx,
      "js-yaml/dist/js-yaml.mjs",
      join(root, "project", "src", "x.ts"),
      {}
    );
    await plugin.writeBundle.call(
      { environment: { name: "ssr" } },
      {
        dir: outDir,
      }
    );
    const target = await linkTarget(join(outDir, "node_modules", "js-yaml"));
    expect(target).toBe(nested);
    expect(target).not.toBe(hoisted);
  });

  it("resolves a virtual module's imports from the Vite root", async () => {
    const { hoisted, outDir, pkgDir } = await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    plugin.configResolved({ root: join(root, "project", ".blume") });
    const { ctx } = context("ssr", { external: true, id: "js-yaml" });
    await plugin.resolveId.handler.call(
      ctx,
      "js-yaml",
      "\0virtual:blume-data",
      {}
    );
    await plugin.writeBundle.call(
      { environment: { name: "ssr" } },
      {
        dir: outDir,
      }
    );
    expect(await linkTarget(join(outDir, "node_modules", "js-yaml"))).toBe(
      hoisted
    );
  });

  it("records nothing it can't place", async () => {
    const { outDir, pkgDir } = await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    const { ctx } = context("ssr", { external: true, id: "x" });
    // A builtin, a package nothing holds, and a virtual importer before the
    // Vite root is known.
    await plugin.resolveId.handler.call(ctx, "fs", undefined, {});
    await plugin.resolveId.handler.call(
      ctx,
      "missing-package",
      join(root, "project", "src", "x.ts"),
      {}
    );
    await plugin.resolveId.handler.call(ctx, "js-yaml", undefined, {});
    await plugin.writeBundle.call(
      { environment: { name: "ssr" } },
      {
        dir: outDir,
      }
    );
    expect(existsSync(join(outDir, "node_modules"))).toBe(false);
  });

  it("passes through imports Vite bundles or can't resolve", async () => {
    const { importer, outDir, pkgDir } = await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    const bundled = context("ssr", { id: "/abs/js-yaml.mjs" });
    expect(
      await plugin.resolveId.handler.call(bundled.ctx, "js-yaml", importer, {})
    ).toEqual({ id: "/abs/js-yaml.mjs" });
    const missing = context("ssr", null);
    expect(
      await plugin.resolveId.handler.call(missing.ctx, "nope", importer, {})
    ).toBeNull();
    await plugin.writeBundle.call(
      { environment: { name: "ssr" } },
      {
        dir: outDir,
      }
    );
    expect(existsSync(join(outDir, "node_modules"))).toBe(false);
  });

  it("gives a bundle with no external imports no node_modules", async () => {
    const { astro, outDir, pkgDir } = await isolatedFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    // The Cloudflare adapter bundles the Worker whole, so every package
    // import resolves to a file and none stays external.
    const { ctx } = context("ssr", { id: join(astro, "index.mjs") });
    await plugin.resolveId.handler.call(
      ctx,
      "astro",
      join(pkgDir, "src", "x.ts"),
      {}
    );
    await plugin.writeBundle.call(
      { environment: { name: "ssr" } },
      { dir: outDir }
    );
    expect(existsSync(join(outDir, "node_modules"))).toBe(false);
  });

  it("leaves the client build alone", async () => {
    const { importer, pkgDir } = await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    const { calls, ctx } = context("client", { external: true, id: "js-yaml" });
    expect(
      await plugin.resolveId.handler.call(ctx, "js-yaml", importer, {})
    ).toBeNull();
    expect(calls).toEqual([]);
    const clientDir = join(root, "project", "dist", "client");
    await mkdir(clientDir, { recursive: true });
    await plugin.writeBundle.call(
      { environment: { name: "client" } },
      {
        dir: clientDir,
      }
    );
    expect(existsSync(join(clientDir, "node_modules"))).toBe(false);
  });

  it("does nothing outside an environment", async () => {
    const { importer, pkgDir } = await conflictFixture();
    const plugin = prerenderDepsPlugin(pkgDir);
    const { calls, ctx } = context("ssr", { external: true, id: "js-yaml" });
    const bare = { resolve: ctx.resolve };
    expect(
      await plugin.resolveId.handler.call(bare, "js-yaml", importer, {})
    ).toBeNull();
    expect(calls).toEqual([]);
    // A `file` output has no `dir`.
    await plugin.writeBundle.call({ environment: { name: "ssr" } }, {});
  });

  it("matches only bare specifiers", () => {
    const { filter } = prerenderDepsPlugin(root).resolveId;
    expect(filter.id.test("js-yaml")).toBe(true);
    expect(filter.id.test("@scope/pkg/sub")).toBe(true);
    for (const id of [
      "./x",
      "../x",
      "/abs/x",
      "\0virtual",
      "node:fs",
      "virtual:blume-data",
      "C:\\x",
    ]) {
      expect(filter.id.test(id)).toBe(false);
    }
  });
});
