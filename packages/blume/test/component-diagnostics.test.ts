import { describe, expect, it } from "bun:test";

import {
  missingExampleDiagnostics,
  unknownPropDiagnostics,
  validateUsedComponents,
} from "../src/core/component-diagnostics.ts";
import {
  extractComponentTags,
  extractExampleUses,
} from "../src/core/sources/normalize.ts";
import type { PageRecord } from "../src/core/types.ts";

const page = (over: Partial<PageRecord>): PageRecord =>
  // SAFETY: the validators under test read only the fields a fixture sets
  // (id, route, and the overrides); the remaining PageRecord fields go unread.
  ({ id: "p", route: "/p", ...over }) as PageRecord;

describe("extractComponentTags", () => {
  it("finds capitalized JSX tags and the base of a member tag", () => {
    expect(
      extractComponentTags("<Callout>hi</Callout>\n<Tree.File />").toSorted()
    ).toEqual(["Callout", "Tree"]);
  });

  it("ignores lowercase tags, fenced/inline code, and double-quoted text", () => {
    const body = [
      "<div>not a component</div>",
      "```tsx",
      "<InCode />",
      "```",
      "inline `<AlsoCode />` here",
      'a note "<InQuotes /> integration"',
    ].join("\n");
    expect(extractComponentTags(body)).toEqual([]);
  });

  it("ignores tags inside tilde-fenced code", () => {
    const body = ["~~~tsx", "<InTildeFence />", "~~~", "<Real />"].join("\n");
    expect(extractComponentTags(body)).toEqual(["Real"]);
  });

  it("ignores a backslash-escaped `<`, which renders as text", () => {
    // MDX reads `\<App>` as the text `<App>`: an odd run of backslashes
    // escapes the `<`, while an even run is escaped backslashes before a
    // real tag. `&lt;` is an entity, never a tag either.
    const body = [
      String.raw`\<Escaped> at the start of a line`,
      String.raw`Returns Promise\<App>, \<Not set>, or \<TPayload>.`,
      String.raw`An odd run \\\<OddRun> stays text.`,
      "An entity &lt;Entity> is text.",
      String.raw`An even run \\<EvenRun /> is a real tag.`,
      String.raw`Mixed \<Text> then <Unknown /> on one line.`,
    ].join("\n");
    expect(extractComponentTags(body).toSorted()).toEqual([
      "EvenRun",
      "Unknown",
    ]);
  });
});

