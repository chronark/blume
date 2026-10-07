import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { dirname, join } from "pathe";

import { changelogComponentSerializers } from "../src/ai/changelog-components.ts";
import { buildChangelogIndexMarkdown } from "../src/ai/changelog-markdown.ts";
import { downlevelComponents } from "../src/ai/component-markdown.ts";
import {
  compareChangelogDates,
  groupChangelogYears,
  parseChangelogDate,
  uniqueAnchorIds,
} from "../src/core/changelog-list.ts";
import type { BlumeProject } from "../src/core/project-graph.ts";
import { scanProject } from "../src/core/project-graph.ts";

/**
 * `<Changelog />` — the release list the generated `/changelog` page renders,
 * and the one an authored page places to put prose above it. What matters is
 * that the two routes to an index agree: the same releases, in the same order,
 * on the rendered page and on every agent surface.
 */

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const scanFixture = async (
  files: Record<string, string>
): Promise<BlumeProject> => {
  const root = await mkdtemp(join(tmpdir(), "blume-changelog-component-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    })
  );
  return await scanProject(root);
};

const release = (title: string, date: string, category?: string): string =>
  `---\ntitle: ${title}\ntype: changelog\ndate: ${date}\n${
    category ? `changelog:\n  category: ${category}\n` : ""
  }---\n\nBody.\n`;

const componentSource = async (): Promise<string> =>
  await readFile(
    fileURLToPath(
      new URL("../src/components/content/Changelog.astro", import.meta.url)
    ),
    "utf-8"
  );

describe("changelog list policy", () => {
  it("sorts newest first and leaves undated entries last", () => {
    const dates = [
      parseChangelogDate("2026-01-15"),
      null,
      parseChangelogDate("2026-07-01"),
    ];
    expect(
      [...dates]
        .toSorted(compareChangelogDates)
        .map((date) => date?.toISOString().slice(0, 10) ?? "undated")
    ).toEqual(["2026-07-01", "2026-01-15", "undated"]);
  });

  it("reads a Date as well as a string, and refuses a malformed one", () => {
    expect(parseChangelogDate(new Date("2026-03-04"))?.getUTCFullYear()).toBe(
      2026
    );
    expect(parseChangelogDate("2026-03-04")?.getUTCFullYear()).toBe(2026);
    // A malformed date costs the row its stamp, never the build.
    expect(parseChangelogDate("not a date")).toBeNull();
    expect(parseChangelogDate(null)).toBeNull();
  });

  it("groups consecutive rows of the same year, undated in their own group", () => {
    const rows = [
      { year: "2026" },
      { year: "2026" },
      { year: "2025" },
      { year: null },
    ];
    expect(
      groupChangelogYears(rows, (row) => row.year).map((group) => [
        group.year,
        group.items.length,
      ])
    ).toEqual([
      ["2026", 2],
      ["2025", 1],
      [null, 1],
    ]);
  });

  it("suffixes repeated anchors so every row keeps its own", () => {
    expect(uniqueAnchorIds(["v1", "v2"])).toEqual(["v1", "v2"]);
    expect(uniqueAnchorIds(["update", "update", "update"])).toEqual([
      "update",
      "update-2",
      "update-3",
    ]);
    // A generated suffix never collides with a later natural slug.
    expect(uniqueAnchorIds(["v1", "v1", "v1-2"])).toEqual([
      "v1",
      "v1-2",
      "v1-2-2",
    ]);
  });
});

describe("Changelog component", () => {
  it("folds in the staged collection from the route manifest, not a generator flag", async () => {
    const source = await componentSource();
    // The gap this closes: a hand-written index reads `docs` only and silently
    // drops GitHub Releases entries. The component asks the manifest instead,
    // so it is right wherever it is placed — including an authored page, which
    // no generator flag reaches.
    expect(source).toContain('route.collection === "staged"');
    expect(source).toContain('await getCollection("docs")');
    // Both sides of it: the staged read is reached only through that check, so
    // a site with no staged source never asks for a collection it lacks.
    expect(source).toContain(
      'hasStaged ? await getCollection("staged" as "docs")'
    );
    expect(source).not.toMatch(/^\s*\.\.\.\(await getCollection\("staged"/mu);
  });

  it("lists the default locale's entries whatever locale it sits in", async () => {
    const source = await componentSource();
    // One rule, stated once: every surface that publishes this list is default
    // locale only, so a translated page listing its own locale's entries would
    // be the one surface disagreeing about which releases exist.
    expect(source).toContain(
      "const locale = i18n ? i18n.defaultLocale : null;"
    );
    expect(source).toContain("(locale === null || route.locale === locale)");
    // The chrome around it still follows the reader: the empty line, and the
    // row dates and year headings, which a Portuguese page reads in Portuguese.
    expect(source).toContain("contentStrings(data, Astro.currentLocale)");
    expect(source).toContain(
      'const readerLocale = i18n ? (Astro.currentLocale ?? i18n.defaultLocale) : "en";'
    );
    expect(source).toContain(
      "new Intl.DateTimeFormat(readerLocale, rowDateFormat)"
    );
    expect(source).toContain("new Intl.DateTimeFormat(readerLocale, {");
  });

  it("selects the same releases the Markdown mirror does", async () => {
    const source = await componentSource();
    // The mirror filters pages by `version === ""`, `!fallback` and the
    // default locale; the component filters routes by the same three. Without
    // the version and fallback conditions a versioned site's row could link
    // into archived docs while the mirror linked to the current ones — the two
    // surfaces disagreeing is exactly what moving the list into one component
    // is meant to prevent.
    expect(source).toContain('route.version === ""');
    expect(source).toContain("!route.fallback");
    const mirror = await readFile(
      fileURLToPath(
        new URL("../src/ai/changelog-markdown.ts", import.meta.url)
      ),
      "utf-8"
    );
    expect(mirror).toContain('page.version === ""');
    expect(mirror).toContain("!page.fallback");
  });

  it("drops the year a row's group already shows, keeping the style's month wording", async () => {
    const source = await componentSource();
    // Moved here from the template's tests with the markup. `medium` is the
    // one preset that abbreviates the month, so a `long` or `full` site keeps
    // reading "October 5"; a component format just loses its `year` key.
    expect(source).toContain(
      "const { dateStyle, year: _year, ...dateComponents } = dateFormatOptions;"
    );
    expect(source).toContain(
      'month: dateStyle === "medium" ? "short" : "long",'
    );
    expect(source).toContain("timeZone: dateFormatOptions.timeZone,");
    expect(source).toContain('year: "numeric",');
  });

  it("requires a current-docs route on every site, not only localized ones", async () => {
    const source = await componentSource();
    // The route map drops archived versions for everyone, so short-circuiting
    // the membership check when i18n is off would list an archived entry with
    // a dead self-anchor while the Markdown mirror left it out.
    expect(source).toContain(
      "routeByEntry.has(entryKey(entry.collection, entry.id))"
    );
    expect(source).not.toContain("locale === null || routeByEntry.has(");
  });

  it("links each row to its own page, under the deployment base", async () => {
    const source = await componentSource();
    // Moved here from the template's tests with the list. The manifest route is
    // base-less, so a row rebases it the way the catch-all's canonical does,
    // and falls back to its own anchor when an entry has no page.
    expect(source).toContain(
      "const route = routeByEntry.get(entryKey(entry.collection, entry.id));"
    );
    expect(source).toContain("href: route ? withMountedBase(route) : null,");
    // A regex, so the anchor's own `${…}` isn't read as interpolation here.
    expect(source).toMatch(/href=\{item\.href \?\? `#\$\{item\.id\}`\}/u);
    expect(source).toContain(
      "routeByEntry.set(entryKey(route.collection, route.entryId), route.path);"
    );
    // Keyed by collection too: both collections id an entry by its file path,
    // so a file on disk and a staged release can share an id while rendering
    // at different routes, and an id-only map would point both rows at one.
    expect(source).toMatch(
      /const entryKey = \(collection: string, id: string\) =>\s+`\$\{collection\}:\$\{id\}`;/u
    );
  });

  it("is a built-in tag, so a page using it passes the component check", async () => {
    const { BUILTIN_MDX_TAGS } = await import("../src/core/builtin-tags.ts");
    expect(BUILTIN_MDX_TAGS.has("Changelog")).toBe(true);
  });

  it("keeps the list's markup, not the page's heading or description", async () => {
    const source = await componentSource();
    expect(source).toContain("<h2");
    expect(source).toContain("{group.year}");
    expect(source).toContain("{item.label}");
    expect(source).toContain("datetime={item.dateTime}");
    expect(source).toContain("tag: entry.data.changelog?.category ?? null,");
    expect(source).toContain("{strings.empty}");
    // The empty line is translatable, never the English baseline inline.
    expect(source).not.toContain("No changelog entries yet.");
    // The heading and the description belong to whoever owns the page: the
    // generated page keeps its translatable pair, an authored page writes its
    // own prose.
    expect(source).not.toContain("<h1>");
    expect(source).not.toContain("changelogDescription");
  });
});

describe("Changelog serializer", () => {
  it("downlevels the tag to the release list agents would otherwise miss", async () => {
    const project = await scanFixture({
      "blume.config.ts": 'export default { title: "Acme" };',
      "docs/changelog/v1.md": release("v1.0.0", "2026-01-15"),
      "docs/changelog/v2.md": release("v2.0.0", "2026-07-01", "Features"),
      "docs/index.md": "---\ntitle: Home\n---\n\nHome.\n",
    });
    const markdown = downlevelComponents(
      "Prose above the list.\n\n<Changelog />\n",
      changelogComponentSerializers(project)
    );
    expect(markdown).toContain("Prose above the list.");
    // Without a serializer the tag would reach `/changelog.md`, llms-full.txt
    // and MCP `get_page` verbatim, and an agent would read no releases at all.
    expect(markdown).not.toContain("<Changelog />");
    expect(markdown).toContain("## 2026");
    expect(markdown).toContain("[v2.0.0](/changelog/v2)");
    expect(markdown).toContain("[v1.0.0](/changelog/v1)");
    expect(markdown).toContain("Features");
  });

  it("publishes the same list the generated page's mirror does", async () => {
    const project = await scanFixture({
      "blume.config.ts": 'export default { title: "Acme" };',
      "docs/changelog/v1.md": release("v1.0.0", "2026-01-15"),
      "docs/index.md": "---\ntitle: Home\n---\n\nHome.\n",
    });
    const authored = downlevelComponents(
      "<Changelog />\n",
      changelogComponentSerializers(project)
    ).trim();
    const generated = buildChangelogIndexMarkdown(project);
    // The authored page brings its own heading, so the mirror of the generated
    // page is that same list under the translatable title and description.
    expect(generated).toContain(authored);
    expect(generated).toContain("# Changelog");
    expect(authored).not.toContain("# Changelog");
  });

  it("drops the tag on a site with no releases rather than leaving it as written", async () => {
    const project = await scanFixture({
      "blume.config.ts": 'export default { title: "Acme" };',
      "docs/index.md": "---\ntitle: Home\n---\n\nHome.\n",
    });
    const markdown = downlevelComponents(
      "Prose above the list.\n\n<Changelog />\n",
      changelogComponentSerializers(project)
    );
    // The page's own prose is all an agent reads — no bare "## Undated", and
    // no literal tag, which is what a `null` from the serializer would leave
    // (a GitHub Releases fetch that degrades to empty lands here too).
    expect(markdown).toContain("Prose above the list.");
    expect(markdown).not.toContain("<Changelog");
    expect(markdown).not.toContain("##");
  });
});
