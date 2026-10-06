import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { expandIncludes } from "../src/core/includes.ts";

// The blume-migrate skill's zero-dependency excerpt generator, run the way a
// migrated project runs it: a bare `node` over the repo-root copy, from the
// folder holding the manifest. The fixtures are a small repo: source files
// outside the content root, and a Blume project beside them.
const SCRIPT = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "include-excerpts.mjs"
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

const RUST = [
  "// ANCHOR: all",
  "use std::fmt;",
  "// ANCHOR: main",
  "fn main() {",
  '    println!("hi");',
  "}",
  "// ANCHOR_END: main",
  "// ANCHOR_END: all",
  "",
].join("\n");

// Overlapping anchors in three comment styles, and one Rust's Unicode `\w`
// accepts.
const OVERLAP = [
  "# ANCHOR: a",
  "one",
  "<!-- ANCHOR: b -->",
  "two",
  "/* ANCHOR_END: a */",
  "three",
  "-- ANCHOR_END: b",
  "// ANCHOR: café",
  "four",
  "// ANCHOR_END: café",
  "",
].join("\n");

const TYPESCRIPT = [
  "export class App {",
  "  // #region setup",
  "  setup() {",
  "    // #region flag",
  "    this.ready = true;",
  "    // #endregion",
  "  }",
  "  // #endregion setup",
  "}",
  "",
].join("\n");

const PYTHON = [
  "# region: us-east is the default",
  "# region config",
  "VALUE = 1",
  "# endregion config",
  "",
].join("\n");

const MARKDOWN = [
  "Intro",
  "<!-- #region usage -->",
  "Use it.",
  "<!-- #endregion usage -->",
  "",
].join("\n");

const CSS = [
  "/* #region colors */",
  ":root { --accent: red; }",
  "/* #endregion colors */",
  "",
].join("\n");

/** One part of an excerpt, as the manifest spells it. */
interface Part {
  anchor?: string;
  dedent?: boolean;
  file?: string;
  lines?: string;
  region?: string;
  text?: string;
}

type Excerpts = Record<string, string | Part | (string | Part)[]>;

/**
 * A repo with sources in `src/`, a Blume project in `book/`, pages in `docs/`.
 * `manifest` replaces the generated excerpts.json, for one a type can't hold.
 */
const fixture = async (
  excerpts: Excerpts,
  manifest?: string
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-include-excerpts-"));
  roots.push(root);
  await put(join(root, "src", "lib.rs"), RUST);
  await put(join(root, "src", "app.ts"), TYPESCRIPT);
  await put(join(root, "src", "tool.py"), PYTHON);
  await put(join(root, "src", "page.md"), MARKDOWN);
  await put(join(root, "src", "theme.css"), CSS);
  await put(join(root, "src", "crlf.rs"), "fn a() {}\r\nfn b() {}\r\n");
  await put(join(root, "src", "my code", "overlap.txt"), OVERLAP);
  await put(
    join(root, "book", "excerpts.json"),
    manifest ?? JSON.stringify({ excerpts, out: "../docs/_excerpts" })
  );
  return root;
};

const runScript = (cwd: string, ...args: string[]) =>
  spawnSync("node", [SCRIPT, ...args], { cwd, encoding: "utf-8" });

const excerpt = (root: string, name: string): Promise<string> =>
  readFile(join(root, "docs", "_excerpts", name), "utf-8");

/** Every file under `dir`, relative, sorted. */
const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .toSorted();
};

