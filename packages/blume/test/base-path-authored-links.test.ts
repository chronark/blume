import { afterEach, describe, expect, it } from "bun:test";

import {
  publishRuntimeModules,
  readRuntimeModule,
  RUNTIME_MODULE_FILES,
} from "../src/astro/runtime-modules.ts";
import type { RuntimeModuleId } from "../src/astro/runtime-modules.ts";
import {
  withAuthoredBasePath,
  withBasePath,
  withComposedBasePath,
} from "../src/core/base-path.ts";
import {
  blumeMarkdownProcessor,
  blumeMdxProcessor,
} from "../src/markdown/index.ts";

// Authored links under the two bases. `basePath` mounts the docs routes, while
// `deployment.base` moves the whole site — `public/` included — so a public
// file gains the deployment base but never `basePath`. The "already based"
// check reads only the path part of a link, so a fragment or query can't hide
// a base written by hand.

describe("withBasePath with a fragment or query", () => {
  it("leaves a hand-written base alone when a suffix follows it", () => {
    expect(withBasePath("/docs", "/docs#install")).toBe("/docs#install");
    expect(withBasePath("/docs", "/docs?tab=npm")).toBe("/docs?tab=npm");
    expect(withBasePath("/docs", "/docs/guide#x")).toBe("/docs/guide#x");
  });

  it("still bases a sibling path that carries a suffix", () => {
    expect(withBasePath("/docs", "/documentation#x")).toBe(
      "/docs/documentation#x"
    );
    expect(withBasePath("/docs", "/guide#x")).toBe("/docs/guide#x");
  });
});

describe("withComposedBasePath with a fragment or query", () => {
  it("leaves a link under the full composite alone", () => {
    expect(withComposedBasePath("/base", "/docs", "/base/docs#x")).toBe(
      "/base/docs#x"
    );
    expect(withComposedBasePath("/base", "/docs", "/base/docs?q=1")).toBe(
      "/base/docs?q=1"
    );
  });

  it("adds only the deployment base to a hand-written basePath link", () => {
    expect(withComposedBasePath("/base", "/docs", "/docs#install")).toBe(
      "/base/docs#install"
    );
  });
});

describe("withAuthoredBasePath", () => {
  const served = new Set(["/docs/releases/v1.2"]);
  const servesPage = (route: string): boolean => served.has(route);

  it("gives a page link the composed stack", () => {
    expect(withAuthoredBasePath("/sub", "/docs", "/guide", servesPage)).toBe(
      "/sub/docs/guide"
    );
    expect(
      withAuthoredBasePath("/sub", "/docs", "/releases/v1.2#notes", servesPage)
    ).toBe("/sub/docs/releases/v1.2#notes");
  });

  it("gives a public file the deployment base alone", () => {
    expect(
      withAuthoredBasePath("/sub", "/docs", "/files/spec.pdf", servesPage)
    ).toBe("/sub/files/spec.pdf");
    expect(
      withAuthoredBasePath("/sub", "/docs", "/logo.png?v=2", servesPage)
    ).toBe("/sub/logo.png?v=2");
    // No deployment base: the file stays at the site root.
    expect(withAuthoredBasePath("", "/docs", "/spec.pdf", servesPage)).toBe(
      "/spec.pdf"
    );
    // A deployment base written by hand isn't doubled.
    expect(
      withAuthoredBasePath("/sub", "/docs", "/sub/spec.pdf", servesPage)
    ).toBe("/sub/spec.pdf");
  });

  it("passes non-internal targets through", () => {
    expect(
      withAuthoredBasePath("/sub", "/docs", "https://x.com/a.pdf", servesPage)
    ).toBe("https://x.com/a.pdf");
    expect(withAuthoredBasePath("/sub", "/docs", "#h", servesPage)).toBe("#h");
    expect(withAuthoredBasePath("/sub", "/docs", "./a.pdf", servesPage)).toBe(
      "./a.pdf"
    );
  });
});

// ---------------------------------------------------------------------------
// The Markdown rewrite
// ---------------------------------------------------------------------------

// Publishing replaces the whole snapshot set; keep whatever another suite left.
const saved = new Map<RuntimeModuleId, string>();
for (const id of RUNTIME_MODULE_FILES.keys()) {
  const text = readRuntimeModule(id);
  if (text !== undefined) {
    saved.set(id, text);
  }
}

afterEach(() => publishRuntimeModules(saved));

