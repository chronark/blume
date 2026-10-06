import type { Nodes, Paragraph } from "mdast";
import { mdxToMdast } from "satteri";

import {
  CALLOUT_ALIASES,
  CALLOUT_TYPES,
  calloutTypeFor,
} from "../markdown/directives.ts";
import { MDX_BODY_FEATURES } from "../markdown/features.ts";
import { strippedLineOffset } from "./sources/normalize.ts";
import type { SourceEntry } from "./sources/types.ts";
import type { Diagnostic } from "./types.ts";

type ContainerDirective = Extract<Nodes, { type: "containerDirective" }>;

// A line that may open a container directive: a colon fence and a name, after
// any quote or list indentation.
const CONTAINER_OPENING = /^[\t >]*:{3,}(?<name>[a-z][\w-]*)/gimu;

// A colon fence followed by text that opens no directive: text after a space
// (`::: card`), or a character no name starts with (`:::{.x}`). Such a line
// either closes a container and loses its text, or is a spaced opener.
const FENCE_WITH_TEXT = /^[\t >]*:{3,}(?:[\t ]+\S|[^\s:a-z])/imu;

// A container's closing line: the colon fence and whatever follows it.
const CLOSING_LINE =
  /^[\t >]*(?<written>(?<fence>:{3,})[\t ]*(?<text>.*?))\s*$/u;

// A markdown-it style opener, `::: tip Title`, which is no directive at all.
const SPACED_OPENING =
  /^[\t >]*(?<written>(?<fence>:{3,})[\t ]+(?<name>[a-z][\w-]*)(?<title>.*?))\s*$/iu;

const codeList = (names: Iterable<string>): string =>
  [...names].map((name) => `\`${name}\``).join(", ");

const CALLOUT_NAMES = `${codeList(CALLOUT_TYPES)} (or the aliases ${codeList(Object.keys(CALLOUT_ALIASES))})`;

/** A directive problem at a line of the parsed text, before it's placed in a file. */
interface Finding {
  code: string;
  line: number;
  message: string;
  suggestion: string;
}

const unknownContainer = (node: ContainerDirective): Finding[] =>
  calloutTypeFor(node.name) === null
    ? [
        {
          code: "BLUME_UNKNOWN_DIRECTIVE",
          line: node.position?.start.line ?? 1,
          message: `\`:::${node.name}\` isn't a callout type, so the page shows its \`:::\` lines as written around its content.`,
          suggestion: `Use a callout type — ${CALLOUT_NAMES} — or remove the \`:::\` lines to keep the content as plain prose.`,
        },
      ]
    : [];

/**
 * Text after the colons of a container's closing fence. Sätteri closes a
 * container on any line that starts with at least its fence's colons and
 * drops the rest of that line (micromark's directive grammar, which
 * `remark-directive` uses, keeps such a line as content), so a `::: card`
 * inside a `:::warning` ends the callout early and `card` never reaches the
 * page. A container left unclosed ends with its content rather than on a
 * fence line of its own.
 */
const closingText = (
  node: ContainerDirective,
  lines: readonly string[]
): Finding[] => {
  const start = node.position?.start.line ?? 1;
  const end = node.position?.end.line ?? start;
  const content = node.children.at(-1)?.position?.end.line ?? start;
  const groups =
    end > content ? CLOSING_LINE.exec(lines[end - 1] ?? "")?.groups : undefined;
  if (!(groups?.text && groups.fence && groups.written)) {
    return [];
  }
  const longer = ":".repeat(groups.fence.length + 1);
  return [
    {
      code: "BLUME_DIRECTIVE_CLOSING_TEXT",
      line: end,
      message: `\`${groups.written}\` closes the \`:::${node.name}\` container above it, so \`${groups.text}\` never reaches the page.`,
      suggestion: `Give the container a longer fence than this line's — \`${longer}${node.name}\`, closed by \`${longer}\` — to keep the line inside it as text, or remove \`${groups.text}\` from the line.`,
    },
  ];
};

