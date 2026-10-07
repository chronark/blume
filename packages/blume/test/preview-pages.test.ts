import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import { preview } from "astro";
import type { PreviewServer } from "astro";
import { join } from "pathe";

import {
  previewAnswer,
  previewPageUrl,
  previewRedirects,
  servePreview,
} from "../src/cli/preview-pages.ts";
import type { PreviewRouting } from "../src/cli/preview-pages.ts";
import { compileEveryRedirect } from "../src/core/redirect-patterns.ts";
import { blumeConfigSchema } from "../src/core/schema.ts";
import { publicFolder } from "../src/core/static-host.ts";

/**
 * `blume preview` on a static build, answering what a host would beyond the
 * files in `dist/`: the redirect rules the build writes for the host, the
 * host's trailing-slash handling, and a public folder of HTML at its slashed
 * URL. And a redirect from a page's `.html` URL (`/docs/model.html` ->
 * `/docs/model`, as a migration from VitePress writes) leaves a redirect page
 * at `dist/docs/model.html/index.html`, a directory beside the page's own
 * `dist/docs/model/index.html`.
 */

const PAGE = "<!doctype html><title>Model</title><p>The real page.</p>";
const REDIRECT_PAGE =
  '<!doctype html><meta http-equiv="refresh" content="0;url=/docs/model">';
const DEMO = '<!doctype html><link rel="stylesheet" href="style.css">';

let root: string;
let dist: string;
let routing: PreviewRouting;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "blume-preview-pages-"));
  dist = join(root, "dist");
  const files = {
    "dist/demo/index.html": DEMO,
    "dist/docs/model.html/index.html": REDIRECT_PAGE,
    "dist/docs/model/index.html": PAGE,
    // A redirect from an `.html` URL no page is served beside.
    "dist/gone.html/index.html": REDIRECT_PAGE,
    // A page without a redirect from its `.html` URL.
    "dist/guide/index.html": PAGE,
    "dist/index.html": PAGE,
    // The build copied it from here; `public/` is what makes it a folder.
    "public/demo/index.html": DEMO,
  };
  await Promise.all(
    Object.entries(files).map(async ([path, html]) => {
      const file = join(root, path);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, html);
    })
  );
  routing = {
    base: "",
    distDir: dist,
    isPublicFolder: publicFolder(join(root, "public")),
    redirects: compileEveryRedirect([
      { from: "/old", status: 302, to: "/guide" },
      { from: "/beta/:slug*", status: 301, to: "/docs/:slug*" },
    ]),
  };
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("previewPageUrl", () => {
  it("names the page's index.html when its .html URL is a directory", () => {
    expect(previewPageUrl(dist, "", "/docs/model")).toBe(
      "/docs/model/index.html"
    );
    expect(previewPageUrl(dist, "", "/docs/model?tab=1#setup")).toBe(
      "/docs/model/index.html?tab=1#setup"
    );
    // The URL keeps its own spelling; the lookup decodes it.
    expect(previewPageUrl(dist, "", "/docs/mod%65l")).toBe(
      "/docs/mod%65l/index.html"
    );
    // `deployment.base` is in the URL, not in `dist/`.
    expect(previewPageUrl(dist, "/base", "/base/docs/model")).toBe(
      "/base/docs/model/index.html"
    );
  });

  it("leaves every other request to Vite", () => {
    for (const url of [
      // No redirect from the page's `.html` URL.
      "/guide",
      // A redirect page with no page beside it.
      "/gone",
      // The redirect page's own URL, and a slashed one.
      "/docs/model.html",
      "/docs/model/",
      "/",
      // Not a URL that decodes, and one that climbs out of `dist/`.
      "/docs/%E0%A4%A",
      "/../outside",
    ]) {
      expect(previewPageUrl(dist, "", url)).toBeNull();
    }
  });
});

describe("previewRedirects", () => {
  it("compiles the redirects as the host files carry them", async () => {
    const runtimeDir = join(root, ".blume");
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(
      join(runtimeDir, "blume.manifest.json"),
      JSON.stringify({ routes: [{ path: "/new" }] })
    );
    const config = blumeConfigSchema.parse({
      redirects: [
        { from: "/old", to: "/new" },
        { from: "/beta/*", status: 302, to: "/new" },
      ],
    });
    // A moved page's Markdown copies move with it, as the manifest says.
    expect(previewRedirects(config, runtimeDir)).toStrictEqual([
      ["^/old/?$", "/new", 301],
      ["^/old\\.md/?$", "/new.md", 301],
      ["^/old\\.mdx/?$", "/new.mdx", 301],
      ["^/beta/?$", "/new", 302],
      ["^/beta/(.+?)/?$", "/new", 302],
    ]);
    // Without a generated project, no route moves its copies.
    expect(previewRedirects(config, join(root, "missing"))).toStrictEqual([
      ["^/old/?$", "/new", 301],
      ["^/beta/?$", "/new", 302],
      ["^/beta/(.+?)/?$", "/new", 302],
    ]);
    expect(previewRedirects(blumeConfigSchema.parse({}), runtimeDir)).toEqual(
      []
    );
  });
});

