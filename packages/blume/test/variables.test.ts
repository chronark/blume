import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { dirname, join } from "pathe";

import { astroConfigTemplate } from "../src/astro/templates.ts";
import { variablesVitePlugin } from "../src/astro/variables.ts";
import { scanProject } from "../src/core/project-graph.ts";
import { blumeConfigSchema } from "../src/core/schema.ts";
import { readExpandedEntryText } from "../src/core/sources/read.ts";
import type { ProjectContext } from "../src/core/types.ts";
import {
  hasVariables,
  substituteVariables,
  substituteVariablesInBody,
  undefinedVariables,
} from "../src/core/variables.ts";
import { includePlugin } from "../src/markdown/include.ts";
import type { MdastNode } from "../src/markdown/mdast.ts";
import { variablesPlugin } from "../src/markdown/variables.ts";

/**
 * Content variables (`src/core/variables.ts`): `{{name}}` in a page reads the
 * configured value everywhere the page is read, and an undefined name in
 * prose fails the build.
 */

const VARS = { "api-url": "https://api.example.com", version: "2.1.0" };

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-variables-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    })
  );
  return root;
};

describe(substituteVariables, () => {
  it("replaces defined names, spaced or not, and leaves the rest", () => {
    expect(
      substituteVariables(
        `v{{version}} at {{ api-url }}, {{missing}}, \${{ secrets.TOKEN }}`,
        VARS
      )
    ).toBe(
      `v2.1.0 at https://api.example.com, {{missing}}, \${{ secrets.TOKEN }}`
    );
  });

  it("does nothing without variables or references", () => {
    expect(substituteVariables("{{version}}", {})).toBe("{{version}}");
    expect(substituteVariables("{{version}}")).toBe("{{version}}");
    expect(substituteVariables("no braces", VARS)).toBe("no braces");
    expect(hasVariables({})).toBe(false);
    expect(hasVariables(VARS)).toBe(true);
  });

  it("ignores inherited names", () => {
    expect(substituteVariables("{{constructor}}", VARS)).toBe(
      "{{constructor}}"
    );
  });
});

describe(substituteVariablesInBody, () => {
  it("leaves front matter as written", () => {
    expect(
      substituteVariablesInBody(
        "---\ntitle: v{{version}}\n---\nv{{version}}\n",
        VARS
      )
    ).toBe("---\ntitle: v{{version}}\n---\nv2.1.0\n");
    expect(substituteVariablesInBody("v{{version}}", VARS)).toBe("v2.1.0");
  });
});

describe(undefinedVariables, () => {
  it("reports undefined names in prose, not in code", () => {
    const text = [
      "Uses {{version}} and {{nope}}.",
      "Inline `{{also-fine}}` code.",
      "```js",
      "const x = '{{in-fence}}';",
      "```",
      "Then {{later}}.",
    ].join("\n");
    expect(undefinedVariables(text, VARS)).toEqual([
      { line: 1, name: "nope" },
      { line: 6, name: "later" },
    ]);
  });

  it("reports nothing until the site defines variables", () => {
    expect(undefinedVariables("{{anything}}", {})).toEqual([]);
    expect(undefinedVariables("plain", VARS)).toEqual([]);
  });
});

describe(variablesPlugin, () => {
  it("replaces references in a Markdown page's text, code, HTML, and links", () => {
    const changes: [string, string][] = [];
    const ctx = {
      setProperty: (_node: MdastNode, key: string, value: string) => {
        changes.push([key, value]);
      },
    };
    const plugin = variablesPlugin(VARS);
    plugin.text({ type: "text", value: "v{{version}}" }, ctx);
    plugin.inlineCode({ type: "inlineCode", value: "{{version}}" }, ctx);
    plugin.code({ type: "code", value: "curl {{api-url}}" }, ctx);
    plugin.html({ type: "html", value: "<b>{{version}}</b>" }, ctx);
    plugin.link(
      { title: "{{version}}", type: "link", url: "{{api-url}}/a" },
      ctx
    );
    plugin.image({ alt: "v{{version}}", type: "image", url: "/a.png" }, ctx);
    plugin.definition({ type: "definition", url: "{{api-url}}" }, ctx);
    // Nothing to replace, and a missing property: no change.
    plugin.text({ type: "text", value: "plain" }, ctx);
    plugin.link({ type: "link", url: "/b" }, ctx);
    expect(changes).toEqual([
      ["value", "v2.1.0"],
      ["value", "2.1.0"],
      ["value", "curl https://api.example.com"],
      ["value", "<b>2.1.0</b>"],
      ["url", "https://api.example.com/a"],
      ["title", "2.1.0"],
      ["alt", "v2.1.0"],
      ["url", "https://api.example.com"],
    ]);
  });
});

describe(variablesVitePlugin, () => {
  it("replaces references in .mdx source before the compiler reads it", () => {
    const plugin = variablesVitePlugin(VARS);
    expect(plugin.enforce).toBe("pre");
    expect(
      plugin.transform(
        "v{{version}}",
        "/docs/a.mdx?astroContentCollectionEntry"
      )
    ).toEqual({
      code: "v2.1.0",
      map: null,
    });
    expect(plugin.transform("v{{version}}", "/docs/a.ts")).toBeNull();
    expect(plugin.transform("plain", "/docs/a.mdx")).toBeNull();
  });
});