describe("include-excerpts", () => {
  it("selects the way mdBook's {{#include}} does", async () => {
    const root = await fixture({
      "a.txt": "../src/my code/overlap.txt:a",
      "all.rs": "../src/lib.rs:all",
      "b.txt": "../src/my code/overlap.txt:b",
      "cafe.txt": "../src/my code/overlap.txt:café",
      "from-7.rs": "../src/lib.rs:7:",
      "line-0.rs": "../src/lib.rs:0:2",
      "line-4.rs": "../src/lib.rs:4",
      "lines-2-3.rs": "../src/lib.rs:2:3",
      "main.rs": "../src/lib.rs:main",
      "to-2.rs": "../src/lib.rs::2",
      "trailing.rs": "../src/lib.rs:2:x",
      "whole.rs": "../src/lib.rs",
    });
    const result = runScript(join(root, "book"));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("12 excerpt(s)");
    expect(result.stdout).toContain("(12 written, 0 removed)");

    const read = (name: string) => excerpt(root, name);
    // An anchor drops every ANCHOR line inside it, as mdBook does.
    expect(await read("all.rs")).toBe(
      'use std::fmt;\nfn main() {\n    println!("hi");\n}\n'
    );
    expect(await read("main.rs")).toBe('fn main() {\n    println!("hi");\n}\n');
    // Overlapping anchors each drop the other's markers, in any comment.
    expect(await read("a.txt")).toBe("one\ntwo\n");
    expect(await read("b.txt")).toBe("two\nthree\n");
    expect(await read("cafe.txt")).toBe("four\n");
    // mdBook reads line 0 as line 1.
    expect(await read("line-0.rs")).toBe("// ANCHOR: all\nuse std::fmt;\n");
    // Line ranges are 1-based and inclusive, and keep any ANCHOR lines.
    expect(await read("lines-2-3.rs")).toBe("use std::fmt;\n// ANCHOR: main\n");
    expect(await read("line-4.rs")).toBe("fn main() {\n");
    expect(await read("to-2.rs")).toBe("// ANCHOR: all\nuse std::fmt;\n");
    expect(await read("from-7.rs")).toBe(
      "// ANCHOR_END: main\n// ANCHOR_END: all\n"
    );
    // A second number that isn't one runs to the end, as in mdBook.
    const whole = await read("whole.rs");
    expect(await read("trailing.rs")).toBe(
      whole.split("\n").slice(1).join("\n")
    );
    expect(await read("whole.rs")).toBe(RUST);
  });

  it("selects regions in any comment style, line ranges, and literal lines", async () => {
    const root = await fixture({
      "colors.css": { file: "../src/theme.css", region: "colors" },
      "config.py": { file: "../src/tool.py", region: "config" },
      "crlf.rs": { file: "../src/crlf.rs" },
      "nested/body.rs": { file: "../src/lib.rs", lines: "4-6" },
      "setup.ts": { dedent: true, file: "../src/app.ts", region: "setup" },
      "tail.rs": { file: "../src/lib.rs", lines: "6-" },
      "usage.md": { file: "../src/page.md", region: "usage" },
      "wrapped.rs": [
        { text: "mod demo {\n    // generated" },
        { anchor: "main", file: "../src/lib.rs" },
        { text: "}" },
      ],
    });
    const result = runScript(join(root, "book"));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const read = (name: string) => excerpt(root, name);
    // Nested markers go, the unnamed #endregion closes the inner region, and
    // dedent removes the indentation every line shares.
    expect(await read("setup.ts")).toBe("setup() {\n  this.ready = true;\n}\n");
    // A comment that only mentions a region isn't a marker.
    expect(await read("config.py")).toBe("VALUE = 1\n");
    expect(await read("usage.md")).toBe("Use it.\n");
    expect(await read("colors.css")).toBe(":root { --accent: red; }\n");
    expect(await read("nested/body.rs")).toBe(
      'fn main() {\n    println!("hi");\n}\n'
    );
    expect(await read("tail.rs")).toBe(
      "}\n// ANCHOR_END: main\n// ANCHOR_END: all\n"
    );
    expect(await read("wrapped.rs")).toBe(
      'mod demo {\n    // generated\nfn main() {\n    println!("hi");\n}\n}\n'
    );
    expect(await read("crlf.rs")).toBe("fn a() {}\nfn b() {}\n");
  });

  it("reports every problem in one pass and writes nothing", async () => {
    // Raw JSON: a misspelled key is exactly what a typed manifest can't hold.
    const root = await fixture(
      {},
      `{
      "out": "../docs/_excerpts",
      "excerpts": {
        "../escape.rs": "../src/lib.rs",
        "both.rs": { "anchor": "main", "file": "../src/lib.rs", "region": "x" },
        "empty.rs": "../src/lib.rs:3:2",
        "gone.rs": "../src/lib.rs:gone",
        "joined.rs": [{ "text": "fn x() {" }, "../src/lib.rs:also-gone"],
        "missing.rs": { "file": "../src/missing.rs" },
        "nope.ts": { "file": "../src/app.ts", "region": "nope" },
        "past.rs": { "file": "../src/lib.rs", "lines": "5-40" },
        "tail.rs": "../src/lib.rs:12:",
        "typo.rs": { "file": "../src/lib.rs", "regoin": "setup" },
        "./dot.rs": "../src/lib.rs",
        "none.rs": [],
        "dir": "../src/lib.rs",
        "dir/file.rs": "../src/lib.rs"
      }
    }`
    );
    const result = runScript(join(root, "book"));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const lines = result.stderr.trim().split("\n");
    expect(lines).toEqual([
      'excerpts.json: "../escape.rs": the name must be a relative path inside out',
      'excerpts.json: "both.rs": a part takes "anchor" or "region", not both',
      'excerpts.json: "empty.rs": "3-2" isn\'t a line range (../src/lib.rs)',
      'excerpts.json: "gone.rs": no "ANCHOR: gone" line in ../src/lib.rs',
      'excerpts.json: "joined.rs": no "ANCHOR: also-gone" line in ../src/lib.rs',
      'excerpts.json: "missing.rs": no file at ../src/missing.rs',
      'excerpts.json: "nope.ts": no "#region nope" marker in ../src/app.ts',
      'excerpts.json: "past.rs": lines 5-40 run past the end of ../src/lib.rs (8 lines)',
      'excerpts.json: "tail.rs": lines 12- run past the end of ../src/lib.rs (8 lines)',
      'excerpts.json: "typo.rs": unknown key "regoin"',
      'excerpts.json: "./dot.rs": the name must be a relative path inside out',
      'excerpts.json: "none.rs": an empty list selects no lines',
      'excerpts.json: "dir": another excerpt uses it as a folder',
      "include-excerpts: 13 problem(s); nothing written.",
    ]);
    const out = await stat(join(root, "docs", "_excerpts")).catch(() => null);
    expect(out).toBeNull();
  });

  it("rewrites only what changed, removes what the manifest dropped, and checks", async () => {
    const root = await fixture({
      "a.rs": "../src/lib.rs:main",
      "b.rs": "../src/lib.rs:all",
    });
    const book = join(root, "book");
    expect(runScript(book).status).toBe(0);
    const before = await stat(join(root, "docs", "_excerpts", "a.rs"));

    const again = runScript(book);
    expect(again.stdout).toContain("(0 written, 0 removed)");
    expect(runScript(book, "--check").stdout).toContain("all current");

    // The source changes and the manifest drops one excerpt.
    await put(
      join(root, "src", "lib.rs"),
      RUST.replace('println!("hi")', 'println!("hello")')
    );
    await put(
      join(book, "excerpts.json"),
      JSON.stringify({
        excerpts: { "sub/a.rs": "../src/lib.rs:main" },
        out: "../docs/_excerpts",
      })
    );
    const check = runScript(book, "--check");
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("out of date: sub/a.rs");
    expect(check.stderr).toContain("not in the manifest: a.rs");
    expect(check.stderr).toContain("not in the manifest: b.rs");
    // --check wrote nothing.
    const after = await stat(join(root, "docs", "_excerpts", "a.rs"));
    expect(after.mtimeMs).toBe(before.mtimeMs);

    const written = runScript(book);
    expect(written.stdout).toContain("(1 written, 2 removed)");
    expect(await listFiles(join(root, "docs", "_excerpts"))).toEqual([
      ".include-excerpts.json",
      "sub/a.rs",
    ]);
    expect(await excerpt(root, "sub/a.rs")).toContain('println!("hello")');
  });

  it("deletes only what it wrote, and never writes through a link", async () => {
    const root = await fixture({ "a.rs": "../src/lib.rs:main" });
    const book = join(root, "book");
    const out = join(root, "docs", "_excerpts");
    // A hand-written partial in the same `_` folder.
    await put(join(out, "intro.md"), "Hand-written.\n");
    expect(runScript(book).status).toBe(0);
    await put(
      join(book, "excerpts.json"),
      JSON.stringify({ excerpts: {}, out: "../docs/_excerpts" })
    );
    expect(runScript(book).stdout).toContain("(0 written, 1 removed)");
    expect(await listFiles(out)).toEqual([
      ".include-excerpts.json",
      "intro.md",
    ]);

    // A link inside out, to source the project keeps.
    await symlink(join(root, "src"), join(out, "linked"));
    await put(
      join(book, "excerpts.json"),
      JSON.stringify({
        excerpts: { "linked/lib.rs": "../src/app.ts" },
        out: "../docs/_excerpts",
      })
    );
    const through = runScript(book);
    expect(through.status).toBe(1);
    expect(through.stderr).toContain(
      '"linked/lib.rs": linked in out is a symbolic link'
    );
    expect(await readFile(join(root, "src", "lib.rs"), "utf-8")).toBe(RUST);

    // An out folder that is a link to a folder without a `_`.
    await symlink(join(root, "src"), join(root, "docs", "_source"));
    await put(
      join(book, "linked.json"),
      JSON.stringify({ excerpts: {}, out: "../docs/_source" })
    );
    const linked = runScript(book, "linked.json");
    expect(linked.status).toBe(2);
    expect(linked.stderr).toContain("not a link to a folder without one");
    expect(await listFiles(join(root, "src"))).toContain("lib.rs");
  });

  it("writes excerpts that Blume's <include> splices", async () => {
    const root = await fixture({ "main.rs": "../src/lib.rs:main" });
    expect(runScript(join(root, "book")).status).toBe(0);
    const page = join(root, "docs", "guide.md");
    const body = [
      "## Run it",
      "",
      '<include lang="rust">/_excerpts/main.rs</include>',
      "",
    ].join("\n");
    await put(page, body);

    const expanded = await expandIncludes(body, {
      contentRoot: join(root, "docs"),
      sourcePath: page,
    });
    expect(expanded.errors).toEqual([]);
    expect(expanded.text).toContain(
      '```rust\nfn main() {\n    println!("hi");\n}\n```'
    );
  });

  it("refuses an unsafe output folder, a bad manifest, and bad arguments", async () => {
    const root = await fixture({ "a.rs": "../src/lib.rs" });
    const book = join(root, "book");

    // The script deletes files in `out`, so it must be a `_` folder of its own.
    await put(
      join(book, "unsafe.json"),
      JSON.stringify({ excerpts: {}, out: "../docs" })
    );
    const unsafe = runScript(book, "unsafe.json");
    expect(unsafe.status).toBe(2);
    expect(unsafe.stderr).toContain('whose name starts with "_"');

    await put(join(book, "broken.json"), "{");
    const broken = runScript(book, "broken.json");
    expect(broken.status).toBe(2);
    expect(broken.stderr).toContain("isn't valid JSON");

    await put(join(book, "shape.json"), JSON.stringify({ excerpts: [] }));
    expect(runScript(book, "shape.json").stderr).toContain(
      'needs "out" (a folder) and "excerpts" (an object)'
    );

    const missing = runScript(root);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("no manifest at");

    const flag = runScript(book, "--write");
    expect(flag.status).toBe(2);
    expect(flag.stderr).toContain("unexpected --write");

    const help = runScript(book, "--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: node include-excerpts.mjs");
  });
});