/** How the preview answers a `GET` for `url`. */
const get = (url?: string) => previewAnswer(routing, { method: "GET", url });

describe("previewAnswer", () => {
  it("answers a redirect, then the trailing slash, then the page", () => {
    // A redirect wins, its trailing slash optional, as the host's rules do.
    expect(get("/old/")).toStrictEqual({
      kind: "redirect",
      location: "/guide",
      status: 302,
    });
    expect(get("/beta/model")).toStrictEqual({
      kind: "redirect",
      location: "/docs/model",
      status: 301,
    });
    expect(get("/guide/")).toStrictEqual({
      kind: "redirect",
      location: "/guide",
      status: 301,
    });
    expect(get("/demo/")).toStrictEqual({
      kind: "rewrite",
      url: "/demo/index.html",
    });
    expect(get("/docs/model")).toStrictEqual({
      kind: "rewrite",
      url: "/docs/model/index.html",
    });
    expect(get("/guide")).toBeNull();
    expect(get()).toBeNull();
  });
});

/** The body, status, and `Location` `path` answers with on `origin`. */
const fetchPage = async (
  origin: string,
  path: string
): Promise<{ body: string; location: string | null; status: number }> => {
  const response = await fetch(`${origin}${path}`, {
    headers: { accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  return {
    body: await response.text(),
    location: response.headers.get("location"),
    status: response.status,
  };
};

describe("servePreview", () => {
  it("answers requests before the server's own handler sees them", async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(request.url);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const handle: PreviewServer & { server: typeof server } = {
        closed: async () => {},
        port: 0,
        server,
        stop: async () => {},
      };
      servePreview(handle, routing);
      // SAFETY: a server listening on a TCP port reports an AddressInfo.
      const { port } = server.address() as AddressInfo;
      const origin = `http://127.0.0.1:${port}`;
      expect(await fetchPage(origin, "/docs/model")).toStrictEqual({
        body: "/docs/model/index.html",
        location: null,
        status: 200,
      });
      expect(await fetchPage(origin, "/old")).toStrictEqual({
        body: "",
        location: "/guide",
        status: 302,
      });
      expect(await fetchPage(origin, "/guide")).toStrictEqual({
        body: "/guide",
        location: null,
        status: 200,
      });
    } finally {
      server.close();
    }
  });

  it("leaves a preview without an HTTP server alone", () => {
    const handle: PreviewServer = {
      closed: async () => {},
      port: 0,
      stop: async () => {},
    };
    expect(() => servePreview(handle, routing)).not.toThrow();
  });

  it("answers like a static host from Astro's static preview", async () => {
    const telemetry = process.env.ASTRO_TELEMETRY_DISABLED;
    process.env.ASTRO_TELEMETRY_DISABLED = "1";
    const server = await preview({
      configFile: false,
      logLevel: "silent",
      root,
      server: { host: "127.0.0.1", port: 0 },
      trailingSlash: "never",
    });
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      // On its own, Vite's HTML fallback takes the `model.html` directory for
      // the page (once this fails, Vite checks for a file and the rewrite
      // can go), no redirect rule applies, `trailingSlash: "never"` 404s a
      // slashed URL, and a public folder answers only without its slash.
      expect(await fetchPage(origin, "/docs/model")).toMatchObject({
        body: REDIRECT_PAGE,
        status: 200,
      });
      expect(await fetchPage(origin, "/beta/model")).toMatchObject({
        status: 404,
      });
      expect(await fetchPage(origin, "/guide/")).toMatchObject({ status: 404 });
      expect(await fetchPage(origin, "/demo/")).toMatchObject({ status: 404 });
      expect(await fetchPage(origin, "/demo")).toMatchObject({
        body: DEMO,
        status: 200,
      });

      servePreview(server, routing);
      expect(await fetchPage(origin, "/docs/model")).toMatchObject({
        body: PAGE,
        status: 200,
      });
      // The old `.html` URL still answers with its redirect page.
      expect(await fetchPage(origin, "/docs/model.html")).toMatchObject({
        body: REDIRECT_PAGE,
        status: 200,
      });
      expect(await fetchPage(origin, "/beta/model")).toMatchObject({
        location: "/docs/model",
        status: 301,
      });
      expect(await fetchPage(origin, "/guide/?tab=1")).toMatchObject({
        location: "/guide?tab=1",
        status: 301,
      });
      expect(await fetchPage(origin, "/demo")).toMatchObject({
        location: "/demo/",
        status: 301,
      });
      expect(await fetchPage(origin, "/demo/")).toMatchObject({
        body: DEMO,
        status: 200,
      });
    } finally {
      await server.stop();
      if (telemetry === undefined) {
        delete process.env.ASTRO_TELEMETRY_DISABLED;
      } else {
        process.env.ASTRO_TELEMETRY_DISABLED = telemetry;
      }
    }
  });
});
