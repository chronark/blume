import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { dirname, join } from "pathe";

import { scanProject } from "../src/core/project-graph.ts";
import {
  isUnmeasurableSvg,
  unmeasurableSvgDiagnostics,
  unmeasurableSvgUrl,
} from "../src/core/svg-images.ts";
import type { PageRecord } from "../src/core/types.ts";
import type { MdastNode } from "../src/markdown/mdast.ts";
import { svgFallbackPlugin } from "../src/markdown/svg-fallback.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

// A draw.io export: the diagram rides in a `content` attribute that pushes
// the end of the `<svg>` tag past the first 1,000 bytes Astro reads.
const DRAWIO = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" content="${"&lt;diagram&gt;".repeat(100)}"><rect width="120" height="60"/></svg>\n`;
const SIZED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"/>\n';
const SIZELESS = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>\n';

const makeFiles = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-svg-images-"));
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

const FILES = {
  "docs/diagrams/flow.svg": DRAWIO,
  "docs/diagrams/plain.svg": SIZELESS,
  "docs/logo.svg": SIZED,
  "docs/photo.png": "not really a png",
};

describe("isUnmeasurableSvg", () => {
  it("is true only for an SVG Astro can't read the size of", async () => {
    const root = await makeFiles(FILES);
    const docs = join(root, "docs");
    expect(await isUnmeasurableSvg(join(docs, "diagrams/flow.svg"))).toBe(true);
    expect(await isUnmeasurableSvg(join(docs, "diagrams/plain.svg"))).toBe(
      true
    );
    expect(await isUnmeasurableSvg(join(docs, "logo.svg"))).toBe(false);
    // Not an SVG, or not there: left to the image pipeline.
    expect(await isUnmeasurableSvg(join(docs, "photo.png"))).toBe(false);
    expect(await isUnmeasurableSvg(join(docs, "missing.svg"))).toBe(false);
  });
});

describe("unmeasurableSvgUrl", () => {
  it("serves an unmeasurable SVG from the content assets endpoint", async () => {
    const root = await makeFiles(FILES);
    const docs = join(root, "docs");
    expect(await unmeasurableSvgUrl(docs, "./diagrams/flow.svg", root)).toBe(
      "/blume-assets/content/docs/diagrams/flow.svg"
    );
    expect(await unmeasurableSvgUrl(docs, "./logo.svg", root)).toBeNull();
    expect(await unmeasurableSvgUrl(docs, "./missing.svg", root)).toBeNull();
  });
});

/** A page record with only what the SVG check reads. */
const page = (
  sourcePath: string | undefined,
  links: PageRecord["links"]
): PageRecord => {
  // SAFETY: the check reads only `sourcePath` and `links`.
  const record = { links, sourcePath } as PageRecord;
  return record;
};

describe("unmeasurableSvgDiagnostics", () => {
  it("warns at each embed of an unmeasurable SVG, once per line", async () => {
    const root = await makeFiles(FILES);
    const source = join(root, "docs/page.mdx");
    const partial = join(root, "docs/_partials/figure.md");
    const embed = {
      column: 9,
      image: true,
      line: 7,
      target: "./diagrams/flow.svg",
    };
    const diagnostics = await unmeasurableSvgDiagnostics([
      page(source, [
        embed,
        { column: 1, image: true, line: 8, target: "./logo.svg" },
        { column: 1, line: 9, target: "./diagrams/flow.svg" },
        { ...embed, file: partial, line: 2 },
      ]),
      // A second locale of the same file, and a page with no file.
      page(source, [embed]),
      page(undefined, [embed]),
    ]);
    expect(diagnostics).toEqual([
      {
        code: "BLUME_SVG_UNOPTIMIZED",
        column: 9,
        file: source,
        line: 7,
        message:
          "`./diagrams/flow.svg` is served as it is, not optimized: Astro can't read its size, which takes the whole `<svg>` tag within the file's first 1,000 bytes, with a width and height or a viewBox.",
        severity: "warning",
        suggestion: expect.stringContaining("draw.io export"),
      },
      expect.objectContaining({ file: partial, line: 2 }),
    ]);
  });

  it("runs as the project is scanned", async () => {
    const root = await makeFiles({
      "docs/flow.svg": SIZELESS,
      "docs/index.md": "# Home\n\n![Flow](./flow.svg)\n",
    });
    const project = await scanProject(root, { mode: "build" });
    expect(project.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "BLUME_SVG_UNOPTIMIZED",
        file: join(root, "docs/index.md"),
        line: 3,
      })
    );
  });
});

/** Run the fallback plugin's image visitor on `url` in a page at `file`. */
const visit = async (url: string, file?: string): Promise<string[]> => {
  const urls: string[] = [];
  const setProperty = (_node: MdastNode, _key: "url", value: string) => {
    urls.push(value);
  };
  await svgFallbackPlugin().image(
    { type: "image", url },
    { fileURL: file ? pathToFileURL(file) : undefined, setProperty }
  );
  return urls;
};

describe("svgFallbackPlugin", () => {
  it("points an unmeasurable SVG at its served original", async () => {
    const root = await makeFiles(FILES);
    const [served] = await visit(
      "./diagrams/flow.svg",
      join(root, "docs/page.md")
    );
    // Keyed by its path from the project root Astro runs in.
    expect(served).toStartWith("/blume-assets/content/");
    expect(served).toEndWith(".svg");
  });

  it("leaves every other image to the image pipeline", async () => {
    const root = await makeFiles(FILES);
    const pagePath = join(root, "docs/page.md");
    expect(await visit("./logo.svg", pagePath)).toEqual([]);
    expect(await visit("./photo.png", pagePath)).toEqual([]);
    expect(await visit("./diagrams/flow.svg")).toEqual([]);
  });
});
