import { describe, expect, it } from "bun:test";

import {
  activeTabForRoute,
  currentTabForRoute,
  directoryEntries,
  directoryGroupForRoute,
  groupStartsOpen,
  isGroupRowCurrent,
  navGroupIds,
  sidebarForRoute,
} from "../src/components/layout/nav-utils.ts";
import type { NavGroup } from "../src/components/layout/nav-utils.ts";
import type { NavNode, NavTab } from "../src/core/types.ts";

const page = (label: string, route: string): NavNode => ({
  kind: "page",
  label,
  pageId: label,
  route,
});

const group = (label: string, path: string, children: NavNode[]): NavNode => ({
  children,
  display: "flat",
  kind: "group",
  label,
  path,
});

/** A page row with a description and an icon, as a directory lists it. */
const described = (
  label: string,
  route: string,
  description: string
): NavNode => ({
  description,
  icon: "book",
  kind: "page",
  label,
  pageId: label,
  route,
});

// A multi-section site: one group per section, each at its own URL path.
const TREE: NavNode[] = [
  group("Adapters", "/adapters", [
    page("S3", "/adapters/s3"),
    page("GCS", "/adapters/gcs"),
  ]),
  group("API", "/api", [page("Files", "/api/files")]),
];

const TABS: NavTab[] = [
  { label: "Adapters", path: "/adapters" },
  { label: "API", path: "/api" },
];

const labels = (nodes: NavNode[]): string[] => nodes.map((node) => node.label);

/** A node's children (a page has none), so tests can walk without asserting. */
const childrenOf = (node: NavNode | undefined): NavNode[] =>
  node?.kind === "group" ? node.children : [];

describe("activeTabForRoute", () => {
  it("uses the root tab as a fallback for child routes", () => {
    const documentation: NavTab = { label: "Documentation", path: "/" };
    const examples: NavTab = { label: "Examples", path: "/examples" };
    const tabs = [documentation, examples];

    expect(activeTabForRoute(tabs, "/guides/services")).toBe(documentation);
  });

  it("prefers the longest matching tab path", () => {
    const documentation: NavTab = { label: "Documentation", path: "/" };
    const examples: NavTab = { label: "Examples", path: "/examples" };
    const tabs = [documentation, examples];

    expect(activeTabForRoute(tabs, "/examples/hello-world")).toBe(examples);
  });

  it("returns null when no tab matches", () => {
    expect(activeTabForRoute(TABS, "/changelog")).toBeNull();
  });
});

describe("currentTabForRoute", () => {
  const documentation: NavTab = { label: "Documentation", path: "/" };
  const examples: NavTab = { label: "Examples", path: "/examples" };
  const tabs = [documentation, examples];

  it("matches like activeTabForRoute in the current docs", () => {
    expect(currentTabForRoute(tabs, "/examples/hello-world", "/")).toBe(
      examples
    );
    // The root tab is genuinely current on an un-tabbed route.
    expect(currentTabForRoute(tabs, "/guides/services", "/")).toBe(
      documentation
    );
    expect(currentTabForRoute(TABS, "/changelog", "/")).toBeNull();
  });

  it("marks no tab current inside an archived version tree", () => {
    // The root tab claims every archived route through its spans-everything
    // fallback, but it links back at the current docs — so neither it nor any
    // section tab is the current page there.
    expect(
      currentTabForRoute(tabs, "/v1.0/examples/hello", "/v1.0")
    ).toBeNull();
    // Same under a basePath: the rebased root tab (`/docs`) is an ancestor of
    // the versionized root (`/docs/v1.0`), not the root itself.
    const based = [
      { label: "Docs", path: "/docs" },
      { label: "API", path: "/docs/api" },
    ];
    expect(
      currentTabForRoute(based, "/docs/v1.0/api/files", "/docs/v1.0")
    ).toBeNull();
  });
});

