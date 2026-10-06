import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { createJiti } from "jiti";
import type { Jiti, JitiOptions } from "jiti";
import { join } from "pathe";
import { z } from "zod";

import { packageRoot } from "./package-root.ts";

/**
 * Blume's own `exports` map, each entry reduced to the file it runs from: the
 * target itself, or a conditions object's `default` (its `types` is only for
 * the consumer's typechecker).
 */
const blumeExportsSchema = z.object({
  exports: z.record(
    z.string(),
    z.union([
      z.string(),
      z.object({ default: z.string() }).transform((target) => target.default),
    ])
  ),
});

let aliases: Record<string, string> | undefined;

/**
 * jiti aliases that resolve `blume` and every subpath it exports to the
 * running Blume package, read from its own `exports` map. Without them a user
 * module resolves `blume` by walking up from its own folder, so a `meta.ts`
 * under a content root outside the project (`content.root: "../docs"`, a
 * sibling workspace package) or a file `blume.config.ts` imports from beside
 * the project can't find the `blume` installed in the project. A wildcard
 * export (`./core/*`) becomes a prefix alias (`blume/core/`), which jiti
 * extends with the rest of the specifier.
 */
export const blumeModuleAliases = (): Record<string, string> => {
  if (!aliases) {
    const root = packageRoot();
    const { exports } = blumeExportsSchema.parse(
      JSON.parse(readFileSync(join(root, "package.json"), "utf-8"))
    );
    aliases = Object.fromEntries(
      Object.entries(exports).map(([subpath, target]) => [
        join("blume", subpath).replace(/\*$/u, ""),
        join(root, target).replace(/\*$/u, ""),
      ])
    );
  }
  return aliases;
};

/**
 * One jiti instance for every file a loader is called with, created on its
 * first call so that importing this module (the `blume` barrel reaches it
 * through `defineConfig`) reads nothing from disk. `moduleCache: false`
 * ensures edits are picked up on each load, which is what makes dev-server
 * regeneration reflect config/meta changes.
 */
const lazyJiti = (options: JitiOptions): (() => Jiti) => {
  let jiti: Jiti | undefined;
  return () => {
    jiti ??= createJiti(import.meta.url, {
      ...options,
      alias: blumeModuleAliases(),
      moduleCache: false,
    });
    return jiti;
  };
};

/**
 * Create a loader for user-authored ESM/TS modules (`blume.config.ts`,
 * `meta.ts`), in which `blume` resolves to the running package wherever the
 * module lives (see {@link blumeModuleAliases}).
 */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- user-authored modules can export anything; callers validate the loaded value at their own boundary
export const createModuleLoader = (): ((file: string) => Promise<unknown>) => {
  const jiti = lazyJiti({});
  return async (file: string) => {
    const loaded = await jiti().import<{ default?: unknown }>(file);
    return loaded?.default ?? loaded;
  };
};

/**
 * Create a loader for a module whose default export is its whole value
 * (`blume.config.ts`). Unlike {@link createModuleLoader}, it never falls back
 * to the module's namespace: a module with no default export, or one that
 * exports `null`/`undefined`, resolves to `undefined` so the caller can say
 * so, instead of validating `{}` (a bare `defineConfig({…})` call) or
 * `{ config }` (a named export). jiti's default interop is off because it
 * throws on `export default null`. Turning it off changes how jiti compiles
 * every module the config reaches, Blume's own source included, but jiti keys
 * its disk cache by file and source alone, so this loader keeps a cache of its
 * own: sharing one, it would run code compiled for {@link createModuleLoader}
 * (and that loader, code compiled for this one), whichever loaded the file
 * first.
 */
export const createDefaultExportLoader: typeof createModuleLoader = () => {
  const jiti = lazyJiti({
    fsCache: join(tmpdir(), "jiti-blume-default-export"),
    interopDefault: false,
  });
  return async (file: string) => {
    const loaded = await jiti().import<{ default?: unknown }>(file);
    return loaded.default ?? undefined;
  };
};
