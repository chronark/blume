import type { ContentGraph, NavNode, PageRecord } from "./types.ts";

/**
 * Hidden pages: `sidebar.hidden` (or the top-level `hidden` shorthand) takes a
 * page out of the navigation, and so out of everything that lists the site's
 * pages for readers, crawlers, and agents — the sitemap, site search,
 * llms.txt, the site skill, the MCP server, and the JSON API.
 *
 * On a folder's index page the flag only drops the page's own row, the
 * duplicate of the group row above it: the group row still links the page,
 * so it is still in the navigation and stays listed everywhere else. Only a
 * group row counts; a hidden page that an explicit sidebar lists as a page
 * row is a contradiction `BLUME_NAV_HIDDEN_IN_SIDEBAR` reports instead.
 */

/** Group-row routes per graph, collected once and read for every page. */
const groupRoutesByGraph = new WeakMap<ContentGraph, ReadonlySet<string>>();

const collectGroupRoutes = (nodes: NavNode[], into: Set<string>): void => {
  for (const node of nodes) {
    if (node.kind === "group") {
      if (node.route) {
        into.add(node.route);
      }
      collectGroupRoutes(node.children, into);
    }
  }
};

/**
 * Every route a sidebar group row links to — a generated folder's index page,
 * or an explicit group's `root` — across the current docs' trees (one per
 * locale under i18n) and every archived version's.
 */
const groupRoutes = (graph: ContentGraph): ReadonlySet<string> => {
  const cached = groupRoutesByGraph.get(graph);
  if (cached) {
    return cached;
  }
  // A graph assembled outside `buildContentGraph` (a builder under test) may
  // carry pages alone; with no trees, no group row links anything.
  const trees = [
    graph.navigation,
    ...Object.values(graph.navigationByLocale ?? {}),
    ...Object.values(graph.navigationByVersion ?? {}).flatMap((byLocale) =>
      Object.values(byLocale)
    ),
  ];
  const routes = new Set<string>();
  for (const tree of trees) {
    collectGroupRoutes(tree?.sidebar ?? [], routes);
  }
  groupRoutesByGraph.set(graph, routes);
  return routes;
};

/** Whether a page is hidden from the navigation (see the module comment). */
export const isHiddenPage = (page: PageRecord, graph: ContentGraph): boolean =>
  page.meta.sidebar.hidden && !groupRoutes(graph).has(page.route);
