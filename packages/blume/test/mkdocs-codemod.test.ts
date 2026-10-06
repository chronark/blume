import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import matter from "../src/core/frontmatter.ts";

// The blume-migrate skill's zero-dependency MkDocs content codemod, run the way
// the skill runs it: a bare `node` over the repo-root copy, from the directory
// that holds mkdocs.yml (the package's `skills/` is a generated mirror).
const CODEMOD = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "skills",
  "blume-migrate",
  "scripts",
  "mkdocs-codemod.mjs"
);

const root = mkdtempSync(join(tmpdir(), "blume-mkdocs-codemod-"));

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

const CONFIG = [
  "site_name: Fixture",
  "theme:",
  "  name: material",
  "  custom_dir: overrides",
  "nav:",
  "  - Home: index.md",
  "  - Guide:",
  "      - Install it: guide/install.md",
  "      - guide/plain.md",
  "plugins:",
  "  - search",
  "  - mkdocstrings",
  "markdown_extensions:",
  "  - admonition",
  "  - attr_list",
  "  - pymdownx.details",
  "  - pymdownx.superfences",
  "  - pymdownx.tabbed:",
  "      alternate_style: true",
  "  - pymdownx.snippets",
  "  - pymdownx.inlinehilite",
  "  - pymdownx.keys",
  "  - pymdownx.emoji",
  "  - pymdownx.highlight:",
  "      extend_pygments_lang:",
  "        - name: requirements",
  "          lang: python",
  "",
].join("\n");

/** Write a fixture project (paths relative to it) and return its directory. */
const project = async (
  name: string,
  files: Record<string, string>
): Promise<string> => {
  const dir = join(root, name);
  await Promise.all(
    Object.entries({ "mkdocs.yml": CONFIG, ...files }).map(
      async ([file, text]) => {
        await mkdir(dirname(join(dir, file)), { recursive: true });
        await writeFile(join(dir, file), text);
      }
    )
  );
  return dir;
};