/**
 * Callout openers written with a space after the colons (`::: tip`, the
 * markdown-it spelling VitePress, VuePress, and Docusaurus v2 use). That is
 * never a directive, so the line and its whole block render as plain text.
 * Only paragraph lines count, so an example in a code block stays quiet.
 */
const spacedOpenings = (
  node: Paragraph,
  lines: readonly string[]
): Finding[] => {
  const start = node.position?.start.line ?? 1;
  const end = node.position?.end.line ?? start;
  return lines.slice(start - 1, end).flatMap((text, index) => {
    const groups = SPACED_OPENING.exec(text)?.groups;
    if (
      !(groups?.fence && groups.name && groups.written) ||
      calloutTypeFor(groups.name) === null
    ) {
      return [];
    }
    const opener = `${groups.fence}${groups.name}`;
    const title = groups.title?.trim();
    return [
      {
        code: "BLUME_DIRECTIVE_SPACED_NAME",
        line: start + index,
        message: `\`${groups.written}\` has a space between its colons and its name, so it isn't a callout and the page shows it as text.`,
        suggestion: title
          ? `Remove the space and put the title in brackets: \`${opener}[${title}]\`.`
          : `Remove the space: \`${opener}\`.`,
      },
    ];
  });
};

/**
 * The directive problems in an `.mdx` body, in source order. The body is
 * parsed as the renderer reads it, so a fence in a code block never counts. A
 * page is parsed only when a line looks like one of these problems, so pages
 * without one cost a scan. A body MDX can't parse fails to render anyway, with
 * its own error.
 */
const directiveFindings = (text: string): Finding[] => {
  const suspect =
    FENCE_WITH_TEXT.test(text) ||
    [...text.matchAll(CONTAINER_OPENING)].some(
      (match) => calloutTypeFor(match.groups?.name ?? "") === null
    );
  if (!suspect) {
    return [];
  }
  let tree: Nodes;
  try {
    tree = mdxToMdast(text, { features: MDX_BODY_FEATURES });
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const found: Finding[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "containerDirective") {
      found.push(...unknownContainer(node), ...closingText(node, lines));
    } else if (node.type === "paragraph") {
      found.push(...spacedOpenings(node, lines));
    }
    if ("children" in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };
  walk(tree);
  return found.toSorted((a, b) => a.line - b.line);
};

/**
 * Warn about the `:::` directives in an `.mdx` entry that don't render as
 * their author meant:
 *
 * - `BLUME_UNKNOWN_DIRECTIVE`: a `:::name` container that isn't a callout.
 *   The page keeps its content — the body renders between the literal `:::`
 *   lines (see `markdown/directives.ts`) — but a typo like `:::warnig`, or a
 *   `:::details` carried over from another docs tool, should read as the
 *   mistake it is rather than as a finished page.
 * - `BLUME_DIRECTIVE_CLOSING_TEXT`: a closing fence with text after it, which
 *   the page drops (`::: card` inside a `:::warning`).
 * - `BLUME_DIRECTIVE_SPACED_NAME`: a spaced callout opener (`::: tip`), which
 *   the page shows as text.
 *
 * Lines point into the file the author wrote, a partial's own file for a
 * directive an `<include>` brought in.
 */
export const directiveDiagnostics = (
  entry: SourceEntry,
  sourceName: string
): Diagnostic[] => {
  if (entry.body.format !== "mdx") {
    return [];
  }
  const page = entry.sourcePath ?? `${sourceName}:${entry.ref}`;
  const offset =
    entry.bodyLineOffset ?? strippedLineOffset(entry.raw, entry.body.text);
  return directiveFindings(entry.expanded?.text ?? entry.body.text).map(
    ({ line, ...finding }) => {
      const origin = entry.expanded?.origins[line - 1];
      return {
        ...finding,
        file: origin?.file ?? page,
        line: origin?.line ?? line + offset,
        severity: "warning",
      };
    }
  );
};
