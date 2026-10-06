import { afterAll, describe, expect, it } from "bun:test";
import { execFile, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { dirname, join } from "pathe";

import { parseHeadingMarkers } from "../src/core/heading-markers.ts";

// The blume-migrate skill's zero-dependency heading-id pinner, run the way the
// skill runs it: a bare `node` over the repo-root copy (the package's
// `skills/` is a generated mirror of it). The fixtures stand in for a build:
// hand-written `dist/` pages with Blume's ids, an old site's pages with the
// ids it published, and the route manifest `blume build` writes.
const SCRIPT = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "pin-heading-ids.mjs"
);

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true }))
  );
});

const put = async (file: string, text: string): Promise<void> => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
};

/** A heading as Blume renders it: an id, and the text inside its anchor link. */
const blumeHeading = (level: number, id: string, text: string): string =>
  `<h${level} id="${id}"><a class="blume-heading-anchor" href="#${id}">${text}</a></h${level}>`;

const builtPage = (title: string, headings: string[]): string =>
  `<html><body><nav><h2 id="nav">Navigation</h2></nav><article><h1>${title}</h1>${headings.join("")}</article></body></html>`;

const oldPage = (headings: string[]): string =>
  `<html><body><aside><h5 id="chat">Ask a question</h5></aside><main>${headings.join("")}</main></body></html>`;

/**
 * A migrated project after `blume build`, and the old site beside it:
 *
 * - `/` (`index.mdx`): one heading whose id matches, one that GitBook slugged
 *   differently, and one the old site had that the migration lost.
 * - `/notes` (`notes.md`): a leading-digit heading and a heading already
 *   pinned to Blume's own id.
 * - `/guide` (`guide.mdx`): two includes of one partial, with a prop that
 *   fills a `{{variable}}` in the partial's heading.
 * - `/new-place`: a page that moved, found on the old site through `--map`.
 * - `/links`: a link to one of the changed ids.
 */
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-pin-ids-"));
  roots.push(root);
  const docs = join(root, "docs");

  await put(
    join(docs, "index.mdx"),
    [
      "---",
      "title: Home",
      "---",
      "",
      "## Getting started",
      "",
      "```md",
      "## AppConfig:OCSP:Enabled",
      "```",
      "",
      "## AppConfig:OCSP:Enabled",
      "",
    ].join("\n")
  );
  await put(
    join(docs, "notes.md"),
    [
      "---",
      "title: Notes",
      "---",
      "",
      "## 3.1 - September 2026 ##",
      "",
      "## Read/write access [#readwrite-access] [!toc]",
      "",
    ].join("\n")
  );
  await put(
    join(docs, "guide.mdx"),
    [
      "---",
      "title: Guide",
      "---",
      "",
      '<include name="Computer">/_includes/template.md</include>',
      "",
      "<include",
      '  name="User"',
      ">",
      "  ./_includes/template.md",
      "</include>",
      "",
    ].join("\n")
  );
  await put(
    join(docs, "_includes", "template.md"),
    ["## Template {{name}}:Enabled", ""].join("\n")
  );
  await put(
    join(docs, "new-place.mdx"),
    ["---", "title: New place", "---", "", "## Moved: here", ""].join("\n")
  );
  await put(
    join(docs, "links.mdx"),
    [
      "---",
      "title: Links",
      "---",
      "",
      "See [the release](/notes#id-3.1-september-2026).",
      "",
    ].join("\n")
  );

  const routes = [
    ["/", "index.mdx"],
    ["/notes", "notes.md"],
    ["/guide", "guide.mdx"],
    ["/new-place", "new-place.mdx"],
    ["/links", "links.mdx"],
  ].map(([path, file]) => ({ path, sourcePath: join(docs, file ?? "") }));
  await put(
    join(root, ".blume", "blume.manifest.json"),
    JSON.stringify({ contentRoot: docs, routes, version: 1 })
  );

  const dist = join(root, "dist");
  await put(
    join(dist, "index.html"),
    builtPage("Home", [
      blumeHeading(2, "getting-started", "Getting started"),
      blumeHeading(2, "appconfigocspenabled", "AppConfig:OCSP:Enabled"),
    ])
  );
  await put(
    join(dist, "notes", "index.html"),
    builtPage("Notes", [
      blumeHeading(2, "31---september-2026", "3.1 - September 2026"),
      blumeHeading(2, "readwrite-access", "Read/write access"),
    ])
  );
  await put(
    join(dist, "guide", "index.html"),
    builtPage("Guide", [
      blumeHeading(2, "template-computerenabled", "Template Computer:Enabled"),
      blumeHeading(2, "template-userenabled", "Template User:Enabled"),
    ])
  );
  await put(
    join(dist, "new-place", "index.html"),
    builtPage("New place", [blumeHeading(2, "moved-here", "Moved: here")])
  );
  await put(join(dist, "links", "index.html"), builtPage("Links", []));
  await put(
    join(dist, "blume-redirects.json"),
    JSON.stringify([
      { from: "/old-place", status: 301, to: "/new-place" },
      { from: "/old-place.md", status: 301, to: "/new-place.md" },
      { from: "/de/:path*", status: 307, to: "/:path*" },
    ])
  );

  const old = join(root, "old");
  await put(
    join(old, "index.html"),
    oldPage([
      '<h1 id="home">Home</h1>',
      '<h2 id="getting-started">Getting started</h2>',
      '<h2 id="appconfig-ocsp-enabled">AppConfig:OCSP:Enabled<a href="#appconfig-ocsp-enabled"><svg><path d="M0"/></svg></a></h2>',
      '<h2 id="removed-section">Removed section</h2>',
    ])
  );
  await put(
    join(old, "notes.html"),
    oldPage([
      '<h2 id="id-3.1-september-2026">3.1 - September 2026</h2>',
      '<h2 id="read-write-access">Read/write access</h2>',
    ])
  );
  await put(
    join(old, "guide", "index.html"),
    oldPage([
      '<h2 id="template-computer-enabled">Template Computer:Enabled</h2>',
      '<h2 id="template-user-enabled">Template User:Enabled</h2>',
    ])
  );
  await put(
    join(old, "old-place", "index.html"),
    oldPage(['<h2 id="moved-here-1">Moved: here</h2>'])
  );
  await put(join(old, "links", "index.html"), oldPage([]));
  return root;
};