const runCodemod = (cwd: string, ...args: string[]): string => {
  const result = spawnSync("node", [CODEMOD, ...args], {
    cwd,
    encoding: "utf-8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
};

const body = (text: string): string => matter(text).content.trim();

describe("mkdocs-codemod", () => {
  it("converts admonitions and details, keeping list indentation", async () => {
    const dir = await project("callouts", {
      "docs/index.md": [
        "# Home",
        "",
        "1. Install it:",
        "",
        '    !!! warning "Heads up"',
        "        Read this first.",
        "",
        "        ```requirements",
        "        httpx==0.27",
        "        ```",
        "",
        "2. Done.",
        "",
        "!!! important",
        "    !!! tip",
        "        A nested tip.",
        "",
        '??? tip "More"',
        "    Hidden text.",
        "",
        "???+ note",
        "    Open text.",
        "",
      ].join("\n"),
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("docs/index.md → docs/index.mdx");
    expect(body(await readFile(join(dir, "docs/index.mdx"), "utf-8"))).toBe(
      [
        "1. Install it:",
        "",
        "    :::warning[Heads up]",
        "    Read this first.",
        "",
        "    ```python",
        "    httpx==0.27",
        "    ```",
        "    :::",
        "",
        "2. Done.",
        "",
        "::::note",
        ":::tip",
        "A nested tip.",
        ":::",
        "::::",
        "",
        '<Expandable title="More">',
        "",
        "Hidden text.",
        "",
        "</Expandable>",
        "",
        '<Expandable title="Note" defaultOpen>',
        "",
        "Open text.",
        "",
        "</Expandable>",
      ].join("\n")
    );
  });

  it("turns code-only tabs into a CodeGroup and mixed tabs into Tabs", async () => {
    const dir = await project("tabs", {
      "docs/index.md": [
        "# Tabs",
        "",
        '=== "macOS"',
        "",
        "    ```bash",
        "    brew install x",
        "    ```",
        "",
        '=== "Linux"',
        "",
        '    ```bash hl_lines="1"',
        "    curl x | sh",
        "    ```",
        "",
        "Between.",
        "",
        '=== "Code"',
        "",
        "    ```py",
        "    x = 1",
        "    ```",
        "",
        '===+ "Prose"',
        "",
        "    Some text.",
        "",
      ].join("\n"),
    });
    runCodemod(dir, "--write", "docs");
    expect(body(await readFile(join(dir, "docs/index.mdx"), "utf-8"))).toBe(
      [
        "<CodeGroup>",
        "",
        '```bash title="macOS"',
        "brew install x",
        "```",
        "",
        '```bash {1} title="Linux"',
        "curl x | sh",
        "```",
        "",
        "</CodeGroup>",
        "",
        "Between.",
        "",
        "<Tabs defaultTabIndex={1}>",
        '<Tab title="Code">',
        "",
        "```py",
        "x = 1",
        "```",
        "",
        "</Tab>",
        '<Tab title="Prose">',
        "",
        "Some text.",
        "",
        "</Tab>",
        "</Tabs>",
      ].join("\n")
    );
  });

  it("resolves snippets from the base path and copies outside files in", async () => {
    const dir = await project("snippets", {
      "CONTRIBUTING.md": "Contribute here.\n",
      "docs/.snips/list.md": "- shared item\n",
      "docs/index.md": [
        "# Snippets",
        "",
        '--8<-- "docs/.snips/list.md"',
        "",
        '--8<-- "CONTRIBUTING.md"',
        "",
        '```{ .py title="hello.py" linenums="1" }',
        '--8<-- "examples/hello.py"',
        "```",
        "",
        '--8<-- "examples/hello.py:2:3"',
        "",
      ].join("\n"),
      "examples/hello.py": 'print("hi")\n',
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("copied to _snippets/CONTRIBUTING.md");
    expect(report).toContain("line ranges and sections have no equivalent");
    // Includes alone don't need MDX: the page stays .md.
    expect(body(await readFile(join(dir, "docs/index.md"), "utf-8"))).toBe(
      [
        "<include>/.snips/list.md</include>",
        "",
        "<include>/_snippets/CONTRIBUTING.md</include>",
        "",
        `<include lang="py" meta='title="hello.py" lineNumbers'>/_snippets/examples/hello.py</include>`,
        "",
        '--8<-- "examples/hello.py:2:3"',
      ].join("\n")
    );
    expect(
      await readFile(join(dir, "docs/_snippets/CONTRIBUTING.md"), "utf-8")
    ).toBe("Contribute here.\n");
    expect(existsSync(join(dir, "docs/_snippets/examples/hello.py"))).toBe(
      true
    );
  });

  it("moves the H1, nav title, and Material keys into Blume frontmatter", async () => {
    const dir = await project("frontmatter", {
      "docs/guide/install.md": [
        "---",
        "title: Install the fixture",
        "hide:",
        "  - navigation",
        "  - footer",
        "status: new",
        "tags:",
        "  - setup",
        "icon: material/rocket-launch",
        "subtitle: Gone",
        "---",
        "",
        "# The `fixture` CLI",
        "",
        "Text.",
        "",
      ].join("\n"),
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain(
      "inline Markdown stripped from the title: The `fixture` CLI"
    );
    expect(report).toContain("subtitle has no equivalent");
    const text = await readFile(join(dir, "docs/guide/install.md"), "utf-8");
    expect(matter(text).data).toEqual({
      icon: "rocket",
      mode: "center",
      pagination: false,
      search: { tags: ["setup"] },
      seo: { title: "Install the fixture" },
      sidebar: { badge: "New", label: "Install it" },
      title: "The fixture CLI",
    });
    expect(body(text)).toBe("Text.");
  });

  it("rewrites fences, heading ids, attribute lists, keys, inline code, and icons", async () => {
    const dir = await project("inline", {
      "docs/index.md": [
        "# Inline",
        "",
        "## Setup { #setup }",
        "",
        "### [`opt`](#opt) {: #opt }",
        "",
        '```hl_lines="2"',
        "a",
        "b",
        "```",
        "",
        "Call `#!python hello()` and press ++ctrl+alt+del++.",
        "",
        '![shot](shot.png){: style="width:50px" } [Go](x.md){ .md-button } :material-check: :octicons-link-external-16:',
        "",
        "<!-- multi",
        "line -->",
        "",
        "See <https://example.com> and [Darwin](<https://en.wikipedia.org/wiki/Darwin_(os)>).",
        "",
      ].join("\n"),
      "docs/x.md": "# X\n",
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("button '{ .md-button }' dropped");
    expect(body(await readFile(join(dir, "docs/index.mdx"), "utf-8"))).toBe(
      [
        "## Setup [#setup]",
        "",
        "### `opt` [#opt]",
        "",
        "```text {2}",
        "a",
        "b",
        "```",
        "",
        "Call `hello(){:python}` and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>.",
        "",
        '![shot](shot.png) [Go](x.md) <Icon icon="check" /> ',
        "",
        "{/* multi line */}",
        "",
        "See [https://example.com](https://example.com) and [Darwin](https://en.wikipedia.org/wiki/Darwin_%28os%29).",
      ].join("\n")
    );
  });

  it("rewrites links to renamed pages, including README → index", async () => {
    const dir = await project("links", {
      "docs/guide/install.md": "# Install\n\n!!! note\n    Hi.\n",
      "docs/guide/plain.md": [
        "# Plain",
        "",
        "See [install](install.md#setup), [sub](../sub/README.md), and [ref].",
        "",
        "[ref]: ./install.md",
        "",
      ].join("\n"),
      "docs/sub/README.md": "# Sub\n",
    });
    runCodemod(dir, "--write", "docs");
    expect(existsSync(join(dir, "docs/sub/index.md"))).toBe(true);
    expect(existsSync(join(dir, "docs/guide/install.mdx"))).toBe(true);
    expect(
      body(await readFile(join(dir, "docs/guide/plain.md"), "utf-8"))
    ).toBe(
      [
        "See [install](install.mdx#setup), [sub](../sub/index.md), and [ref].",
        "",
        "[ref]: ./install.mdx",
      ].join("\n")
    );
  });

  it("reports what needs a human and leaves it in place", async () => {
    const dir = await project("manual", {
      "docs/guide/install.md": [
        "# Install",
        "",
        "!!! note",
        "    Run uv run <command> now.",
        "",
        "::: fixture.module",
        "",
      ].join("\n"),
      "docs/guide/plain.md": "# Plain\n\n{{ config.site_name }}\n",
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("mkdocstrings");
    expect(report).toContain("1 line(s) with {{ }} / {% %}");
    expect(report).toContain("<command>");
    expect(report).toContain("plugin mkdocstrings: manual");
    expect(report).toContain("theme.custom_dir overrides");
    expect(report).toContain("nav entry index.md has no file");
    expect(
      body(await readFile(join(dir, "docs/guide/install.mdx"), "utf-8"))
    ).toBe(
      [
        ":::note",
        "Run uv run <command> now.",
        ":::",
        "",
        "::: fixture.module",
      ].join("\n")
    );
  });

  it("writes nothing in a dry run, and nothing on a second run", async () => {
    const source = "# Page\n\n!!! note\n    Hi.\n";
    const dir = await project("idempotent", { "docs/index.md": source });
    expect(runCodemod(dir, "docs")).toContain(
      "1 would change. Re-run with --write to apply."
    );
    expect(await readFile(join(dir, "docs/index.md"), "utf-8")).toBe(source);

    runCodemod(dir, "--write", "docs");
    const once = await readFile(join(dir, "docs/index.mdx"), "utf-8");
    const again = runCodemod(dir, "--write", "docs");
    expect(again).toContain("0 changed.");
    // The renamed nav file still counts as present on a rerun.
    expect(again).not.toContain("nav entry index.md has no file");
    expect(await readFile(join(dir, "docs/index.mdx"), "utf-8")).toBe(once);
  });

  it("reads admonitions, snippets, and titles the way MkDocs does", async () => {
    const dir = await project("edges", {
      "docs/guide/install.md": [
        // Text after the closing quote: MkDocs leaves the line as written.
        '--8<-- "inc/step.md" ',
        "",
        "1.  Step:",
        "",
        '    --8<-- "inc/step.md"',
        "",
      ].join("\n"),
      "docs/guide/plain.md": [
        "Plain title",
        "===========",
        "",
        "!!!note",
        "    No space.",
        "",
        '!!! "Untyped"',
        "    Not an admonition.",
        "",
        '??? "Only a title"',
        "    Details may skip the type.",
        "",
        '!!! tip "Use `[x]` here"',
        "    Balanced.",
        "",
        '!!! tip "Open ] bracket"',
        "    Unbalanced.",
        "",
        '??? note "The `uv` CLI"',
        "    Code in a summary.",
        "",
        '<img src="shot.png">',
        "",
      ].join("\n"),
      "inc/step.md": "Do the step.\n",
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("raw <img> with a relative src");
    // An include indented in a list splices only in .mdx.
    expect(
      body(await readFile(join(dir, "docs/guide/install.mdx"), "utf-8"))
    ).toBe(
      [
        '--8<-- "inc/step.md" ',
        "",
        "1.  Step:",
        "",
        "    <include>/_snippets/inc/step.md</include>",
      ].join("\n")
    );
    const plain = await readFile(join(dir, "docs/guide/plain.mdx"), "utf-8");
    expect(matter(plain).data.title).toBe("Plain title");
    expect(body(plain)).toBe(
      [
        ":::note",
        "No space.",
        ":::",
        "",
        '!!! "Untyped"',
        "    Not an admonition.",
        "",
        '<Expandable title="Only a title">',
        "",
        "Details may skip the type.",
        "",
        "</Expandable>",
        "",
        ":::tip[Use `[x]` here]",
        "Balanced.",
        ":::",
        "",
        String.raw`:::tip[Open \] bracket]`,
        "Unbalanced.",
        ":::",
        "",
        '<Expandable title="The uv CLI">',
        "",
        "Code in a summary.",
        "",
        "</Expandable>",
        "",
        '<img src="shot.png" />',
      ].join("\n")
    );
  });

  it("repoints includes at a snippet page it renamed, and reports it", async () => {
    const dir = await project("include-page", {
      "docs/guide/install.md": '# Install\n\n--8<-- "docs/shared/note.md"\n',
      "docs/shared/note.md": "!!! note\n    Shared.\n",
    });
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("is a page too");
    expect(existsSync(join(dir, "docs/shared/note.mdx"))).toBe(true);
    expect(
      body(await readFile(join(dir, "docs/guide/install.mdx"), "utf-8"))
    ).toBe("<include>/shared/note.mdx</include>");
  });

  it("reads Zensical's dotted extension keys and its default set", async () => {
    const dotted = join(root, "zensical-dotted");
    await mkdir(join(dotted, "docs"), { recursive: true });
    await writeFile(
      join(dotted, "zensical.toml"),
      [
        "[project]",
        'site_name = "Z"',
        "",
        "[project.markdown_extensions]",
        "admonition = {}",
        "pymdownx.tabbed.alternate_style = true",
        "",
      ].join("\n")
    );
    await writeFile(
      join(dotted, "docs/index.md"),
      '# Z\n\n!!! tip\n    Hi.\n\n=== "A"\n\n    Text.\n\nPress ++ctrl++.\n'
    );
    runCodemod(dotted, "--write", "docs");
    expect(body(await readFile(join(dotted, "docs/index.mdx"), "utf-8"))).toBe(
      [
        ":::tip",
        "Hi.",
        ":::",
        "",
        "<Tabs>",
        '<Tab title="A">',
        "",
        "Text.",
        "",
        "</Tab>",
        "</Tabs>",
        "",
        // keys isn't enabled, so `++ctrl++` stays.
        "Press ++ctrl++.",
      ].join("\n")
    );

    const defaults = join(root, "zensical-defaults");
    await mkdir(join(defaults, "docs"), { recursive: true });
    await writeFile(
      join(defaults, "zensical.toml"),
      '[project]\nsite_name = "Z"\n'
    );
    await writeFile(
      join(defaults, "docs/index.md"),
      "# Z\n\nPress ++ctrl++.\n"
    );
    runCodemod(defaults, "--write", "docs");
    expect(body(await readFile(join(defaults, "docs/index.md"), "utf-8"))).toBe(
      "Press <kbd>Ctrl</kbd>."
    );
  });

  it("converts every extension's syntax without a config, except the risky ones", async () => {
    const dir = join(root, "no-config");
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(
      join(dir, "docs/index.md"),
      "# Page\n\n!!! tip\n    Hi.\n\nPress ++ctrl++ and \\(x\\).\n"
    );
    const report = runCodemod(dir, "--write", "docs");
    expect(report).toContain("config: none found");
    expect(body(await readFile(join(dir, "docs/index.mdx"), "utf-8"))).toBe(
      ":::tip\nHi.\n:::\n\nPress ++ctrl++ and \\(x\\)."
    );
  });
});
