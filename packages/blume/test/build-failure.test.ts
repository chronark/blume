import { afterAll, describe, expect, it, mock } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import {
  astroBuildDiagnostics,
  buildFailureLocator,
} from "../src/cli/build-failure.ts";
import type { MdxFailureLocator } from "../src/cli/build-failure.ts";
import type { MdxFailureSite } from "../src/core/mdx-syntax.ts";
import { packageRoot } from "../src/core/package-root.ts";
import { scanProject } from "../src/core/project-graph.ts";

/** An error carrying extra fields, the way Rolldown and Vite attach them. */
const errorWith = (
  message: string,
  fields: Record<string, string | Error[] | Record<string, string | number>>,
  name = "Error"
): Error => {
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, fields);
};

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** Write `files` under a fresh temp dir and return its path. */
const makeFiles = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-build-failure-unit-"));
  tempDirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    })
  );
  return root;
};

/** A locator that answers `site` and records what it was asked. */
const locatorFor = (site: MdxFailureSite | null) =>
  mock<MdxFailureLocator>(() => Promise.resolve(site));

describe("astroBuildDiagnostics", () => {
  it("reports each failure Rolldown collected at the file and position it names", async () => {
    const mdx = errorWith(
      "11:1: Unexpected end of file in expression",
      {
        id: "/site/docs/index.mdx",
        loc: { column: 1, file: "/site/docs/index.mdx", line: 11 },
      },
      "MDXError"
    );
    const unresolved = errorWith("Could not resolve './missing.astro'", {
      id: "/site/docs/guide.mdx",
    });
    const aggregate = errorWith("Build failed with 2 errors:\n\n…", {
      errors: [mdx, unresolved],
    });
    const locate = locatorFor(null);

    expect(await astroBuildDiagnostics(aggregate, { locate })).toEqual([
      {
        code: "BLUME_BUILD_FAILED",
        column: 1,
        file: "/site/docs/index.mdx",
        line: 11,
        message: "MDXError: 11:1: Unexpected end of file in expression",
        severity: "error",
      },
      {
        code: "BLUME_BUILD_FAILED",
        column: undefined,
        file: "/site/docs/guide.mdx",
        line: undefined,
        message: "Could not resolve './missing.astro'",
        severity: "error",
      },
    ]);
    // Placed by the compiler, or not an MDX failure: nothing to look for.
    expect(locate).not.toHaveBeenCalled();
  });

  it("reports an error with nothing collected as itself", async () => {
    const [diagnostic] = await astroBuildDiagnostics(
      errorWith("Cannot read properties of undefined", { errors: [] })
    );
    expect(diagnostic).toEqual({
      code: "BLUME_BUILD_FAILED",
      column: undefined,
      file: undefined,
      line: undefined,
      message: "Cannot read properties of undefined",
      severity: "error",
    });
  });

  it("keeps the diagnostic of a BlumeError raised inside the build", async () => {
    // An `astro:build:done` hook runs Blume's source, so its BlumeError is a
    // copy of the class the CLI bundle's `instanceof` doesn't match.
    const diagnostic = {
      code: "BLUME_SEARCH_SYNC_FAILED",
      message: "Search sync to typesense failed: Forbidden",
      severity: "error",
      suggestion: "Check TYPESENSE_ADMIN_API_KEY.",
    } as const;
    expect(
      await astroBuildDiagnostics(
        errorWith(diagnostic.message, { diagnostic }, "BlumeError")
      )
    ).toEqual([diagnostic]);
  });

  it("drops a location it can't read rather than guessing", async () => {
    const [diagnostic] = await astroBuildDiagnostics(
      errorWith("Broken", { loc: { file: "/site/a.mdx", line: "eleven" } })
    );
    expect(diagnostic?.file).toBeUndefined();
    expect(diagnostic?.message).toBe("Broken");
  });

  it("places an undefined name at the expression that reads it", async () => {
    const locate = locatorFor({
      column: 7,
      expression: "{user.name}",
      file: "/site/docs/_partials/user.md",
      line: 3,
    });
    const [diagnostic] = await astroBuildDiagnostics(
      errorWith(
        "user is not defined",
        { id: "/site/docs/page.mdx" },
        "ReferenceError"
      ),
      { locate }
    );
    expect(locate).toHaveBeenCalledWith("/site/docs/page.mdx", {
      kind: "undefined-name",
      name: "user",
    });
    expect(diagnostic).toEqual({
      code: "BLUME_MDX_UNDEFINED_NAME",
      column: 7,
      file: "/site/docs/_partials/user.md",
      line: 3,
      message:
        "`{user.name}` reads `user`, which isn't defined, so the page fails to render. In .mdx, `{…}` is a JavaScript expression.",
      severity: "error",
      suggestion:
        "To show the braces as text: escape each opening brace (`\\{`) or put it in inline code. For a value every page shares, define a variable in blume.config.ts and write `{{name}}`.",
    });
  });

  it("suggests defining a `{{name}}` the site has no variable for", async () => {
    // Bun's JavaScriptCore words the error its own way.
    const [diagnostic] = await astroBuildDiagnostics(
      errorWith(
        "Can't find variable: version",
        { id: "/site/docs/page.mdx" },
        "ReferenceError"
      ),
      {
        locate: locatorFor({
          column: 9,
          expression: "{{version}}",
          file: "/site/docs/page.mdx",
          line: 5,
        }),
      }
    );
    expect(diagnostic?.suggestion).toBe(
      "Define `version` under `variables` in blume.config.ts, or show the braces as text: escape each opening brace (`\\{`) or put it in inline code."
    );
  });

  it("names the page when the expression can't be found", async () => {
    const [diagnostic] = await astroBuildDiagnostics(
      errorWith(
        "who is not defined",
        { id: "/site/docs/page.mdx" },
        "ReferenceError"
      )
    );
    expect(diagnostic).toMatchObject({
      code: "BLUME_MDX_UNDEFINED_NAME",
      file: "/site/docs/page.mdx",
      line: undefined,
      message:
        "`who` isn't defined, so the page fails to render. In .mdx, `{…}` is a JavaScript expression, and one reads it.",
    });
  });

  it("leaves a render error outside an .mdx page as a build failure", async () => {
    const locate = locatorFor(null);
    const [diagnostic] = await astroBuildDiagnostics(
      errorWith(
        "x is not defined",
        { id: "/site/src/pages/[...slug].astro" },
        "ReferenceError"
      ),
      { locate }
    );
    expect(diagnostic?.code).toBe("BLUME_BUILD_FAILED");
    expect(locate).not.toHaveBeenCalled();
  });

  it("reports an unplaced compile error where the page's parse finds it", async () => {
    const page = "/site/docs/page.mdx";
    const found = {
      code: "BLUME_MDX_SYNTAX",
      file: "/site/docs/_partials/note.md",
      line: 4,
      message: "MDX can't parse this file once docs/page.mdx includes it: …",
      severity: "error",
    } as const;
    const unplaced = errorWith(
      "Could not parse expression with oxc: Unexpected token (mdxjs-rs:oxc)",
      { id: page, loc: { file: page } },
      "MDXError"
    );
    const locate = locatorFor({ ...found, diagnostic: found });
    expect(await astroBuildDiagnostics(unplaced, { locate })).toEqual([found]);
    expect(locate).toHaveBeenCalledWith(page, { kind: "syntax" });

    const [unfound] = await astroBuildDiagnostics(unplaced, {
      locate: locatorFor(null),
    });
    expect(unfound).toMatchObject({ code: "BLUME_BUILD_FAILED", file: page });
  });

  it("says which tsconfig extends a file that can't be found", async () => {
    const root = await makeFiles({
      "tsconfig.json":
        '{\n  "extends": "@tsconfig/missing/tsconfig.json",\n  "compilerOptions": {}\n}\n',
    });
    const error = errorWith(
      "`astro sync` command failed to generate content collection types: Tsconfig not found @tsconfig/missing/tsconfig.json.",
      {},
      "GenerateContentTypesError"
    );
    expect(await astroBuildDiagnostics(error, { root })).toEqual([
      {
        code: "BLUME_TSCONFIG_EXTENDS",
        file: join(root, "tsconfig.json"),
        line: 2,
        message:
          "tsconfig.json extends `@tsconfig/missing/tsconfig.json`, which can't be found. The build reads the project's tsconfig.json to resolve imports, so it stops here.",
        severity: "error",
        suggestion:
          "Install the package that provides it (`@tsconfig/missing`), or remove it from `extends` in tsconfig.json.",
      },
    ]);
  });

  it("reads the resolver's error under the sync's, and a local extends", async () => {
    const root = await makeFiles({
      "jsconfig.json": '{ "extends": ["./base.json", "./strict.json"] }\n',
    });
    const error = errorWith("Failed to generate content types.", {});
    error.cause = new Error("Tsconfig not found ./strict.json");
    const [diagnostic] = await astroBuildDiagnostics(error, { root });
    expect(diagnostic).toMatchObject({
      file: join(root, "jsconfig.json"),
      line: 1,
      suggestion:
        "Restore `./strict.json`, or remove it from `extends` in jsconfig.json.",
    });
  });

  it("names no file when the project's tsconfig doesn't extend the target", async () => {
    const root = await makeFiles({ "tsconfig.json": "{}\n" });
    const error = errorWith("Tsconfig not found shared-config", {});
    for (const context of [{ root }, {}]) {
      // oxlint-disable-next-line no-await-in-loop -- two cheap, ordered reads
      const [diagnostic] = await astroBuildDiagnostics(error, context);
      expect(diagnostic).toMatchObject({
        file: undefined,
        line: undefined,
        message:
          "A tsconfig.json in the project extends `shared-config`, which can't be found. The build reads the project's tsconfig.json to resolve imports, so it stops here.",
        suggestion:
          "Install the package that provides it (`shared-config`), or remove it from `extends` in tsconfig.json.",
      });
    }
  });
});

