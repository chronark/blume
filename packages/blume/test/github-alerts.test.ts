import { describe, expect, it } from "bun:test";

import { mdxToJs } from "satteri";
import type { MdastPluginDefinition } from "satteri";

import { alertDiagnostics } from "../src/core/alert-diagnostics.ts";
import type { SourceEntry } from "../src/core/sources/types.ts";
import { directiveToCalloutPlugin } from "../src/markdown/directives.ts";
import { MDX_BODY_FEATURES } from "../src/markdown/features.ts";
import {
  ALERT_CALLOUTS,
  alertMarkerOf,
  githubAlertsPlugin,
} from "../src/markdown/github-alerts.ts";
import { renderMdx } from "./mdx-render.ts";

// SAFETY: the same visitor-protocol bridge `markdown/index.ts` applies — the
// plugin's minimal node/context shapes narrow Satteri's own.
const asMdastPlugin = (plugin: { name: string }): MdastPluginDefinition =>
  plugin as MdastPluginDefinition;

/** Compile MDX with the callout plugins only, keeping `<Callout>` as JSX. */
const compileJsx = async (source: string): Promise<string> => {
  const { code } = await mdxToJs(source, {
    features: MDX_BODY_FEATURES,
    jsx: true,
    mdastPlugins: [
      asMdastPlugin(directiveToCalloutPlugin()),
      asMdastPlugin(githubAlertsPlugin()),
    ],
  });
  return code;
};

describe("alertMarkerOf", () => {
  it("maps each GitHub alert to its callout, in any case", () => {
    expect(
      ["NOTE", "TIP", "IMPORTANT", "WARNING", "caution"].map(
        (kind) => alertMarkerOf(`[!${kind}]\nBody`)?.callout
      )
    ).toStrictEqual(["note", "tip", "note", "warning", "danger"]);
    expect(alertMarkerOf("[!Tip] Title")).toStrictEqual({
      callout: "tip",
      marker: "[!Tip]",
    });
    expect([...ALERT_CALLOUTS.keys()]).toHaveLength(5);
  });

  it("reads no other marker, and none mid-text", () => {
    expect(alertMarkerOf("[!INFO]\nBody")).toBeUndefined();
    expect(alertMarkerOf("See [!NOTE]")).toBeUndefined();
    expect(alertMarkerOf("[NOTE]")).toBeUndefined();
  });
});

describe("a GitHub alert in .mdx", () => {
  it("renders as the matching callout, its marker gone", async () => {
    const code = await compileJsx(
      "> [!NOTE]\n> Hello **world**.\n\n> [!CAUTION]\n> Careful.\n"
    );
    expect(code).toContain(
      '<Callout type="note"><_components.p>{"Hello "}<_components.strong>{"world"}</_components.strong>{"."}</_components.p></Callout>'
    );
    expect(code).toContain(
      '<Callout type="danger"><_components.p>{"Careful."}</_components.p></Callout>'
    );
    expect(code).not.toContain("[!");
  });

  it("takes text after the marker as the title, formatting kept", async () => {
    const code = await compileJsx(
      "> [!WARNING] Use **this** title\n> Body.\n>\n> More.\n"
    );
    expect(code).toContain(
      '<Callout type="warning" title="Use **this** title"><_components.p>{"Body."}</_components.p><_components.p>{"More."}</_components.p></Callout>'
    );
  });

  it("drops a marker that stands alone in its paragraph", async () => {
    const code = await compileJsx("> [!TIP]\n>\n> Own paragraph.\n");
    expect(code).toContain(
      '<Callout type="tip"><_components.p>{"Own paragraph."}</_components.p></Callout>'
    );
  });

  it("ends the marker line at a hard break", async () => {
    const code = await compileJsx("> [!NOTE] Title  \n> Body.\n");
    expect(code).toContain(
      '<Callout type="note" title="Title"><_components.p>{"Body."}</_components.p></Callout>'
    );
  });

  it("renders a marker alone in a quote as an empty callout", async () => {
    const code = await compileJsx("> [!IMPORTANT]\n");
    expect(code).toContain('<Callout type="note" />');
  });

  it("renders alerts inside lists and callouts", async () => {
    const code = await compileJsx(
      "- Item\n\n  > [!TIP]\n  > In a list.\n\n:::note\n> [!WARNING]\n> In a callout.\n:::\n"
    );
    expect(code).toContain(
      '<Callout type="tip"><_components.p>{"In a list."}</_components.p></Callout>'
    );
    expect(code).toContain(
      '<Callout type="note"><Callout type="warning"><_components.p>{"In a callout."}</_components.p></Callout></Callout>'
    );
  });

  it("leaves other quotes as quotes", async () => {
    const code = await compileJsx(
      [
        "> \\[!NOTE]\n> Escaped.",
        "> [!INFO]\n> Not GitHub's.",
        "> Plain.",
        "> - [!NOTE]",
        "> [!CAUTION]\n> > [!NOTE]\n> > Quoted in an alert.",
      ].join("\n\n")
    );
    expect(code).toContain('{"[!NOTE]\\nEscaped."}');
    expect(code).toContain('{"[!INFO]\\nNot GitHub\'s."}');
    expect(code).toContain('{"Plain."}');
    expect(code).toContain(
      '<Callout type="danger"><_components.blockquote>{"\\n"}<_components.p>{"[!NOTE]\\nQuoted in an alert."}</_components.p>'
    );
  });

  it("renders through Blume's .mdx processor", async () => {
    const { code } = await renderMdx("> [!TIP]\n> Through the pipeline.\n");
    expect(code).toContain("_jsx(Callout, {");
    expect(code).toContain('type: "tip"');
  });
});

