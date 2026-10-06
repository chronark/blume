import { statSync } from "node:fs";
import { Server } from "node:http";
import type { IncomingMessage } from "node:http";

import type { PreviewServer } from "astro";
import { join } from "pathe";

import { stripBasePath } from "../core/base-path.ts";

/**
 * Astro previews a static build on Vite's preview server, whose HTML fallback
 * answers a slashless `/guide` with `guide.html` whenever that path exists.
 * It checks with `fs.existsSync`, which a directory passes too. A redirect from
 * `/guide.html` (a migrated site's URL) has its redirect page written to
 * `dist/guide.html/index.html`, a directory, so the fallback rewrites
 * `/guide` to it, Astro's own preview rewrite appends `/index.html`, and the
 * page at `/guide` becomes a redirect page that refreshes to itself forever.
 * Hosts look up files, so they serve the page at `guide/index.html`.
 */

/** Whether `path` is a directory (true) or a file (false); null when absent. */
const isDirectory = (path: string): boolean | null => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return null;
  }
};

/**
 * The URL to serve a preview request from in place of the one Vite's HTML
 * fallback would pick, or null to leave the request alone: the page's own
 * `index.html` when `dist/<route>.html` is a directory, the redirect page of
 * a redirect from `<route>.html`. `base` is the normalized
 * `deployment.base`, which the URL carries and `dist/` doesn't.
 */
export const previewPageUrl = (
  distDir: string,
  base: string,
  url: string
): string | null => {
  const queryAt = url.search(/[?#]/u);
  const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
  if (pathname.endsWith("/")) {
    return null;
  }
  let route: string;
  try {
    route = decodeURIComponent(stripBasePath(base, pathname));
  } catch {
    return null;
  }
  const page = join(distDir, route);
  if (!page.startsWith(`${distDir}/`)) {
    return null;
  }
  return isDirectory(`${page}.html`) === true &&
    isDirectory(join(page, "index.html")) === false
    ? `${pathname}/index.html${queryAt === -1 ? "" : url.slice(queryAt)}`
    : null;
};

/**
 * Point each request at the page {@link previewPageUrl} names before Vite's
 * middleware sees it. Astro's static preview hands back Vite's HTTP server
 * beside the documented fields; without one, the server is left as it is.
 */
export const servePagesFirst = (
  preview: PreviewServer,
  distDir: string,
  base: string
): void => {
  if (!("server" in preview && preview.server instanceof Server)) {
    return;
  }
  preview.server.prependListener("request", (request: IncomingMessage) => {
    const url = request.url && previewPageUrl(distDir, base, request.url);
    if (url) {
      request.url = url;
    }
  });
};