const publishRoutes = (paths: string[]): void => {
  const modules = new Map(saved);
  modules.set(
    "blume:data",
    JSON.stringify({
      config: { i18n: null },
      routes: paths.map((path) => ({ path })),
    })
  );
  publishRuntimeModules(modules);
};

const render = async (
  source: string,
  options: Parameters<typeof blumeMarkdownProcessor>[0]
): Promise<string> => {
  const renderer = await blumeMarkdownProcessor(options).createRenderer({});
  const result = await renderer.render(source);
  return result.code;
};

describe("markdown base-links under deployment.base", () => {
  it("serves images and file links from the deployment base, not basePath", async () => {
    publishRoutes(["/docs/guide", "/docs/releases/v1.2"]);
    const html = await render(
      [
        "![Logo](/logo.png)",
        "[Spec](/files/spec.pdf)",
        "[Guide](/guide)",
        "[Release](/releases/v1.2)",
        "![Hand-written](/sub/diagram.svg)",
        "![Relative](./diagram.png)",
      ].join("\n\n"),
      { basePath: "/docs", deployBase: "/sub" }
    );
    expect(html).toContain('src="/sub/logo.png"');
    expect(html).toContain('href="/sub/files/spec.pdf"');
    expect(html).toContain('href="/sub/docs/guide"');
    expect(html).toContain('href="/sub/docs/releases/v1.2"');
    expect(html).toContain('src="/sub/diagram.svg"');
    expect(html).not.toContain("/sub/sub/");
    expect(html).not.toContain("/docs/logo.png");
    expect(html).not.toContain("/docs/files/spec.pdf");
  });

  it("bases a reference-style image through its definition", async () => {
    publishRoutes([]);
    const html = await render("![Logo][logo]\n\n[logo]: /logo.png", {
      deployBase: "/sub",
    });
    expect(html).toContain('src="/sub/logo.png"');
  });

  it("leaves images at the root when only basePath is set", async () => {
    publishRoutes([]);
    const html = await render("![Logo](/logo.png)\n\n[Spec](/spec.pdf)", {
      basePath: "/docs",
    });
    expect(html).toContain('src="/logo.png"');
    expect(html).toContain('href="/spec.pdf"');
  });
});

describe("raw HTML URLs under deployment.base", () => {
  const RAW = [
    'Go <a href="/guide">home</a> or <a href="/sub/done">done</a>.',
    "",
    '<div><img src="/logo.png" alt="Logo"><iframe src="/demo/"></iframe></div>',
    "",
    '<a href="https://x.dev">x</a> <a href="//cdn.dev/a.js">c</a> <a href="#top">t</a> <img src="./a.png">',
  ].join("\n");

  it("gains the deployment base in a .md page, and no basePath", async () => {
    publishRoutes(["/docs/guide"]);
    const html = await render(RAW, { basePath: "/docs", deployBase: "/sub" });
    expect(html).toContain('<a href="/sub/guide">home</a>');
    expect(html).toContain('<a href="/sub/done">done</a>');
    expect(html).toContain('<img src="/sub/logo.png" alt="Logo">');
    expect(html).toContain('<iframe src="/sub/demo/">');
    expect(html).toContain(
      '<a href="https://x.dev">x</a> <a href="//cdn.dev/a.js">c</a> <a href="#top">t</a> <img src="./a.png">'
    );

    // With basePath alone, a raw URL ships as written.
    expect(await render(RAW, { basePath: "/docs" })).toContain(
      '<a href="/guide">home</a>'
    );
  });

  it("gains it on an .mdx element, leaving components to their own base", async () => {
    publishRoutes([]);
    const processor = blumeMdxProcessor({ deployBase: "/sub" });
    if (!processor.createMdxRenderer) {
      throw new Error("The satteri processor has no MDX renderer.");
    }
    const renderer = await processor.createMdxRenderer({}, { optimize: false });
    const { code } = await renderer.process(
      [
        '<a href="/guide">Guide</a> <img src="/logo.png" />',
        '<a href="#top" title="/x">Top</a> <a href={href}>E</a>',
        '<Card href="/guide" />',
      ].join("\n\n"),
      "/site/docs/index.mdx",
      {}
    );
    expect(code).toContain('href: "/sub/guide"');
    expect(code).toContain('src: "/sub/logo.png"');
    expect(code).toContain('href: "#top"');
    expect(code).toContain('title: "/x"');
    expect(code).toMatch(/\bhref,\s/u);
    // `components/content/base-href.ts` bases a component's href.
    expect(code).toContain('href: "/guide"');
  });
});
