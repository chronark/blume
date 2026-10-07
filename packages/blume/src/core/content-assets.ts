import { readFile } from "node:fs/promises";

import { dirname, extname, relative } from "pathe";

import { normalizeBasePath } from "./base-path.ts";
import { nextFenceState } from "./code-fences.ts";
import type { FenceState } from "./code-fences.ts";
import { resolveRelativeFile, resolveRelativeImage } from "./relative-files.ts";
import { hashText } from "./sources/cache.ts";
import {
  isLinkElementUrl,
  rewriteCardImages,
  rewriteElementUrls,
  rewriteImageTargets,
  rewriteLinkTargets,
} from "./sources/normalize.ts";
import { readExpandedEntryText } from "./sources/read.ts";
import type { ContentSource } from "./sources/types.ts";
import type { PageRecord } from "./types.ts";

/**
 * Colocated content images — `![alt](./diagram.png)` next to the page that
 * references it. The HTML render optimizes these through `astro:assets` into
 * hashed `_astro/` files, but that mapping doesn't exist yet when the raw
 * agent-facing Markdown (`/<route>.md`, llms-full.txt, MCP) is snapshotted at
 * generate time — so a verbatim relative path would 404 for every agent
 * fetching the page by URL. Instead, the originals are served at
 * `/blume-assets/content/<project-relative path>` by a generated endpoint (see
 * `contentAssetsEndpointTemplate`), and these helpers rewrite the relative
 * references in agent-facing output to that URL.
 *
 * Other files beside a page are published the same way: a link to one
 * (`[spec](./spec.pdf)`, a reference definition), a raw HTML or `.mdx`
 * element's `src` (`<img src="./diagram.png">`, `<video>`, `<source>`,
 * `<audio>`), and an `<a>`'s or a component's `href`. Nothing else serves
 * them, so the HTML render points those at the same URLs (see
 * `markdown/content-assets.ts`).
 */

/** The endpoint route prefix colocated content files are served under. */
export const CONTENT_ASSETS_PREFIX = "/blume-assets/content";

/**
 * The endpoint param a colocated image is served under: its project-relative
 * path (readable, collision-free — it mirrors the source tree). A file outside
 * the project root can't be addressed that way (`..` segments don't survive a
 * URL), so it falls back to a content-addressed name.
 */
export const contentAssetParam = (
  projectRoot: string,
  absPath: string
): string => {
  const rel = relative(projectRoot, absPath);
  if (rel.startsWith("..")) {
    return `_/${hashText(absPath)}${extname(absPath)}`;
  }
  return rel;
};

/**
 * The URL a colocated image's endpoint param is served at, under
 * `deployment.base` when set, encoded for a Markdown or HTML URL with its `/`
 * separators kept.
 */
export const contentAssetUrl = (param: string, deployBase?: string): string =>
  `${normalizeBasePath(deployBase)}${CONTENT_ASSETS_PREFIX}/${param
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

/**
 * Rewrite a page's relative image references, and its links and element
 * URLs naming other files beside it, to their served
 * `/blume-assets/content/…` URLs (under `deployment.base` when set). Fenced
 * code blocks and inline code are skipped; only references whose file actually
 * exists next to the source are touched. `register` observes each rewritten
 * asset so a caller can accumulate the files the endpoint must serve.
 */
export const rewriteRelativeAssets = (options: {
  source: string;
  sourcePath: string;
  projectRoot: string;
  deployBase?: string;
  register?: (param: string, absPath: string) => void;
}): string => {
  const { source, sourcePath, projectRoot, deployBase, register } = options;
  const sourceDir = dirname(sourcePath);
  const served = (abs: string): string => {
    const param = contentAssetParam(projectRoot, abs);
    register?.(param, abs);
    return contentAssetUrl(param, deployBase);
  };
  const toUrl = (target: string): string | null => {
    const abs = resolveRelativeImage(sourceDir, target);
    return abs === null ? null : served(abs);
  };
  const toFileUrl = (target: string): string | null => {
    const file = resolveRelativeFile(sourceDir, target);
    return file === null ? null : `${served(file.path)}${file.suffix}`;
  };

  let fence: FenceState = null;
  const lines = source.split("\n").map((line) => {
    const next = nextFenceState(line, fence);
    const inFence = fence !== null || next !== null;
    fence = next;
    // Inline code is skipped too: a `` `![x](./y.png)` `` span is syntax
    // being shown, not an image.
    return inFence ? line : rewriteImageTargets(line, toUrl);
  });
  // A `<Card img>` is an image embed too: its file is served and its value
  // pointed there, which the HTML render reads back (see
  // `markdown/content-assets.ts`), as are links and element URLs naming any
  // other file beside the page.
  return rewriteElementUrls(
    rewriteLinkTargets(rewriteCardImages(lines.join("\n"), toUrl), toFileUrl),
    (url) => (isLinkElementUrl(url) ? toFileUrl(url.value) : null)
  );
};

/**
 * Every colocated file the project's pages reference, keyed by endpoint param.
 * Serialized to `generated/content-assets.json`, which the
 * `/blume-assets/[...asset]` endpoint reads to serve the original files. Runs
 * the same rewrite the agent-Markdown builders apply — over the same
 * include-expanded text, so a partial's colocated images (rebased into the
 * including page by the expander) are served too — keeping the served set and
 * the rewritten URLs from drifting apart.
 */
export const collectContentAssets = async (project: {
  context: { root: string };
  manifest: { routes: { id: string; sourcePath?: string }[] };
  graph: { pages: PageRecord[] };
  sources?: ContentSource[];
}): Promise<Record<string, string>> => {
  const pageById = new Map(project.graph.pages.map((page) => [page.id, page]));
  const files: Record<string, string> = {};
  await Promise.all(
    project.manifest.routes.map(async (route) => {
      if (!route.sourcePath) {
        return;
      }
      const page = pageById.get(route.id);
      let source: string;
      try {
        source = page
          ? await readExpandedEntryText(project, page)
          : await readFile(route.sourcePath, "utf-8");
      } catch {
        return;
      }
      rewriteRelativeAssets({
        projectRoot: project.context.root,
        register: (param, abs) => {
          files[param] = abs;
        },
        source,
        sourcePath: route.sourcePath,
      });
    })
  );
  return files;
};