describe("includes", () => {
  it("substitutes an included file before it's parsed", async () => {
    const root = await project({
      "_note.mdx": "Note {{version}}.\n",
      "p.mdx": "",
    });
    const replaced: { raw: string }[] = [];
    await includePlugin({
      contentRoot: root,
      variables: VARS,
    }).mdxJsxFlowElement(
      { name: "include", type: "mdxJsxFlowElement" },
      {
        fileURL: pathToFileURL(join(root, "p.mdx")),
        replaceNode: (_node: MdastNode, replacement: { raw: string }) => {
          replaced.push(replacement);
        },
        report: () => {},
        source: "",
        sourceFormat: "mdx",
        textContent: () => "./_note.mdx",
      }
    );
    expect(replaced[0]?.raw).toContain("Note 2.1.0.");
  });
});

const CONFIG = `export default { variables: ${JSON.stringify(VARS)} };\n`;

describe("the scan", () => {
  it("fails an undefined name at its line and substitutes the rest", async () => {
    const root = await project({
      "blume.config.ts": CONFIG,
      "docs/_part.mdx": "Part {{nope-in-part}}.\n",
      "docs/index.mdx":
        "---\ntitle: Home\n---\n\n## New in {{version}}\n\nUses {{missing}}.\n\n<include>./_part.mdx</include>\n",
      "docs/plain.md": "---\ntitle: Plain\n---\n\nPlain {{version}}.\n",
    });
    const scanned = await scanProject(root, { mode: "build" });
    const undefinedOnes = scanned.diagnostics.filter(
      (diagnostic) => diagnostic.code === "BLUME_UNDEFINED_VARIABLE"
    );
    expect(
      undefinedOnes.map(({ file, line, message }) => ({
        file: file?.split("/docs/").at(-1),
        line,
        message,
      }))
    ).toEqual([
      {
        file: "index.mdx",
        line: 7,
        message:
          "{{missing}} isn't a defined variable, so it would show as written.",
      },
      {
        file: "_part.mdx",
        line: 1,
        message:
          "{{nope-in-part}} isn't a defined variable, so it would show as written.",
      },
    ]);
    const home = scanned.graph.pages.find((page) => page.route === "/");
    expect(home?.headings.map((heading) => heading.text)).toContain(
      "New in 2.1.0"
    );
  });

  it("leaves a site with no variables alone", async () => {
    const root = await project({
      "docs/index.md": "---\ntitle: Home\n---\n\nHandlebars uses {{name}}.\n",
    });
    const scanned = await scanProject(root, { mode: "build" });
    expect(
      scanned.diagnostics.filter(
        (diagnostic) => diagnostic.code === "BLUME_UNDEFINED_VARIABLE"
      )
    ).toEqual([]);
  });
});

describe(readExpandedEntryText, () => {
  it("gives search, mirrors, and llms.txt the substituted body", async () => {
    const root = await project({
      "blume.config.ts": CONFIG,
      "docs/_part.mdx": "Part {{version}}.\n",
      "docs/index.mdx":
        "---\ntitle: v{{version}}\n---\n\nHome {{version}}.\n\n<include>./_part.mdx</include>\n",
      "docs/plain.md": "---\ntitle: Plain\n---\n\nPlain {{version}}.\n",
    });
    const scanned = await scanProject(root, { mode: "build" });
    const text = (route: string) => {
      const page = scanned.graph.pages.find((entry) => entry.route === route);
      if (!page) {
        throw new Error(`no page at ${route}`);
      }
      return readExpandedEntryText(scanned, page);
    };
    const home = await text("/");
    expect(home).toContain("title: v{{version}}");
    expect(home).toContain("Home 2.1.0.");
    expect(home).toContain("Part 2.1.0.");
    expect(await text("/plain")).toContain("Plain 2.1.0.");
  });
});

describe("the generated Astro config", () => {
  const context: ProjectContext = {
    componentsFile: null,
    configFile: null,
    contentRoot: "/p/docs",
    outDir: "/p/.blume",
    pagesRoot: null,
    root: "/p",
    themeFile: null,
  };
  const configFor = (variables: Record<string, string>): string =>
    astroConfigTemplate({
      askPath: "/p/.blume/src/generated/Ask.astro",
      config: blumeConfigSchema.parse({ variables }),
      consentClientPath: "/p/.blume/src/generated/consent-client.ts",
      contentRoutes: [],
      context,
      examplesPath: "/p/.blume/src/generated/examples.ts",
      examplesThemePath: "/p/.blume/src/generated/examples.css",
      features: { epub: false, mermaid: false },
      featuresPath: "/p/.blume/src/generated/features.ts",
      needsReact: false,
      pages: [],
      searchClientPath: "/p/.blume/src/generated/search-client.ts",
      themePath: "/p/.blume/src/generated/app.css",
    });

  it("substitutes .mdx before the compiler only when the site defines variables", () => {
    const withVariables = configFor(VARS);
    expect(withVariables).toContain(
      `variablesVitePlugin(${JSON.stringify(VARS)}), tailwindcss()`
    );
    expect(withVariables).toContain('variablesVitePlugin } from "blume/astro"');
    expect(configFor({})).not.toContain("variablesVitePlugin");
  });
});

describe("the variables config", () => {
  it("rejects a name or a value that can't work", () => {
    expect(
      blumeConfigSchema.safeParse({ variables: { "has space": "x" } }).success
    ).toBe(false);
    expect(
      blumeConfigSchema.safeParse({ variables: { ok: "two\nlines" } }).success
    ).toBe(false);
    expect(blumeConfigSchema.parse({}).variables).toEqual({});
  });
});
