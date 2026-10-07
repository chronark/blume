import { describe, expect, it } from "bun:test";

import type { ApiOperationRef, ApiSpecData } from "../src/openapi/model.ts";
import { operationMdx, overviewMdx } from "../src/openapi/render-mdx.ts";

/**
 * A spec description's headings sit under the page's own title, the page's
 * only `<h1>`: `#` in the API's or an operation's description becomes `##`,
 * and in a tag's, which sits under that tag's `##` section, `###`.
 */

const operation: ApiOperationRef = {
  deprecated: false,
  description: "",
  key: "list-pets",
  method: "get",
  path: "/pets",
  route: "/api/pets/list-pets",
  summary: "List pets",
  tag: "Pets",
  tagSlug: "pets",
};

const spec = (over: Partial<ApiSpecData>): ApiSpecData => ({
  codeSamples: [],
  description: "",
  // SAFETY: the MDX lowering never reads the document.
  document: {} as ApiSpecData["document"],
  expandSchemas: false,
  kind: "openapi",
  label: "API",
  operations: { [operation.key]: operation },
  playground: { enabled: false, proxy: false },
  route: "/api",
  slug: "api",
  tags: [],
  title: "API",
  version: "1",
  ...over,
});

describe("description headings", () => {
  it("demotes the API description's headings under the page title", () => {
    const { body } = overviewMdx(
      spec({
        description: [
          "# Introduction",
          "",
          "The API.",
          "",
          "## Errors ##",
          "",
          "###### Deepest",
          "",
          "Setext",
          "======",
          "",
          "> # Quoted",
          "",
          "```md",
          "# Not a heading",
          "```",
          "",
          "<div>",
          "# {Braced}",
          "</div>",
        ].join("\n"),
      })
    );
    expect(body.split("\n<ApiOverview")[0]).toBe(
      [
        "## Introduction",
        "",
        "The API.",
        "",
        "### Errors",
        "",
        "###### Deepest",
        "",
        "## Setext",
        "",
        "> ## Quoted",
        "",
        "```md",
        "# Not a heading",
        "```",
        "",
        "&lt;div>",
        "## &#123;Braced&#125;",
        "&lt;/div>",
        "",
      ].join("\n")
    );
  });

  it("joins a multi-line setext heading into one ATX line", () => {
    const { body } = operationMdx(spec({}), {
      ...operation,
      description: "Two\nlines\n---\n\nText.",
    });
    expect(body).toStartWith("### Two lines\n\nText.");
  });

  it("puts a tag description's headings under its section", () => {
    const { body } = overviewMdx(
      spec({
        tags: [
          {
            description: "# About pets\n\nAll of them.",
            name: "Pets",
            slug: "pets",
          },
        ],
      })
    );
    expect(body).toContain("## Pets\n\n### About pets\n\nAll of them.");
  });
});