describe("sidebarForRoute", () => {
  it("scopes to the active tab's section group", () => {
    expect(labels(sidebarForRoute(TREE, TABS, "/adapters/s3"))).toStrictEqual([
      "S3",
      "GCS",
    ]);
    expect(labels(sidebarForRoute(TREE, TABS, "/api/files"))).toStrictEqual([
      "Files",
    ]);
  });

  it("resolves the section even when wrapped in a container group", () => {
    // Content mapped under a /docs prefix nests every section beneath a single
    // top-level "Docs" group — the tab must still resolve to its own section.
    const wrapped: NavNode[] = [
      group("Docs", "/docs", [
        group("Adapters", "/docs/adapters", [page("S3", "/docs/adapters/s3")]),
        group("API", "/docs/api", [page("Files", "/docs/api/files")]),
      ]),
    ];
    const tabs: NavTab[] = [{ label: "Adapters", path: "/docs/adapters" }];
    expect(
      labels(sidebarForRoute(wrapped, tabs, "/docs/adapters/s3"))
    ).toStrictEqual(["S3"]);
  });

  it("preserves sub-groups inside the section (does not over-unwrap)", () => {
    const tree: NavNode[] = [
      group("Guides", "/docs/guides", [
        group("Getting started", "/docs/guides/start", [
          page("Intro", "/docs/guides/start/intro"),
        ]),
      ]),
    ];
    const tabs: NavTab[] = [{ label: "Guides", path: "/docs/guides" }];
    expect(
      labels(sidebarForRoute(tree, tabs, "/docs/guides/start/intro"))
    ).toStrictEqual(["Getting started"]);
  });

  it("picks the longest-prefix tab when sections nest", () => {
    const tree: NavNode[] = [
      group("Docs", "/docs", [
        group("API", "/docs/api", [page("Endpoints", "/docs/api/endpoints")]),
      ]),
    ];
    const tabs: NavTab[] = [
      { label: "Docs", path: "/docs" },
      { label: "API", path: "/docs/api" },
    ];
    expect(
      labels(sidebarForRoute(tree, tabs, "/docs/api/endpoints"))
    ).toStrictEqual(["Endpoints"]);
  });

  it("returns the full sidebar when no tabs are configured", () => {
    expect(labels(sidebarForRoute(TREE, [], "/adapters/s3"))).toStrictEqual([
      "Adapters",
      "API",
    ]);
  });

  it("hides tab-owned groups on a route under no tab, keeping loose content", () => {
    // Root-level pages and a non-tab group ("Help") alongside the section
    // groups. On a non-scoped route the sections (which already have header
    // tabs) drop out; the loose pages and the non-tab group stay.
    const tree: NavNode[] = [
      page("Overview", "/"),
      page("Changelog", "/changelog"),
      group("Help", "/help", [page("FAQ", "/help/faq")]),
      ...TREE,
    ];
    expect(labels(sidebarForRoute(tree, TABS, "/changelog"))).toStrictEqual([
      "Overview",
      "Changelog",
      "Help",
    ]);
  });

  it("hides tab-owned groups for the root tab, keeping loose pages", () => {
    const tabs: NavTab[] = [{ label: "Home", path: "/" }, ...TABS];
    const tree: NavNode[] = [page("Overview", "/"), ...TREE];
    expect(labels(sidebarForRoute(tree, tabs, "/"))).toStrictEqual([
      "Overview",
    ]);
  });

  it("hides a config-style tab section matched by its group route", () => {
    // Config-built groups carry a link `route` instead of a `path`.
    const tree: NavNode[] = [
      page("Home", "/"),
      {
        children: [page("Files", "/api/files")],
        display: "flat",
        kind: "group",
        label: "API",
        route: "/api",
      },
    ];
    const tabs: NavTab[] = [{ label: "API", path: "/api" }];
    expect(labels(sidebarForRoute(tree, tabs, "/"))).toStrictEqual(["Home"]);
  });

  it("drops a container left empty once its sections become tabs", () => {
    // A container that only holds tab sections, next to a loose page. On the
    // root route the sections drop out and the emptied "Reference" heading is
    // dropped too, so it is not stranded above the surviving page.
    const tree: NavNode[] = [
      page("Home", "/"),
      group("Reference", "/reference", [
        group("Adapters", "/reference/adapters", [
          page("S3", "/reference/adapters/s3"),
        ]),
        group("API", "/reference/api", [page("Files", "/reference/api/files")]),
      ]),
    ];
    const tabs: NavTab[] = [
      { label: "Adapters", path: "/reference/adapters" },
      { label: "API", path: "/reference/api" },
    ];
    expect(labels(sidebarForRoute(tree, tabs, "/"))).toStrictEqual(["Home"]);
  });

  it("falls back to the full sidebar when every group is a tab (never blanks)", () => {
    // No loose pages: hiding the sections would blank the sidebar, so the full
    // tree is shown instead.
    const tabs: NavTab[] = [{ label: "Home", path: "/" }, ...TABS];
    expect(labels(sidebarForRoute(TREE, tabs, "/"))).toStrictEqual([
      "Adapters",
      "API",
    ]);
  });

  it("shows an empty sidebar when the matched tab owns no group", () => {
    const tabs: NavTab[] = [{ label: "AI", path: "/ai" }];
    // The route matches the tab, but no group sits at /ai — the section has no
    // sidebar pages, so show nothing rather than leak the other tabs' groups.
    expect(labels(sidebarForRoute(TREE, tabs, "/ai/embed"))).toStrictEqual([]);
  });

  it("does not leak other tabs' sections onto a group-less changelog tab", () => {
    // The changelog is a generated route with its own header tab but no sidebar
    // group (its entries render as a timeline, not sidebar pages). It must not
    // fall through to the full tree — that showed the OpenAPI "API" section.
    const tabs: NavTab[] = [
      ...TABS,
      { label: "Changelog", path: "/changelog" },
    ];
    expect(labels(sidebarForRoute(TREE, tabs, "/changelog"))).toStrictEqual([]);
  });

  it("treats the localized root tab as the root, not a section tab", () => {
    // Under i18n, tab paths arrive localized (`/` -> `/en`) and a root-level
    // `(group)` folder's path is exactly the locale prefix. Comparing the
    // active tab against a bare `/` misread `/en` as a section tab and
    // collapsed the sidebar to that one group (#102).
    const tree: NavNode[] = [
      group("Overview", "/en", [page("Introduction", "/en/introduction")]),
      group("CLI", "/en/cli", [page("Quickstart", "/en/cli/quickstart")]),
      group("Cookbook", "/en/cookbook", [page("Index", "/en/cookbook")]),
    ];
    const tabs: NavTab[] = [
      { label: "Docs", path: "/en" },
      { label: "Cookbook", path: "/en/cookbook" },
    ];
    // Root tab active: full tree minus the tab-owned Cookbook section.
    expect(
      labels(sidebarForRoute(tree, tabs, "/en/introduction", "/en"))
    ).toStrictEqual(["Overview", "CLI"]);
    // Section-tab scoping is unchanged by the localized root.
    expect(
      labels(sidebarForRoute(tree, tabs, "/en/cookbook", "/en"))
    ).toStrictEqual(["Index"]);
  });

  it("treats the based root tab as the root under a basePath", () => {
    // With a basePath, tab paths are rebased (`/` -> `/docs`); the bare-`/`
    // comparison found no group at `/docs` and blanked the sidebar entirely.
    const tree: NavNode[] = [
      page("Home", "/docs"),
      group("API", "/docs/api", [page("Files", "/docs/api/files")]),
    ];
    const tabs: NavTab[] = [
      { label: "Docs", path: "/docs" },
      { label: "API", path: "/docs/api" },
    ];
    expect(labels(sidebarForRoute(tree, tabs, "/docs", "/docs"))).toStrictEqual(
      ["Home"]
    );
  });

  it("keeps the sidebar unscoped inside an archived version tree", () => {
    // A version navigation's root is versionized (`/v1.0`) while tab paths
    // stay in current-docs space, so the root tab must be recognized as the
    // root — not a section tab owning no group here, which blanked the
    // sidebar on every archived page.
    const tree: NavNode[] = [
      page("Introduction", "/v1.0"),
      page("Installation", "/v1.0/installation"),
    ];
    const tabs: NavTab[] = [
      { label: "Docs", path: "/" },
      { label: "API", path: "/api" },
    ];
    expect(
      labels(sidebarForRoute(tree, tabs, "/v1.0/installation", "/v1.0"))
    ).toStrictEqual(["Introduction", "Installation"]);
    // Same under a basePath: rebased tabs (`/docs`) are still ancestors of
    // the versionized root (`/docs/v1.0`).
    const based: NavNode[] = [page("Home", "/docs/v1.0")];
    const basedTabs: NavTab[] = [
      { label: "Docs", path: "/docs" },
      { label: "API", path: "/docs/api" },
    ];
    expect(
      labels(sidebarForRoute(based, basedTabs, "/docs/v1.0", "/docs/v1.0"))
    ).toStrictEqual(["Home"]);
  });

  it("does not prune a group at the root tab's own path inside an archived tree", () => {
    // The root tab must never land in the tab-section prune set, even when its
    // path differs from the versionized root — a slug-flattened `(group)`
    // folder can sit at exactly the unversionized prefix (`/docs`), and
    // pruning it would drop that container from the snapshot's sidebar.
    const tree: NavNode[] = [
      group("Guides", "/docs", [page("Setup", "/docs/v1.0/setup")]),
      page("Home", "/docs/v1.0"),
    ];
    const tabs: NavTab[] = [
      { label: "Docs", path: "/docs" },
      { label: "API", path: "/docs/api" },
    ];
    expect(
      labels(sidebarForRoute(tree, tabs, "/docs/v1.0/setup", "/docs/v1.0"))
    ).toStrictEqual(["Guides", "Home"]);
  });

  it("does not treat a sibling prefix as the section (/adapters vs /adapters-x)", () => {
    const tree: NavNode[] = [
      group("Adapters", "/adapters", [page("S3", "/adapters/s3")]),
      group("AdaptersX", "/adapters-x", [page("Extra", "/adapters-x/extra")]),
    ];
    const tabs: NavTab[] = [{ label: "A", path: "/adapters" }];
    expect(labels(sidebarForRoute(tree, tabs, "/adapters/s3"))).toStrictEqual([
      "S3",
    ]);
  });

  it("keeps the full tree's groups by identity on a route outside every tab", () => {
    // The sidebar's stable group ids (`navGroupIds`) and the build-time
    // subtree cache are both keyed by node identity. Pruning the tab-owned
    // sections must hand back the untouched groups themselves — a copy would
    // resolve to no id, so its deferred fragment was requested by a
    // positional `n.<index>` name that no route serves (#272).
    const help = group("Help", "/help", [page("FAQ", "/help/faq")]);
    const tree: NavNode[] = [page("Overview", "/"), help, ...TREE];
    const ids = navGroupIds(tree);
    const scoped = sidebarForRoute(tree, TABS, "/changelog");
    expect(labels(scoped)).toStrictEqual(["Overview", "Help"]);
    expect(scoped[1]).toBe(help);
    expect(ids.get(help)).toBe("g0");
  });

  it("rebuilds a container pruned of a nested tab section without an id", () => {
    // A container holding a tab section next to loose content is rebuilt
    // without that section, so it is a new object with no stable id — the
    // signal for NavTree to render it in full rather than defer it to a
    // fragment rendered from the full tree (which would put the section
    // back). Its untouched children keep their identity and ids.
    const guides = group("Guides", "/docs/guides", [
      page("Intro", "/docs/guides/intro"),
    ]);
    const docs = group("Docs", "/docs", [
      guides,
      group("API", "/docs/api", [page("Files", "/docs/api/files")]),
    ]);
    const tree: NavNode[] = [page("Overview", "/"), docs];
    const tabs: NavTab[] = [{ label: "API", path: "/docs/api" }];
    const ids = navGroupIds(tree);
    const scoped = sidebarForRoute(tree, tabs, "/");
    expect(labels(scoped)).toStrictEqual(["Overview", "Docs"]);
    const [, rebuilt] = scoped;
    expect(rebuilt).not.toBe(docs);
    expect(ids.has(rebuilt ?? docs)).toBe(false);
    expect(labels(childrenOf(rebuilt))).toStrictEqual(["Guides"]);
    expect(childrenOf(rebuilt)[0]).toBe(guides);
    expect(ids.get(guides)).toBe("g1");
  });

  it("resolves a tab section's groups by identity", () => {
    const ids = navGroupIds(TREE);
    const scoped = sidebarForRoute(TREE, TABS, "/adapters/s3");
    expect(scoped).toBe(childrenOf(TREE[0]));
    expect(ids.size).toBe(2);
  });
});

