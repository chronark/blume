import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { dirname, join } from "pathe";

import { buildLlmsIndex } from "../src/ai/llms.ts";
import { buildSiteSkill } from "../src/ai/site-skill.ts";
import { isHiddenPage } from "../src/core/hidden-pages.ts";
import { scanProject } from "../src/core/project-graph.ts";
import type { BlumeProject } from "../src/core/project-graph.ts";
import { pageMetaSchema } from "../src/core/schema.ts";
import type {
  ContentGraph,
  Navigation,
  NavNode,
  PageRecord,
} from "../src/core/types.ts";
import { buildSitemapFiles } from "../src/deploy/sitemap.ts";
import { buildSearchDocuments } from "../src/search/documents.ts";

/**
 * `sidebar.hidden` (and the top-level `hidden` shorthand) on a folder's index
 * page only drops the page's own row: the group row still links the page, so
 * it stays in the sitemap, search, llms.txt, the site skill, and the manifest
 * the MCP server and JSON API list from. Any other hidden page stays out.
 */

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const SITE = "https://docs.example.com";

const page = (title: string, extra = ""): string =>
  `---\ntitle: ${title}\n${extra}---\n# ${title}\n\nBody.\n`;

const PAGES = {
  "docs/guides/index.md": page("Guides", "sidebar:\n  hidden: true\n"),
  "docs/guides/install/index.md": page("Install", "hidden: true\n"),
  "docs/guides/install/npm.md": page("npm"),
  "docs/guides/setup.md": page("Setup"),
  "docs/index.md": page("Home"),
  // A folder whose every page is hidden has no group row to link its index.
  "docs/internal/index.md": page("Internal", "hidden: true\n"),
  "docs/internal/notes.md": page("Notes", "hidden: true\n"),
  "docs/secret.md": page("Secret", "sidebar:\n  hidden: true\n"),
  "docs/shorthand.md": page("Shorthand", "noindex: true\n"),
};

/** Write `files` to a fresh project and scan it for a build. */
const scan = async (
  files: Record<string, string>,
  config = ""
): Promise<BlumeProject> => {
  const root = await mkdtemp(join(tmpdir(), "blume-hidden-pages-"));
  dirs.push(root);
  await Promise.all(
    Object.entries({
      "blume.config.ts": `export default { deployment: { site: "${SITE}" }${config} };\n`,
      ...files,
    }).map(async ([path, content]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    })
  );
  return scanProject(root, { mode: "build" });
};

const sitemapOf = (project: BlumeProject): string =>
  buildSitemapFiles(project)?.[0]?.xml ?? "";

const routeOf = (project: BlumeProject, path: string) =>
  project.manifest.routes.find((route) => route.path === path);

describe("hidden folder index pages", () => {
  it("stay listed everywhere while their own sidebar row is hidden", async () => {
    const project = await scan(PAGES);

    // The sidebar still drops the index rows, and the group rows link them.
    const guides = project.graph.navigation.sidebar.find(
      (node) => node.kind === "group"
    );
    expect(guides).toMatchObject({ kind: "group", route: "/guides" });
    const children = guides?.kind === "group" ? guides.children : [];
    expect(children.map((node) => [node.kind, node.route])).toStrictEqual([
      ["page", "/guides/setup"],
      ["group", "/guides/install"],
    ]);

    const sitemap = sitemapOf(project);
    expect(sitemap).toContain(`<loc>${SITE}/guides</loc>`);
    expect(sitemap).toContain(`<loc>${SITE}/guides/install</loc>`);
    // A hidden page no group row links stays out, as does the shorthand
    // noindex page, exactly like `seo.noindex`.
    expect(sitemap).not.toContain("/secret");
    expect(sitemap).not.toContain("/internal");
    expect(sitemap).not.toContain("/shorthand");

    expect(routeOf(project, "/guides")).toMatchObject({
      hidden: false,
      indexable: true,
    });
    expect(routeOf(project, "/guides/install")).toMatchObject({
      hidden: false,
      indexable: true,
    });
    for (const path of ["/secret", "/internal", "/internal/notes"]) {
      expect(routeOf(project, path)).toMatchObject({
        hidden: true,
        indexable: false,
      });
    }

    const documents = await buildSearchDocuments(project, {
      includeWhenDisabled: true,
    });
    const searched = documents.map((document) => document.route);
    expect(searched).toContain("/guides");
    expect(searched).toContain("/guides/install");
    expect(searched).not.toContain("/secret");

    const llms = buildLlmsIndex(project);
    expect(llms).toContain(`- [Guides](${SITE}/guides)`);
    expect(llms).toContain(`- [Install](${SITE}/guides/install)`);
    expect(llms).not.toContain("Secret");
    expect(llms).not.toContain("Shorthand");

    const skill = new TextDecoder().decode(buildSiteSkill(project)?.content);
    expect(skill).toContain(`- [Guides](${SITE}/guides.md)`);
    expect(skill).toContain(`- [Install](${SITE}/guides/install.md)`);
    expect(skill).not.toContain("secret");
  });

  it("stay listed when an explicit sidebar group links them as its root", async () => {
    const project = await scan(
      PAGES,
      `, navigation: { sidebar: [{ label: "Guides", root: "/guides", items: ["/guides/setup"] }] }`
    );
    expect(sitemapOf(project)).toContain(`<loc>${SITE}/guides</loc>`);
    // Linked by no group row here, the other hidden index page stays out.
    expect(sitemapOf(project)).not.toContain("/guides/install<");
    expect(routeOf(project, "/guides/install")?.hidden).toBeTruthy();
  });
});

