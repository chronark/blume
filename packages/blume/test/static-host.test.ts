import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import { join } from "pathe";

import {
  answerRequestsFirst,
  publicFolder,
  trailingSlashAnswer,
} from "../src/core/static-host.ts";

/**
 * What `blume dev` and `blume preview` answer ahead of their own handlers,
 * the way a static host does: a trailing slash redirects to the page, and a
 * folder of HTML in `public/` is served at its slashed URL.
 */

let root: string;
let isPublicFolder: (path: string) => boolean;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "blume-static-host-"));
  await mkdir(join(root, "public", "demo", "nested"), { recursive: true });
  await writeFile(join(root, "public", "demo", "index.html"), "<p>Demo</p>");
  // A folder without an index.html is no page of HTML.
  await writeFile(join(root, "public", "demo", "nested", "a.html"), "");
  // Nor is an `index.html` that's a folder.
  await mkdir(join(root, "public", "odd", "index.html"), { recursive: true });
  // A trailing slash on the public dir, as `fileURLToPath` leaves it.
  isPublicFolder = publicFolder(`${join(root, "public")}/`);
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

const answer = (url: string, method = "GET", base = "") =>
  trailingSlashAnswer({ method, url }, base, isPublicFolder);

describe("publicFolder", () => {
  it("finds a folder of HTML in public/", () => {
    expect(isPublicFolder("/demo")).toBe(true);
    expect(isPublicFolder("/demo/nested")).toBe(false);
    expect(isPublicFolder("/odd")).toBe(false);
    expect(isPublicFolder("/missing")).toBe(false);
    // Nothing outside `public/` counts.
    expect(isPublicFolder("/../..")).toBe(false);
  });
});

describe("trailingSlashAnswer", () => {
  it("redirects a slashed page URL to the page, its query kept", () => {
    expect(answer("/guide/")).toStrictEqual({
      kind: "redirect",
      location: "/guide",
      status: 301,
    });
    expect(answer("/guide//?tab=1")).toStrictEqual({
      kind: "redirect",
      location: "/guide?tab=1",
      status: 301,
    });
    // A method a 301 would turn into a GET keeps itself with a 308.
    expect(answer("/api/ask/", "POST")).toStrictEqual({
      kind: "redirect",
      location: "/api/ask",
      status: 308,
    });
    expect(answer("/guide/", "HEAD")).toMatchObject({ status: 301 });
  });

  it("serves a public folder at its slashed URL, and sends it there", () => {
    expect(answer("/demo/?x=1")).toStrictEqual({
      kind: "rewrite",
      url: "/demo/index.html?x=1",
    });
    expect(answer("/demo?x=1")).toStrictEqual({
      kind: "redirect",
      location: "/demo/?x=1",
      status: 301,
    });
    // `deployment.base` is in the URL, not in `public/`.
    expect(answer("/base/demo", "GET", "/base")).toStrictEqual({
      kind: "redirect",
      location: "/base/demo/",
      status: 301,
    });
    expect(answer("/base/demo/", "GET", "/base")).toStrictEqual({
      kind: "rewrite",
      url: "/base/demo/index.html",
    });
    // The base's own slashed URL is the home page's.
    expect(answer("/base/", "GET", "/base")).toStrictEqual({
      kind: "redirect",
      location: "/base",
      status: 301,
    });
  });

  it("leaves the root, internal paths, and slashless pages alone", () => {
    for (const url of [
      "/",
      "/?x=1",
      "/_astro/",
      "/@vite/client",
      "/.well-known/",
      "//",
      "/guide",
      "/demo/index.html",
      // Not a URL that decodes.
      "/%E0%A4%A/",
    ]) {
      expect(answer(url)).toBeNull();
    }
  });
});

describe("answerRequestsFirst", () => {
  it("answers ahead of the server's own handler, or hands it the rewrite", async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(request.url);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      answerRequestsFirst(
        server,
        (request) => trailingSlashAnswer(request, "", isPublicFolder),
        { "X-Powered-By": "Blume" }
      );
      // SAFETY: a server listening on a TCP port reports an AddressInfo.
      const { port } = server.address() as AddressInfo;
      const get = (path: string) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
      const redirected = await get("/guide/?q=1");
      expect(redirected.status).toBe(301);
      expect(redirected.headers.get("location")).toBe("/guide?q=1");
      expect(redirected.headers.get("x-powered-by")).toBe("Blume");
      const rewritten = await get("/demo/");
      expect(await rewritten.text()).toBe("/demo/index.html");
      const untouched = await get("/guide");
      expect(await untouched.text()).toBe("/guide");
    } finally {
      server.close();
    }
  });
});