// A generated group whose folder index page is its row's link.
const routedGroup = (
  children: NavNode[]
): Extract<NavNode, { kind: "group" }> => ({
  children,
  display: "flat",
  kind: "group",
  label: "Configuration",
  path: "/docs/configuration",
  route: "/docs/configuration",
});

/** A `group`-mode disclosure, optionally with its meta's `collapsed`. */
const disclosure = (collapsed?: boolean): NavGroup => ({
  children: [page("Badges", "/flair/badges")],
  collapsed,
  display: "group",
  kind: "group",
  label: "Flair",
});

describe("groupStartsOpen", () => {
  it("opens a group on the current page's path, or forced open", () => {
    expect(groupStartsOpen(disclosure(), true, false)).toBe(true);
    expect(groupStartsOpen(disclosure(true), true, false)).toBe(true);
    expect(groupStartsOpen(disclosure(false), false, false)).toBe(true);
    expect(groupStartsOpen(disclosure(), false, false)).toBe(false);
  });

  it("opens the sidebar's lone top-level group unless it asks to collapse", () => {
    // A wrapper folder around every page: closed, the home page's sidebar
    // would be one row.
    expect(groupStartsOpen(disclosure(), false, true)).toBe(true);
    expect(groupStartsOpen(disclosure(true), false, true)).toBe(false);
  });
});