const makePage = (
  route: string,
  meta: Parameters<typeof pageMetaSchema.parse>[0] = {}
): PageRecord => ({
  anchors: [],
  contentType: "doc",
  format: "md",
  groups: [],
  headings: [],
  id: route,
  links: [],
  locale: "",
  meta: pageMetaSchema.parse(meta),
  navPath: route,
  route,
  segments: [],
  source: { name: "filesystem", ref: route },
  title: route,
  translationKey: route,
  version: "",
  versionKey: route,
});

const tree = (sidebar: NavNode[]): Navigation => ({
  featured: [],
  selectors: [],
  sidebar,
  tabs: [],
});

const group = (
  route: string | undefined,
  children: NavNode[] = []
): NavNode => ({
  children,
  display: "group",
  kind: "group",
  label: "Group",
  route,
});

const pageRow = (route: string): NavNode => ({
  kind: "page",
  label: route,
  pageId: route,
  route,
});

const graphOf = (over: Partial<ContentGraph>): ContentGraph => ({
  diagnostics: [],
  navigation: tree([]),
  navigationByLocale: {},
  navigationByVersion: {},
  pages: [],
  routes: new Map(),
  ...over,
});

describe(isHiddenPage, () => {
  const hidden = makePage("/fr/guides", { sidebar: { hidden: true } });

  it("is false for a page that doesn't hide its row", () => {
    expect(isHiddenPage(makePage("/a"), graphOf({}))).toBeFalsy();
  });

  it("is true for a hidden page no group row links", () => {
    // A hidden page an explicit sidebar still lists as a page row is the
    // contradiction BLUME_NAV_HIDDEN_IN_SIDEBAR reports; it stays hidden.
    const graph = graphOf({
      navigation: tree([group(undefined, [pageRow("/fr/guides")])]),
    });
    expect(isHiddenPage(hidden, graph)).toBeTruthy();
  });

  it("reads every locale's and archived version's tree, nested groups included", () => {
    const byLocale = graphOf({
      navigationByLocale: {
        fr: tree([group("/fr", [group("/fr/guides")])]),
      },
    });
    expect(isHiddenPage(hidden, byLocale)).toBeFalsy();
    // Collected once per graph; the second read reuses it.
    expect(isHiddenPage(hidden, byLocale)).toBeFalsy();

    const archived = makePage("/v1/guides", { hidden: true });
    const byVersion = graphOf({
      navigationByVersion: { v1: { "": tree([group("/v1/guides")]) } },
    });
    expect(isHiddenPage(archived, byVersion)).toBeFalsy();
  });

  it("treats a graph with no navigation as linking nothing", () => {
    // SAFETY: a builder under test may hand over a graph with pages alone.
    const bare = { pages: [hidden] } as ContentGraph;
    expect(isHiddenPage(hidden, bare)).toBeTruthy();
  });
});