/** A `.md` entry with a front matter block, as a filesystem source reads it. */
const mdEntry = (
  body: string,
  format: SourceEntry["body"]["format"] = "md"
): SourceEntry => ({
  body: { format, text: body },
  data: {},
  raw: `---\ntitle: Page\n---\n${body}`,
  ref: `page.${format}`,
  sourcePath: `/docs/page.${format}`,
});

describe("alertDiagnostics", () => {
  it("warns about each alert in an .md page at its line", () => {
    expect(
      alertDiagnostics(
        mdEntry(
          "Intro.\n\n> [!NOTE]\n> Body.\n\n> [!caution] Title\n> Body.\n"
        ),
        "docs"
      )
    ).toStrictEqual([
      {
        code: "BLUME_MD_GITHUB_ALERT",
        file: "/docs/page.md",
        line: 6,
        message:
          "`[!NOTE]` makes a quote a callout only in .mdx; in this .md page it renders as a quote that shows `[!NOTE]` as text.",
        severity: "warning",
        suggestion:
          "Rename the page to .mdx to render it as a `note` callout, or remove `[!NOTE]` to keep a plain quote.",
      },
      {
        code: "BLUME_MD_GITHUB_ALERT",
        file: "/docs/page.md",
        line: 9,
        message:
          "`[!caution]` makes a quote a callout only in .mdx; in this .md page it renders as a quote that shows `[!caution]` as text.",
        severity: "warning",
        suggestion:
          "Rename the page to .mdx to render it as a `danger` callout, or remove `[!caution]` to keep a plain quote.",
      },
    ]);
  });

  it("points an included partial's alert at the partial", () => {
    const entry: SourceEntry = {
      ...mdEntry("Intro.\n"),
      expanded: {
        includes: ["/docs/_partial.md"],
        origins: [
          { file: "/docs/page.md", line: 4 },
          { file: "/docs/_partial.md", line: 2 },
          { file: "/docs/_partial.md", line: 3 },
        ],
        text: "Intro.\n> [!TIP]\n> From a partial.\n",
      },
    };
    const [diagnostic] = alertDiagnostics(entry, "docs");
    expect(diagnostic?.file).toBe("/docs/_partial.md");
    expect(diagnostic?.line).toBe(2);
  });

  it("stays quiet about quotes that aren't alerts, and about .mdx", () => {
    expect(
      alertDiagnostics(
        mdEntry(
          "> \\[!NOTE]\n> Escaped.\n\n> [!INFO]\n> Other.\n\n```md\n> [!NOTE]\n```\n\n> Plain [!NOTE].\n"
        ),
        "docs"
      )
    ).toStrictEqual([]);
    expect(
      alertDiagnostics(mdEntry("> [!NOTE]\n> Body.\n", "mdx"), "docs")
    ).toStrictEqual([]);
    expect(
      alertDiagnostics(mdEntry("No quotes here.\n"), "docs")
    ).toStrictEqual([]);
  });

  it("warns once for an alert quoted inside another", () => {
    const diagnostics = alertDiagnostics(
      mdEntry("> [!CAUTION]\n> > [!NOTE]\n> > Nested.\n"),
      "docs"
    );
    expect(diagnostics.map((d) => d.line)).toStrictEqual([4]);
  });

  it("names a path-less entry by source and ref", () => {
    const [diagnostic] = alertDiagnostics(
      {
        body: { format: "md", text: "> [!NOTE]\n> Body.\n" },
        data: {},
        ref: "page.md",
      },
      "cms"
    );
    expect(diagnostic?.file).toBe("cms:page.md");
    expect(diagnostic?.line).toBe(1);
  });
});
