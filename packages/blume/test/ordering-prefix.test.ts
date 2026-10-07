import { describe, expect, it } from "bun:test";

import { buildNavigation } from "../src/core/navigation.ts";
import {
  formerRouteName,
  orderingPrefix,
  stripOrderingPrefix,
} from "../src/core/ordering-prefix.ts";
import { normalizeEntry } from "../src/core/sources/normalize.ts";
import type {
  NormalizeContext,
  SourceEntry,
} from "../src/core/sources/types.ts";
import type { Diagnostic, PageRecord } from "../src/core/types.ts";

const filesystem: NormalizeContext = {
  defaultType: "doc",
  source: { name: "filesystem", staged: false },
};

const staged = (name: string, prefix?: string): NormalizeContext => ({
  defaultType: "doc",
  source: { name, prefix, staged: true },
});

const entry = (ref: string, data?: SourceEntry["data"]): SourceEntry => ({
  body: { format: "md", text: "Body\n" },
  data: data ?? { title: ref },
  ref,
});

/** The pages one context normalizes a set of entries into. */
const pagesOf = (ctx: NormalizeContext, entries: SourceEntry[]): PageRecord[] =>
  entries.flatMap((item) => normalizeEntry(item, ctx).pages);

const routesOf = (ctx: NormalizeContext, entries: SourceEntry[]): string[] =>
  pagesOf(ctx, entries).map((page) => page.route);

describe("orderingPrefix", () => {
  it("reads digits and a -, _, or . separator as an ordering prefix", () => {
    expect(orderingPrefix("01-intro")).toBe("01");
    expect(orderingPrefix("2_setup")).toBe("2");
    expect(orderingPrefix("3.faq")).toBe("3");
    expect(orderingPrefix("2024-year-in-review")).toBe("2024");
    expect(orderingPrefix("intro")).toBeUndefined();
    expect(orderingPrefix("404")).toBeUndefined();
  });

  it("keeps a version or an ISO date whole", () => {
    for (const name of [
      "1.2.0",
      "2.0",
      "1.2.0.md",
      "2024-01-05",
      "2024-01-05.md",
      "2024-01-05-first-post",
      "2024-01-05_notes",
    ]) {
      expect(orderingPrefix(name)).toBeUndefined();
      expect(stripOrderingPrefix(name)).toBe(name);
    }
  });

  it("keeps a day- or month-first date and a year-month whole", () => {
    for (const name of [
      "12-05-2022",
      "12-05-2022.md",
      "1-5-2022-launch",
      "31-12-1999_notes",
      "2024-01",
      "2024-12.mdx",
      "2024-01-recap",
    ]) {
      expect(orderingPrefix(name)).toBeUndefined();
      expect(stripOrderingPrefix(name)).toBe(name);
    }
    // Not dates: no four-digit year last, a month past 12, or a word.
    expect(stripOrderingPrefix("12-05-intro")).toBe("05-intro");
    expect(stripOrderingPrefix("2024-13")).toBe("13");
    expect(stripOrderingPrefix("01-2024-roadmap")).toBe("2024-roadmap");
  });

  it("names the route an earlier Blume gave a date name", () => {
    expect(formerRouteName("12-05-2022")).toBe("05-2022");
    expect(formerRouteName("2024-01")).toBe("01");
    // Names whose route never changed have no former one.
    expect(formerRouteName("2024-01-05")).toBeUndefined();
    expect(formerRouteName("01-intro")).toBeUndefined();
    expect(formerRouteName("intro")).toBeUndefined();
  });

  it("strips the prefix and its separator", () => {
    expect(stripOrderingPrefix("01-intro")).toBe("intro");
    expect(stripOrderingPrefix("10_guides")).toBe("guides");
    expect(stripOrderingPrefix("intro")).toBe("intro");
  });
});