/** The parent's environment without a runtime-dir override, so `.blume` is read. */
const childEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  delete env.BLUME_RUNTIME_DIR;
  return env;
};

const runScript = (cwd: string, ...args: string[]) =>
  spawnSync("node", [SCRIPT, ...args], {
    cwd,
    encoding: "utf-8",
    env: childEnv(),
  });

const execFileAsync = promisify(execFile);

/** The script run asynchronously, so a server in this process can answer it. */
const runScriptAsync = async (
  cwd: string,
  ...args: string[]
): Promise<string> => {
  const { stdout } = await execFileAsync("node", [SCRIPT, ...args], {
    cwd,
    env: childEnv(),
  });
  return stdout;
};

interface Pin {
  file: string;
  from: string;
  line: number;
  replaces?: string;
  route: string;
  text: string;
  to: string;
}

interface Report {
  awaitingBuild: number;
  notes: string[];
  paired: number;
  pins: Pin[];
  unlinked: number;
  write: boolean;
}

const jsonReport = (cwd: string, ...args: string[]): Report => {
  const result = runScript(cwd, ...args, "--json");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  // SAFETY: --json prints exactly this shape (jsonReport in the script).
  return JSON.parse(result.stdout) as Report;
};

describe("pin-heading-ids", () => {
  it("reports every changed id without writing, then pins each in its file's syntax", async () => {
    const root = await fixture();
    const before = await readFile(join(root, "docs", "index.mdx"), "utf-8");

    const dry = jsonReport(
      root,
      "--old",
      "old",
      "--map",
      "dist/blume-redirects.json"
    );
    expect(dry.write).toBe(false);
    expect(
      dry.pins.map((pin) => `${pin.route} ${pin.from} -> ${pin.to}`)
    ).toEqual([
      "/ appconfigocspenabled -> appconfig-ocsp-enabled",
      "/guide template-computerenabled -> template-computer-enabled",
      "/new-place moved-here -> moved-here-1",
      "/notes 31---september-2026 -> id-3.1-september-2026",
      "/notes readwrite-access -> read-write-access",
    ]);
    // The heading in the code fence is skipped: the pin lands on line 11.
    expect(dry.pins[0]).toMatchObject({ file: "docs/index.mdx", line: 11 });
    expect(dry.pins[4]?.replaces).toBe("readwrite-access");
    // Both includes of the partial render its one heading line, and the
    // second wants another id: a line pins one, so the first is kept.
    expect(dry.notes).toContain(
      "docs/_includes/template.md:1: renders with two old ids (#template-computer-enabled, #template-user-enabled), and a line pins one; kept #template-computer-enabled"
    );
    expect(dry.notes).toContain(
      '/: old heading #removed-section ("Removed section") has no counterpart; its anchor is lost'
    );
    // The old page title and the old site's chrome outside <main> aren't headings to keep.
    expect(dry.notes.join("\n")).not.toContain("#home");
    expect(dry.notes.join("\n")).not.toContain("#chat");
    expect(await readFile(join(root, "docs", "index.mdx"), "utf-8")).toBe(
      before
    );

    const written = runScript(
      root,
      "--old",
      "old",
      "--map",
      "dist/blume-redirects.json",
      "--write"
    );
    expect(written.status).toBe(0);
    expect(written.stdout).toContain("5 heading line(s) pinned in 4 file(s)");
    expect(written.stdout).toContain("Rebuild and run again");

    const read = (file: string): Promise<string> =>
      readFile(join(root, "docs", file), "utf-8");
    expect(await read("index.mdx")).toContain(
      "## AppConfig:OCSP:Enabled [#appconfig-ocsp-enabled]\n"
    );
    // The fenced example is untouched.
    expect(await read("index.mdx")).toContain(
      "```md\n## AppConfig:OCSP:Enabled\n```"
    );
    // .md takes {#id}; the closing hashes go so the pin stays a pin, and an
    // existing pin is replaced while [!toc] stays.
    expect(await read("notes.md")).toContain(
      "## 3.1 - September 2026 {#id-3.1-september-2026}\n"
    );
    expect(await read("notes.md")).toContain(
      "## Read/write access [!toc] {#read-write-access}\n"
    );
    // A partial takes the escaped form, which pins in both formats.
    expect(await read("_includes/template.md")).toBe(
      "## Template {{name}}:Enabled \\{#template-computer-enabled\\}\n"
    );
    expect(await read("new-place.mdx")).toContain(
      "## Moved: here [#moved-here-1]"
    );

    // Each spelling it wrote is one Blume's heading parser reads as that id,
    // once Markdown has resolved the partial's escapes.
    const parsedIds = await Promise.all(
      dry.pins.map(async (pin) => {
        const source = await readFile(join(root, pin.file), "utf-8");
        const line = source.split("\n")[pin.line - 1] ?? "";
        const unescaped = line.replaceAll(/\\(?<brace>[{}])/gu, "$<brace>");
        return parseHeadingMarkers(unescaped).id;
      })
    );
    expect(parsedIds).toEqual(dry.pins.map((pin) => pin.to));
  });

  it("pairs headings through permalinks, inline code, escapes, and smart dashes", async () => {
    const root = await fixture();
    await put(
      join(root, "docs", "api.md"),
      [
        "---",
        "title: API",
        "---",
        "",
        "## -p, --port `<port>`",
        "",
        "## createApp(\\[options]): Promise\\<App>",
        "",
        "## Tabs `&amp;` panes",
        "",
        "## Read/write",
        "",
      ].join("\n")
    );
    const manifestPath = join(root, ".blume", "blume.manifest.json");
    // SAFETY: the fixture wrote this manifest with exactly these fields.
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
      routes: { path: string; sourcePath: string }[];
    };
    manifest.routes.push({
      path: "/api",
      sourcePath: join(root, "docs", "api.md"),
    });
    await writeFile(manifestPath, JSON.stringify(manifest));
    // Blume renders `--` as an en dash and the code spans as <code>.
    await put(
      join(root, "dist", "api", "index.html"),
      builtPage("API", [
        blumeHeading(2, "-p-port-port", "-p, –port <code>&lt;port&gt;</code>"),
        blumeHeading(
          2,
          "createappoptions-promiseapp",
          "createApp([options]): Promise&lt;App&gt;"
        ),
        blumeHeading(2, "tabs-amp-panes", "Tabs <code>&amp;amp;</code> panes"),
        blumeHeading(2, "readwrite", "Read/write"),
      ])
    );
    // Each old heading carries another tool's permalink beside its text:
    // MkDocs (a pilcrow entity, or the words its `permalink` option sets),
    // VitePress, and Docusaurus (zero-width spaces).
    const zeroWidthSpace = String.fromCodePoint(0x20_0b);
    await put(
      join(root, "old", "api.html"),
      oldPage([
        '<h2 id="p-port-port">-p, --port <code>&lt;port&gt;</code><a class="headerlink" href="#p-port-port" title="Permanent link">&para;</a></h2>',
        '<h2 id="createapp-options-promise-app" tabindex="-1">createApp([options]): Promise&lt;App&gt; <a class="header-anchor" href="#createapp-options-promise-app" aria-label="Permalink to &quot;createApp&quot;">&#8203;</a></h2>',
        `<h2 class="anchor" id="tabs-and-panes">Tabs <code>&amp;amp;</code> panes<a href="#tabs-and-panes" class="hash-link" aria-label="Direct link to Tabs" title="Direct link to Tabs">${zeroWidthSpace}</a></h2>`,
        '<h2 id="read-write">Read/write<a class="headerlink" href="#read-write" title="Permanent link">link</a></h2>',
      ])
    );

    const report = jsonReport(root, "--old", "old");
    expect(
      report.pins
        .filter((pin) => pin.route === "/api")
        .map((pin) => `${pin.line} ${pin.to}`)
    ).toEqual([
      "5 p-port-port",
      "7 createapp-options-promise-app",
      "9 tabs-and-panes",
      "11 read-write",
    ]);
    expect(report.notes.join("\n")).not.toContain("/api");
  });

  it("looks a moved page up at its own route without --map", async () => {
    const root = await fixture();
    const report = jsonReport(root, "--old", "old");
    expect(report.notes).toContain("/new-place: not on the old site");
    expect(report.pins.map((pin) => pin.route)).not.toContain("/new-place");
  });

  it("is idempotent once pinned, and waits for a rebuild", async () => {
    const root = await fixture();
    runScript(root, "--old", "old", "--write");
    const again = jsonReport(root, "--old", "old");
    expect(again.pins).toEqual([]);
    expect(again.awaitingBuild).toBe(4);
  });

  it("pins only linked ids with --only-linked, plus those a --links file names", async () => {
    const root = await fixture();
    const linked = jsonReport(root, "--old", "old", "--only-linked");
    expect(linked.pins.map((pin) => pin.to)).toEqual(["id-3.1-september-2026"]);
    expect(linked.unlinked).toBe(4);
    // A lost anchor nobody links to isn't reported.
    expect(linked.notes.join("\n")).not.toContain("removed-section");

    await writeFile(
      join(root, "keep.txt"),
      "https://docs.example.com/#appconfig-ocsp-enabled\n#read-write-access\n\n"
    );
    const listed = jsonReport(root, "--old", "old", "--links", "keep.txt");
    expect(listed.pins.map((pin) => pin.to).toSorted()).toEqual([
      "appconfig-ocsp-enabled",
      "id-3.1-september-2026",
      "read-write-access",
    ]);
  });

  it("derives routes from the files when there's no manifest", async () => {
    const root = await fixture();
    await rm(join(root, ".blume"), { force: true, recursive: true });
    await put(
      join(root, "docs", "02-later", "01-first.md"),
      ["---", "title: First", "---", "", "## Step 1: Install", ""].join("\n")
    );
    await put(
      join(root, "dist", "later", "first", "index.html"),
      builtPage("First", [blumeHeading(2, "step-1-install", "Step 1: Install")])
    );
    await put(
      join(root, "old", "later", "first.html"),
      oldPage(['<h2 id="step-1:-install">Step 1: Install</h2>'])
    );
    const report = jsonReport(root, "--old", "old");
    expect(report.pins.map((pin) => `${pin.route} ${pin.to}`)).toContain(
      "/later/first step-1:-install"
    );

    const missing = runScript(root, "--old", "old", "--docs", "nowhere");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("no Blume manifest");
  });

  it("fetches a live site one page at a time and caches what it read", async () => {
    const root = await fixture();
    const pages = new Map([
      ["/", await readFile(join(root, "old", "index.html"), "utf-8")],
      ["/notes", await readFile(join(root, "old", "notes.html"), "utf-8")],
    ]);
    let requests = 0;
    const server = createServer((request, response) => {
      requests += 1;
      const page = pages.get(request.url ?? "");
      response.writeHead(page ? 200 : 404, { "content-type": "text/html" });
      response.end(page ?? "missing");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    // SAFETY: a server listening on a TCP port reports an AddressInfo, not a pipe name.
    const { port } = server.address() as AddressInfo;
    const site = `http://127.0.0.1:${port}/`;
    try {
      const first = await runScriptAsync(root, "--old", site, "--delay", "1");
      expect(first).toContain(
        '/notes  "3.1 - September 2026"  #31---september-2026 → #id-3.1-september-2026  (docs/notes.md:5)'
      );
      expect(first).toContain("NOTE /guide: not on the old site");
      expect(requests).toBe(5);
      // Pages that answered are cached; only the misses are asked again.
      await runScriptAsync(root, "--old", site, "--delay", "1");
      expect(requests).toBe(8);
    } finally {
      server.close();
    }
  });

  it("pairs a section that repeats the page title with its own old id", async () => {
    const root = await fixture();
    await put(
      join(root, "docs", "install.md"),
      [
        "---",
        "title: Install",
        "---",
        "",
        "Intro.",
        "",
        "## Install",
        "",
        "## Verify",
        "",
        "## Über uns",
        "",
      ].join("\n")
    );
    const manifestPath = join(root, ".blume", "blume.manifest.json");
    // SAFETY: the fixture wrote this manifest with exactly these fields.
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
      routes: { path: string; sourcePath: string }[];
    };
    manifest.routes.push({
      path: "/install",
      sourcePath: join(root, "docs", "install.md"),
    });
    await writeFile(manifestPath, JSON.stringify(manifest));
    // Blume's title h1 has no id, so the section takes the plain slug.
    await put(
      join(root, "dist", "install", "index.html"),
      builtPage("Install", [
        blumeHeading(2, "install", "Install"),
        blumeHeading(2, "verify", "Verify"),
        blumeHeading(2, "über-uns", "Über uns"),
      ])
    );
    // mdBook and others count the title, so the section was #install-1. The
    // page's second h1, an h2 now, still pairs: mdBook 0.4 kept its capital.
    await put(
      join(root, "old", "install.html"),
      oldPage([
        '<h1 id="install"><a class="header" href="#install">Install</a></h1>',
        '<h2 id="install-1"><a class="header" href="#install-1">Install</a></h2>',
        '<h2 id="verify"><a class="header" href="#verify">Verify</a></h2>',
        '<h1 id="Über-uns"><a class="header" href="#Über-uns">Über uns</a></h1>',
      ])
    );

    const report = jsonReport(root, "--old", "old");
    expect(
      report.pins
        .filter((pin) => pin.route === "/install")
        .map((pin) => `${pin.line} ${pin.from} -> ${pin.to}`)
    ).toEqual(["7 install -> install-1", "11 über-uns -> Über-uns"]);
    expect(report.notes.join("\n")).not.toContain("/install");
  });

  it("reads a server build's client half", async () => {
    const root = await fixture();
    const dist = join(root, "dist");
    const client = join(root, "client");
    await rename(dist, client);
    await mkdir(dist, { recursive: true });
    await rename(client, join(dist, "client"));

    // vercel() writes only client/; node() and cloudflare() add server/.
    const vercel = runScript(root, "--old", "old", "--json");
    await mkdir(join(dist, "server"), { recursive: true });
    const node = runScript(root, "--old", "old", "--json");
    for (const result of [vercel, node]) {
      expect(result.status).toBe(0);
      expect(result.stderr).toContain("reading");
      expect(result.stderr).toContain("a server build's pages");
      // SAFETY: --json prints exactly this shape (jsonReport in the script).
      const report = JSON.parse(result.stdout) as Report;
      expect(report.pins.map((pin) => pin.to)).toContain(
        "appconfig-ocsp-enabled"
      );
    }
  });

  it("warns when nothing pairs, naming the build directory it read", async () => {
    const root = await fixture();
    await mkdir(join(root, "elsewhere"), { recursive: true });

    const empty = runScript(root, "--old", "old", "--dist", "elsewhere");
    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain("0 heading(s) paired");
    expect(empty.stderr).toContain(
      "WARNING: 0 headings paired: no page was found in both the build in elsewhere and the old site at old."
    );
    expect(empty.stderr).toContain("dist/client");

    // Pages on both sides whose headings never match: an old site that isn't
    // this one, say.
    const unrelated = join(root, "unrelated");
    await put(
      join(unrelated, "index.html"),
      oldPage(['<h2 id="pricing">Pricing</h2>'])
    );
    const mismatched = runScript(root, "--old", "unrelated");
    expect(mismatched.stderr).toContain(
      "the old pages have 1 section heading(s), but none matched a heading in the build in dist and the old site at unrelated."
    );
  });

  it("stays quiet when the old site has no section headings to pair", async () => {
    const root = await fixture();
    const bare = join(root, "bare");
    await put(join(bare, "index.html"), oldPage(['<h1 id="home">Home</h1>']));

    const result = runScript(root, "--old", "bare");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 heading(s) paired");
    expect(result.stderr).toBe("");
  });

  it("explains its usage and rejects bad arguments", async () => {
    const root = await fixture();
    const help = runScript(root);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: node pin-heading-ids.mjs");
    expect(help.stdout).toContain("dist/client");

    const noOld = runScript(root, "--write");
    expect(noOld.status).toBe(2);
    expect(noOld.stderr).toContain("--old is required");

    const noValue = runScript(root, "--old");
    expect(noValue.status).toBe(2);
    expect(noValue.stderr).toContain("--old needs a value");

    const noBuild = runScript(root, "--old", "old", "--dist", "nowhere");
    expect(noBuild.status).toBe(1);
    expect(noBuild.stderr).toContain("run `blume build` first");

    // A build for a named host writes no blume-redirects.json.
    const noMap = runScript(root, "--old", "old", "--map", "dist/missing.json");
    expect(noMap.status).toBe(1);
    expect(noMap.stderr).toContain("only when no host adapter is set");
  });
});