describe("validateUsedComponents", () => {
  it("warns on an unknown tag, allowing built-ins and known extras", () => {
    const result = validateUsedComponents(
      [page({ componentsUsed: ["Callout", "Counter", "Bogus"] })],
      new Set(["Counter"]),
      new Set()
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("BLUME_UNKNOWN_COMPONENT");
    expect(result[0]?.message).toContain("Bogus");
  });

  it("suggests `blume add` when the tag matches a registry item", () => {
    // A layout registry item (`Pagination`) isn't a globally-available built-in.
    const result = validateUsedComponents(
      [page({ componentsUsed: ["Pagination"] })],
      new Set(),
      new Set(["pagination"])
    );
    expect(result[0]?.suggestion).toContain("blume add pagination");
  });

  it("warns once for a tag used across pages, naming every page", () => {
    const result = validateUsedComponents(
      [
        page({
          componentsUsed: ["Bogus"],
          route: "/a",
          sourcePath: "/d/a.mdx",
        }),
        page({ componentsUsed: ["Bogus"], route: "/b" }),
        page({ componentsUsed: ["Callout"], route: "/c" }),
        page({ componentsUsed: ["Bogus"], route: "/d" }),
      ],
      new Set(),
      new Set()
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe(
      "<Bogus> is used on 3 pages but isn't a known component: /a, /b, and /d."
    );
    expect(result[0]?.file).toBe("/d/a.mdx");
  });

  it("names the one page that uses a tag", () => {
    const [diagnostic] = validateUsedComponents(
      [page({ componentsUsed: ["Bogus"], route: "/a" })],
      new Set(),
      new Set()
    );
    expect(diagnostic?.message).toBe(
      "<Bogus> is used in /a but isn't a known component."
    );
    expect(diagnostic?.file).toBe("p");
  });
});

describe("extractExampleUses", () => {
  it("reads each literal <Component path>, wrapped or not, outside code", () => {
    const body = [
      'Intro <Component path="counter" /> and',
      "<Component",
      "  title='x'",
      "  path='forms/login'",
      "/>",
      "<Component path={dynamic} />",
      '`<Component path="inline" />`',
      "```mdx",
      '<Component path="fenced" />',
      "```",
      '<ComponentGroup path="other" />',
    ].join("\n");
    expect(extractExampleUses(body, 3)).toStrictEqual([
      { column: 24, line: 4, path: "counter" },
      { column: 9, line: 7, path: "forms/login" },
    ]);
  });

  it("skips an escaped \\<Component path>, which renders as text", () => {
    const body = [
      String.raw`Write \<Component path="escaped" /> to embed one.`,
      String.raw`\\<Component path="after-backslash" />`,
    ].join("\n");
    expect(extractExampleUses(body)).toStrictEqual([
      { column: 20, line: 2, path: "after-backslash" },
    ]);
  });

  it("finds nothing in a body with no <Component>", () => {
    expect(extractExampleUses("# Hi\n\n<Card />\n")).toStrictEqual([]);
  });
});

describe("missingExampleDiagnostics", () => {
  it("warns once for each <Component path> that names no example", () => {
    const uses = [
      { column: 18, line: 6, path: "counter" },
      { column: 18, line: 8, path: "forms/missing" },
    ];
    const result = missingExampleDiagnostics(
      [
        page({
          examplesUsed: uses,
          route: "/a",
          sourcePath: "/site/docs/a.mdx",
        }),
        // A file shared by every locale renders once per locale.
        page({
          examplesUsed: uses,
          route: "/fr/a",
          sourcePath: "/site/docs/a.mdx",
        }),
        // One an `<include>` brought in reports against the partial.
        page({
          examplesUsed: [
            { column: 5, file: "/site/docs/_part.mdx", line: 2, path: "gone" },
          ],
          route: "/b",
        }),
      ],
      { dir: "/site/examples", examples: [{ path: "counter" }] },
      "/site",
      new Set(["Counter"])
    );
    expect(
      result.map((diagnostic) => [
        diagnostic.code,
        diagnostic.file,
        diagnostic.line,
        diagnostic.column,
        diagnostic.message,
      ])
    ).toStrictEqual([
      [
        "BLUME_EXAMPLE_NOT_FOUND",
        "/site/docs/a.mdx",
        8,
        18,
        '<Component path="forms/missing"> in /a names no example, so the page shows "No example found" in its place.',
      ],
      [
        "BLUME_EXAMPLE_NOT_FOUND",
        "/site/docs/_part.mdx",
        2,
        5,
        '<Component path="gone"> in /b names no example, so the page shows "No example found" in its place.',
      ],
    ]);
    expect(result[0]?.suggestion).toBe(
      "Fix the path, or add the example under examples/: `path` is its location there, without the extension."
    );
  });

  it("checks nothing when the project replaces <Component>", () => {
    const result = missingExampleDiagnostics(
      [page({ examplesUsed: [{ column: 1, line: 1, path: "anything" }] })],
      { dir: "/site/examples", examples: [] },
      "/site",
      new Set(["Component"])
    );
    expect(result).toStrictEqual([]);
  });
});

describe("unknownPropDiagnostics", () => {
  it("warns about a childless built-in given props it doesn't take", () => {
    const result = unknownPropDiagnostics(
      [
        page({
          route: "/a",
          sourcePath: "/site/docs/a.mdx",
          unknownProps: [
            {
              column: 1,
              kind: "prop",
              line: 7,
              props: ["type", "text"],
              tag: "Badge",
            },
            {
              column: 3,
              file: "/site/docs/_part.mdx",
              kind: "prop",
              line: 2,
              props: ["wide"],
              tag: "Column",
            },
          ],
        }),
      ],
      new Set()
    );
    expect(result).toStrictEqual([
      {
        code: "BLUME_UNKNOWN_PROP",
        column: 1,
        file: "/site/docs/a.mdx",
        line: 7,
        message:
          "<Badge> in /a has no children, and Badge doesn't take `type` or `text`, so it renders without what those props meant to show.",
        severity: "warning",
        suggestion:
          "Put the content between the tags (<Badge>…</Badge>), and use the props Badge takes: `class`, `className`, `color`, `disabled`, `icon`, `shape`, `size`, `stroke`, `tooltip`, and `variant`.",
      },
      {
        code: "BLUME_UNKNOWN_PROP",
        column: 3,
        file: "/site/docs/_part.mdx",
        line: 2,
        message:
          "<Column> in /a has no children, and Column doesn't take `wide`, so it renders without what that prop meant to show.",
        severity: "warning",
        suggestion:
          "Put the content between the tags (<Column>…</Column>); Column takes no props.",
      },
    ]);
  });

  it("skips a component the project replaces, and reports a shared file once", () => {
    const use = {
      column: 1,
      kind: "prop" as const,
      line: 1,
      props: ["text"],
      tag: "Badge",
    };
    const pages = [
      page({ id: "a", route: "/a", unknownProps: [use] }),
      page({ id: "a", route: "/fr/a", unknownProps: [use] }),
    ];
    expect(unknownPropDiagnostics(pages, new Set())).toHaveLength(1);
    expect(unknownPropDiagnostics(pages, new Set(["Badge"]))).toStrictEqual([]);
  });
});
