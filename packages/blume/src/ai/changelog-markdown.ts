import { mountBasePath, normalizeBasePath } from "../core/base-path.ts";
import { withChangelogIndexText } from "../core/changelog-index.ts";
import {
  compareChangelogDates,
  groupChangelogYears,
  parseChangelogDate,
} from "../core/changelog-list.ts";
import { EN_UI, resolveUIStrings } from "../core/i18n-ui.ts";
import type { BlumeProject } from "../core/project-graph.ts";
import { absoluteUrl } from "../core/site-url.ts";
import type { PageRecord } from "../core/types.ts";

/**
 * The generated `/changelog` index as Markdown, for its `/changelog.md`
 * mirror and MCP `get_page`: the timeline an agent would otherwise have to
 * scrape out of the rendered page. Lists what the index page lists — every
 * visible changelog entry of the current docs in the default locale, newest
 * first, grouped by year — one line each, with its date and category and a
 * link to the entry's own page.
 */

interface IndexRow {
  date: Date | null;
  page: PageRecord;
}

/** A row's link: absolute under a configured site, like llms.txt. */
const entryUrl = (project: BlumeProject, route: string): string => {
  const { base, site } = project.config.deployment.options;
  const path = mountBasePath(normalizeBasePath(base), route);
  return encodeURI(site ? absoluteUrl(site, path) : path);
};

const rowLine = (project: BlumeProject, { date, page }: IndexRow): string => {
  const details = [
    date ? date.toISOString().slice(0, 10) : "",
    page.meta.changelog?.category ?? "",
  ].filter(Boolean);
  const title = page.title.replaceAll(/[[\]]/gu, String.raw`\$&`);
  const tail = details.length > 0 ? ` — ${details.join(", ")}` : "";
  return `- [${title}](${entryUrl(project, page.route)})${tail}`;
};

/**
 * The release list alone, as year headings over linked rows — what
 * `<Changelog />` renders, in Markdown. Split out of the document below so the
 * component's serializer publishes exactly the list the generated page's
 * mirror does: an authored `/changelog` page brings its own heading and prose,
 * and only the list comes from here.
 *
 * Entries are the default locale's, as everywhere else this list is published
 * — see `components/content/Changelog.astro` for why the rule is the same on
 * the rendered page.
 */
export const changelogIndexBlocks = (project: BlumeProject): string[] => {
  const { i18n } = project.config;
  const rows: IndexRow[] = project.graph.pages
    .filter(
      (page) =>
        page.contentType === "changelog" &&
        !page.meta.draft &&
        !page.meta.sidebar.hidden &&
        !page.fallback &&
        page.version === "" &&
        (!i18n || page.locale === i18n.defaultLocale)
    )
    .map((page) => ({
      date: parseChangelogDate(page.meta.date ?? page.meta.changelog?.date),
      page,
    }))
    .toSorted((a, b) => compareChangelogDates(a.date, b.date));

  // Undated entries sort last, under a heading of their own.
  return groupChangelogYears(rows, (row) =>
    row.date ? String(row.date.getUTCFullYear()) : null
  ).flatMap((group) => [
    `## ${group.year ?? "Undated"}`,
    group.items.map((row) => rowLine(project, row)).join("\n"),
  ]);
};

export const buildChangelogIndexMarkdown = (project: BlumeProject): string => {
  const { i18n } = project.config;
  const ui = withChangelogIndexText(
    project.config,
    i18n
      ? resolveUIStrings(i18n.defaultLocale, {
          defaultLocale: i18n.defaultLocale,
          overrides: i18n.ui,
        })
      : EN_UI,
    i18n?.defaultLocale
  );
  const blocks = [
    `# ${ui.changelog.title}`,
    ui.changelog.description,
    ...changelogIndexBlocks(project),
  ];
  return `${blocks.join("\n\n")}\n`;
};