describe("route mapping of ordering prefixes", () => {
  it("strips them from filesystem file and folder names", () => {
    expect(
      routesOf(filesystem, [
        entry("01-intro.md"),
        entry("02-guides/01-index.md"),
        entry("02-guides/03-setup.md"),
      ])
    ).toStrictEqual(["/intro", "/guides", "/guides/setup"]);
  });

  it("keeps a versioned or dated filesystem name whole", () => {
    expect(
      routesOf(filesystem, [
        entry("changelog/1.2.0.md"),
        entry("changelog/2.2.0.md"),
        entry("blog/2024-01-05-first-post.md"),
      ])
    ).toStrictEqual([
      "/changelog/1.2.0",
      "/changelog/2.2.0",
      "/blog/2024-01-05-first-post",
    ]);
  });

  it("keeps a date-named file or folder whole and records its former route", () => {
    const pages = pagesOf(filesystem, [
      entry("changelog/12-05-2022.md"),
      entry("changelog/2024-01/notes.md"),
      entry("changelog/2024-01-05.md"),
      entry("changelog/01-intro.md"),
    ]);
    expect(pages.map((page) => [page.route, page.formerRoute])).toStrictEqual([
      ["/changelog/12-05-2022", "/changelog/05-2022"],
      ["/changelog/2024-01/notes", "/changelog/01/notes"],
      ["/changelog/2024-01-05", undefined],
      ["/changelog/intro", undefined],
    ]);
  });

  it("records no former route for a slug or a staged source's name", () => {
    const pages = [
      ...pagesOf(filesystem, [
        entry("a.md", { slug: "news/12-05-2022", title: "A" }),
      ]),
      ...pagesOf(staged("changelog", "changelog"), [entry("2024-01.md")]),
    ];
    expect(pages.map((page) => [page.route, page.formerRoute])).toStrictEqual([
      ["/news/12-05-2022", undefined],
      ["/changelog/2024-01", undefined],
    ]);
  });

  it("never strips an explicit frontmatter slug", () => {
    expect(
      routesOf(filesystem, [
        entry("a.md", { slug: "2024-year-in-review", title: "A" }),
        entry("b.md", { slug: "releases/2.0.0", title: "B" }),
      ])
    ).toStrictEqual(["/2024-year-in-review", "/releases/2.0.0"]);
  });

  it("never strips a staged source's ref, slug, or prefix", () => {
    // GitHub release tags `1.0.0` and `2.0.0` become these refs; stripping
    // `1-`/`2-` collapsed both onto `/changelog/0-0`.
    expect(
      routesOf(staged("changelog", "changelog"), [
        entry("1-0-0.md"),
        entry("2-0-0.md"),
      ])
    ).toStrictEqual(["/changelog/1-0-0", "/changelog/2-0-0"]);
    expect(
      routesOf(staged("blog", "blog"), [
        entry("2023-roadmap.md"),
        entry("2024-roadmap.md"),
      ])
    ).toStrictEqual(["/blog/2023-roadmap", "/blog/2024-roadmap"]);
    expect(
      routesOf(staged("vault"), [
        { ...entry("Daily/2023-01-15.md"), slug: "daily/2023-01-15" },
        { ...entry("Daily/2024-01-15.md"), slug: "daily/2024-01-15" },
      ])
    ).toStrictEqual(["/daily/2023-01-15", "/daily/2024-01-15"]);
    expect(routesOf(staged("docs", "/01-docs/"), [entry("x.md")])).toEqual([
      "/01-docs/x",
    ]);
  });
});

describe("sidebar order of dated names", () => {
  it("does not read posts from the same year as a duplicate order", () => {
    const pages = pagesOf(filesystem, [
      entry("blog/2024-01-05-first-post.md", { title: "First" }),
      entry("blog/2024-03-09-second-post.md", { title: "Second" }),
    ]);
    const diagnostics: Diagnostic[] = [];
    buildNavigation(pages, { diagnostics, folderMeta: new Map() });
    expect(diagnostics.map((d) => d.code)).not.toContain(
      "BLUME_DUPLICATE_SIDEBAR_ORDER"
    );
  });
});