describe("isGroupRowCurrent", () => {
  it("marks a routed header current when its index row is hidden", () => {
    const node = routedGroup([page("Theming", "/docs/configuration/theming")]);
    expect(isGroupRowCurrent(node, "/docs/configuration")).toBe(true);
  });

  it("leaves the header quiet when a child row shares its route", () => {
    const node = routedGroup([
      page("blume.config.ts", "/docs/configuration"),
      page("Theming", "/docs/configuration/theming"),
    ]);
    expect(isGroupRowCurrent(node, "/docs/configuration")).toBe(false);
  });

  it("only looks at direct child pages, not nested groups", () => {
    const node = routedGroup([
      group("Nested", "/docs/configuration/nested", [
        page("blume.config.ts", "/docs/configuration"),
      ]),
    ]);
    expect(isGroupRowCurrent(node, "/docs/configuration")).toBe(true);
  });

  it("is never current on another route or without a route", () => {
    const node = routedGroup([page("Theming", "/docs/configuration/theming")]);
    expect(isGroupRowCurrent(node, "/docs/configuration/theming")).toBe(false);
    expect(
      isGroupRowCurrent(
        {
          children: [],
          display: "flat",
          kind: "group",
          label: "Content",
          path: "/docs/content",
        },
        "/docs/content"
      )
    ).toBe(false);
  });
});