describe("buildFailureLocator", () => {
  it("reads a page with its source's includes and the site's variables", async () => {
    const root = await makeFiles({
      "blume.config.ts":
        'export default { variables: { version: "2.1.0" } };\n',
      "docs/_partials/who.md": "Partial.\n\nHello {{who}} on {{version}}.\n",
      "docs/index.mdx":
        "---\ntitle: Home\n---\n\n<include>./_partials/who.md</include>\n",
    });
    const project = await scanProject(root, { mode: "build" });
    const locate = buildFailureLocator(project);
    expect(
      await locate(join(root, "docs/index.mdx"), {
        kind: "undefined-name",
        name: "who",
      })
    ).toEqual({
      column: 7,
      expression: "{{who}}",
      file: join(root, "docs/_partials/who.md"),
      line: 3,
    });
    // A file no page has: read on its own, without includes.
    expect(
      await locate(join(root, "docs/_partials/who.md"), {
        kind: "undefined-name",
        name: "who",
      })
    ).toMatchObject({ line: 3 });
  });
});

/**
 * End to end: a page whose MDX doesn't parse fails the build at the scan,
 * at its line, and `--no-strict` drops it; a failure only Astro sees (a
 * partial's compile error, an expression that reads an undefined name) is
 * placed in the file that holds it; and a BlumeError raised in an Astro hook
 * keeps its own code. None of them is a `BLUME_INTERNAL`.
 */
describe("blume build failures", () => {
  const PACKAGE_ROOT = packageRoot();
  const CLI = join(PACKAGE_ROOT, "bin", "blume.mjs");
  const roots: string[] = [];

  afterAll(async () => {
    await Promise.all(
      roots.map((root) => rm(root, { force: true, recursive: true }))
    );
  });

  // Local fonts keep the build off Google Fonts (see
  // configured-integrations.test.ts); KaTeX ships a real font file.
  const LOCAL_FONT = join(
    PACKAGE_ROOT,
    "node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2"
  );
  const localFont = { name: "Probe", variants: [{ src: LOCAL_FONT }] };

  const writeProject = async (
    files: Record<string, string>
  ): Promise<string> => {
    const root = await mkdtemp(join(PACKAGE_ROOT, "blume-build-failure-"));
    roots.push(root);
    await Promise.all(
      Object.entries(files).map(async ([relativePath, content]) => {
        const path = join(root, relativePath);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
      })
    );
    // Generated configs resolve bare `blume/*` imports from the fixture root.
    await mkdir(join(root, "node_modules"), { recursive: true });
    await symlink(PACKAGE_ROOT, join(root, "node_modules/blume"), "junction");
    return root;
  };

  const fonts = `theme: { fonts: ${JSON.stringify({
    body: localFont,
    display: localFont,
    mono: localFont,
  })} }`;
  const CONFIG = `export default { ${fonts} };\n`;

  /** Run `blume build` in `root`: its exit code and everything it printed. */
  const build = async (
    root: string,
    args: string[],
    env: Record<string, string> = {}
  ): Promise<{ exitCode: number; text: string }> => {
    const proc = Bun.spawn(["bun", CLI, "build", ...args], {
      cwd: root,
      env: { ...process.env, ...env, NO_COLOR: "1" },
      stderr: "pipe",
      stdout: "pipe",
    });
    const output = Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    // A failing build exits on its own; the guard only keeps a wedged one
    // from holding the suite until the runner's timeout.
    const exitCode = await Promise.race([
      proc.exited,
      Bun.sleep(90_000).then(() => null),
    ]);
    if (exitCode === null) {
      proc.kill("SIGKILL");
      throw new Error("`blume build` did not exit within 90s");
    }
    const streams = await output;
    return { exitCode, text: streams.join("\n") };
  };

  it("fails on a page that doesn't parse, and drops it under --no-strict", async () => {
    // A draw.io export: the diagram rides in a `content` attribute that
    // pushes the end of the `<svg>` tag past what Astro reads for its size.
    const drawio = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" content="${"&lt;diagram&gt;".repeat(100)}"><rect width="120" height="60"/></svg>\n`;
    const root = await writeProject({
      "blume.config.ts": CONFIG,
      "docs/broken.mdx":
        '---\ntitle: Broken\n---\n\n<Callout type="info">\nHello\n</Callout>\n\n{oops\n',
      "docs/diagram.mdx": "# Diagram\n\n![Flow](./flow.svg)\n",
      "docs/flow.svg": drawio,
      "docs/index.md": "# Home\n\nHello.\n",
    });

    const strict = await build(root, ["--isolated"]);
    expect(strict.exitCode).toBe(1);
    expect(strict.text).toContain(
      "BLUME_MDX_SYNTAX MDX can't parse this page:"
    );
    expect(strict.text).toContain("at docs/broken.mdx:9:1");
    expect(strict.text).toContain("BLUME_SVG_UNOPTIMIZED `./flow.svg`");
    expect(strict.text).not.toContain("BLUME_INTERNAL");

    const lenient = await build(root, ["--isolated", "--no-strict"]);
    expect(lenient.exitCode).toBe(0);
    expect(lenient.text).toContain(
      "1 page(s) failed validation and were dropped from the site."
    );
    const dist = join(root, ".blume-verify/dist");
    expect(existsSync(join(dist, "broken"))).toBe(false);
    // The SVG ships as it is, from the content-assets endpoint.
    expect(await readFile(join(dist, "diagram/index.html"), "utf-8")).toContain(
      '<img src="/blume-assets/content/docs/flow.svg" alt="Flow"'
    );
    expect(existsSync(join(dist, "blume-assets/content/docs/flow.svg"))).toBe(
      true
    );
  }, 240_000);

  it("places a compile error in the partial that holds it", async () => {
    const root = await writeProject({
      "blume.config.ts": CONFIG,
      "docs/_partials/note.md": "Partial.\n\nSome text\n{: .note }\n",
      "docs/index.mdx":
        "---\ntitle: Home\n---\n\nIntro.\n\n<include>./_partials/note.md</include>\n",
    });
    const { exitCode, text } = await build(root, ["--isolated"]);
    expect(exitCode).toBe(1);
    expect(text).toContain(
      "BLUME_MDX_SYNTAX MDX can't parse this file once docs/index.mdx includes it: Could not parse expression with oxc"
    );
    expect(text).toContain("at docs/_partials/note.md:4:2");
    expect(text).not.toContain("BLUME_BUILD_FAILED");
  }, 120_000);

  it("places an undefined name at the expression that reads it", async () => {
    const root = await writeProject({
      "blume.config.ts": CONFIG,
      "docs/_partials/who.md": "Partial.\n\nHello {{who}}.\n",
      "docs/index.mdx":
        "---\ntitle: Home\n---\n\n<include>./_partials/who.md</include>\n",
    });
    const { exitCode, text } = await build(root, ["--isolated"]);
    expect(exitCode).toBe(1);
    expect(text).toContain(
      "BLUME_MDX_UNDEFINED_NAME `{{who}}` reads `who`, which isn't defined"
    );
    expect(text).toContain("at docs/_partials/who.md:3:7");
    expect(text).not.toContain("BLUME_BUILD_FAILED");
  }, 120_000);

  it("fails with the sync's own code when a hosted search sync fails", async () => {
    // A Typesense host nothing listens on refuses the connection at once. The
    // sync runs in `astro:build:done`, which an isolated build skips.
    const root = await writeProject({
      "blume.config.ts": `import { typesense } from "blume/search";

export default {
  search: typesense({ apiKey: "k", collection: "docs", host: "127.0.0.1", port: 1, protocol: "http" }),
  ${fonts},
};
`,
      "docs/index.md": "# Home\n\nHello.\n",
    });
    const { exitCode, text } = await build(root, [], {
      TYPESENSE_ADMIN_API_KEY: "admin",
    });
    expect(exitCode).toBe(1);
    expect(text).toContain(
      "BLUME_SEARCH_SYNC_FAILED Search sync to typesense failed:"
    );
    expect(text).toContain("unset TYPESENSE_ADMIN_API_KEY");
    expect(text).not.toContain("BLUME_BUILD_FAILED");
  }, 120_000);
});