describe("directory listings", () => {
  const guides: NavGroup = {
    children: [
      described("Overview", "/guides", "Start here"),
      described("Install", "/guides/install", "Get set up"),
      {
        kind: "page",
        label: "GitHub",
        pageId: "",
        route: "https://github.com",
      },
      {
        children: [
          described("Advanced", "/guides/advanced", "Go further"),
          page("Caching", "/guides/advanced/caching"),
        ],
        display: "flat",
        icon: "rocket",
        kind: "group",
        label: "Advanced",
        route: "/guides/advanced",
      },
      {
        children: [page("Retries", "/guides/errors/retries")],
        display: "flat",
        kind: "group",
        label: "Errors",
        route: "/guides/errors",
      },
      {
        children: [page("Batching", "/guides/jobs/batching")],
        display: "flat",
        kind: "group",
        label: "Jobs",
      },
      { children: [], display: "flat", kind: "group", label: "Empty" },
    ],
    directory: "accordion",
    display: "flat",
    kind: "group",
    label: "Guides",
    route: "/guides",
  };

  it("finds the group whose own page lists its pages", () => {
    const tree: NavNode[] = [page("Home", "/"), guides];
    expect(directoryGroupForRoute(tree, "/guides")).toBe(guides);
    expect(directoryGroupForRoute(tree, "/guides/install")).toBeNull();
    expect(directoryGroupForRoute(tree, "/")).toBeNull();
  });

  it("finds a nested group, and skips one set to none or unset", () => {
    const nested: NavNode = {
      children: [],
      directory: "card",
      display: "flat",
      kind: "group",
      label: "Deep",
      route: "/a/deep",
    };
    const tree: NavNode[] = [
      {
        children: [nested],
        directory: "none",
        display: "flat",
        kind: "group",
        label: "A",
        route: "/a",
      },
      group("B", "/b", []),
    ];
    expect(directoryGroupForRoute(tree, "/a")).toBeNull();
    expect(directoryGroupForRoute(tree, "/a/deep")).toBe(nested);
    expect(directoryGroupForRoute(tree, "/b")).toBeNull();
  });

  it("lists the group's pages and subgroups without the page itself", () => {
    const entries = directoryEntries(guides);
    expect(entries).toStrictEqual([
      {
        description: "Get set up",
        href: "/guides/install",
        icon: "book",
        label: "Install",
      },
      {
        description: "Go further",
        href: "/guides/advanced",
        icon: "rocket",
        label: "Advanced",
        pages: [
          { label: "Advanced", route: "/guides/advanced" },
          { label: "Caching", route: "/guides/advanced/caching" },
        ],
      },
      {
        description: undefined,
        href: "/guides/errors",
        icon: undefined,
        label: "Errors",
        pages: [
          { label: "Errors", route: "/guides/errors" },
          { label: "Retries", route: "/guides/errors/retries" },
        ],
      },
      {
        description: undefined,
        href: "/guides/jobs/batching",
        icon: undefined,
        label: "Jobs",
        pages: [{ label: "Batching", route: "/guides/jobs/batching" }],
      },
    ]);
  });
});
