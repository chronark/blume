import { describe, expect, it } from "bun:test";

import GithubSlugger from "github-slugger";

import {
  headingSlug,
  joinHeadingText,
  jsxAnchorTarget,
  occupySlug,
  parseHeadingMarkers,
  rawHeadingTag,
} from "../src/core/heading-markers.ts";

describe("occupySlug", () => {
  it("makes a later colliding auto-slug disambiguate", () => {
    const slugger = new GithubSlugger();
    occupySlug(slugger, "setup");
    expect(slugger.slug("Setup")).toBe("setup-1");
  });

  it("leaves an already-taken id untouched", () => {
    const slugger = new GithubSlugger();
    expect(slugger.slug("Setup")).toBe("setup");
    occupySlug(slugger, "setup");
    expect(slugger.slug("Setup")).toBe("setup-1");
  });
});

describe("parseHeadingMarkers", () => {
  it("returns text unchanged when there are no markers", () => {
    expect(parseHeadingMarkers("Getting Started")).toStrictEqual({
      id: undefined,
      text: "Getting Started",
      toc: undefined,
    });
  });

  it("splits a trailing [#id] off and keeps it verbatim", () => {
    expect(parseHeadingMarkers("Getting Started [#setup]")).toStrictEqual({
      id: "setup",
      text: "Getting Started",
      toc: undefined,
    });
  });

  it("accepts the trailing {#id} form used by published specifications", () => {
    expect(parseHeadingMarkers("Record model {#record-model}")).toStrictEqual({
      id: "record-model",
      text: "Record model",
      toc: undefined,
    });
  });

  it("keeps a custom id's casing (never re-slugged)", () => {
    expect(parseHeadingMarkers("Install [#My-Anchor]").id).toBe("My-Anchor");
  });

  it("parses [!toc] as hide and [toc] as only", () => {
    expect(parseHeadingMarkers("Internals [!toc]")).toStrictEqual({
      id: undefined,
      text: "Internals",
      toc: "hide",
    });
    expect(parseHeadingMarkers("Examples [toc]")).toStrictEqual({
      id: undefined,
      text: "Examples",
      toc: "only",
    });
  });

  it("chains markers in any order", () => {
    expect(parseHeadingMarkers("Heading [toc] [#my-id]")).toStrictEqual({
      id: "my-id",
      text: "Heading",
      toc: "only",
    });
    expect(parseHeadingMarkers("Heading [#my-id] [!toc]")).toStrictEqual({
      id: "my-id",
      text: "Heading",
      toc: "hide",
    });
  });

  it("lets the rightmost occurrence of a repeated marker kind win", () => {
    expect(parseHeadingMarkers("Heading [#first] [#second]").id).toBe("second");
    expect(parseHeadingMarkers("Heading [toc] [!toc]").toc).toBe("hide");
  });

  it("matches a marker with no space before it", () => {
    expect(parseHeadingMarkers("Heading[#tight]")).toStrictEqual({
      id: "tight",
      text: "Heading",
      toc: undefined,
    });
  });

  it("reduces a marker-only heading to empty text", () => {
    expect(parseHeadingMarkers("[#only]")).toStrictEqual({
      id: "only",
      text: "",
      toc: undefined,
    });
  });

  it("leaves mid-text brackets alone — only trailing markers count", () => {
    expect(parseHeadingMarkers("The [#id] syntax explained")).toStrictEqual({
      id: undefined,
      text: "The [#id] syntax explained",
      toc: undefined,
    });
    // Literal bracketed prose at the end is not a marker shape.
    expect(parseHeadingMarkers("Options [a, b]").text).toBe("Options [a, b]");
  });

  it("rejects ids containing whitespace or a closing bracket", () => {
    expect(parseHeadingMarkers("Heading [#two words]").id).toBeUndefined();
    expect(parseHeadingMarkers("Heading [#]").id).toBeUndefined();
  });

  it("stops stripping at the first non-marker from the right", () => {
    // `[toc]` is trailing, but the `[#id]` before prose is not — it stays.
    expect(parseHeadingMarkers("A [#id] B [toc]")).toStrictEqual({
      id: undefined,
      text: "A [#id] B",
      toc: "only",
    });
  });
});

describe("headingSlug", () => {
  it("slugs trimmed text, so an edge component leaves no edge dash", () => {
    const slugger = new GithubSlugger();
    // `## Maintainers <Badge/>` and `## ![logo](/l.png) Setup` keep the space
    // beside the node that has no text.
    expect(headingSlug(slugger, "Maintainers ")).toBe("maintainers");
    expect(headingSlug(slugger, " Setup")).toBe("setup");
  });

  it("drops the dashes a stripped trailing symbol leaves", () => {
    const slugger = new GithubSlugger();
    expect(headingSlug(slugger, "Features ✨")).toBe("features");
    expect(headingSlug(slugger, "A { #a }")).toBe("a--a");
    // The stripped slug registers, so a later "Features" disambiguates.
    expect(headingSlug(slugger, "Features")).toBe("features-1");
  });

  it("slugs everything else exactly as github-slugger does", () => {
    const slugger = new GithubSlugger();
    expect(headingSlug(slugger, "--port")).toBe("--port");
    expect(headingSlug(slugger, "The read -- write fallback")).toBe(
      "the-read----write-fallback"
    );
    expect(headingSlug(slugger, "Setup")).toBe("setup");
    expect(headingSlug(slugger, "Setup")).toBe("setup-1");
  });
});

describe("joinHeadingText", () => {
  it("leaves one space where a badge stood between words", () => {
    expect(joinHeadingText(["Install ", null, null, " now"])).toBe(
      "Install now"
    );
    expect(joinHeadingText(["Install", null, " now"])).toBe("Install now");
    expect(joinHeadingText(["Install ", null, "now"])).toBe("Install now");
    expect(joinHeadingText(["Install", null, "now"])).toBe("Installnow");
  });

  it("keeps the edges for the slug to trim", () => {
    expect(joinHeadingText(["Maintainers ", null])).toBe("Maintainers ");
    expect(joinHeadingText([null, " Feature"])).toBe(" Feature");
  });
});

describe("rawHeadingTag", () => {
  it("reads a badge's opening, closing, and self-closing tags", () => {
    expect(rawHeadingTag("<Badge variant='accent'>")).toStrictEqual({
      closing: false,
      kind: "badge",
      selfClosing: false,
    });
    expect(rawHeadingTag("</Badge>")).toStrictEqual({
      closing: true,
      kind: "badge",
      selfClosing: false,
    });
    expect(rawHeadingTag("<Badge />")).toStrictEqual({
      closing: false,
      kind: "badge",
      selfClosing: true,
    });
  });

  it("reads an anchor's id, else its name, quoted or bare", () => {
    expect(rawHeadingTag('<a href="#x" id="x">')).toStrictEqual({
      kind: "anchor-open",
      selfClosing: false,
      target: "x",
    });
    expect(rawHeadingTag("<a name='y' id=z>")).toStrictEqual({
      kind: "anchor-open",
      selfClosing: false,
      target: "z",
    });
    expect(rawHeadingTag('<A NAME="y"/>')).toStrictEqual({
      kind: "anchor-open",
      selfClosing: true,
      target: "y",
    });
    expect(rawHeadingTag('<a href="#x">')).toStrictEqual({
      kind: "anchor-open",
      selfClosing: false,
      target: undefined,
    });
    expect(rawHeadingTag("</a>")).toStrictEqual({ kind: "anchor-close" });
  });

  it("reads any other tag, or a node that is no tag, as other", () => {
    expect(rawHeadingTag("<span>")).toStrictEqual({ kind: "other" });
    expect(rawHeadingTag("<abbr>")).toStrictEqual({ kind: "other" });
    expect(rawHeadingTag("<!-- note -->")).toStrictEqual({ kind: "other" });
  });
});

describe("jsxAnchorTarget", () => {
  it("takes a string id, else a string name", () => {
    expect(
      jsxAnchorTarget([
        { name: "name", type: "mdxJsxAttribute", value: "n" },
        { name: "id", type: "mdxJsxAttribute", value: "i" },
      ])
    ).toBe("i");
    expect(
      jsxAnchorTarget([{ name: "name", type: "mdxJsxAttribute", value: "n" }])
    ).toBe("n");
  });

  it("skips expression and empty values", () => {
    expect(
      jsxAnchorTarget([
        {
          name: "id",
          type: "mdxJsxAttribute",
          value: { type: "mdxJsxAttributeValueExpression", value: "x" },
        },
        { name: "name", type: "mdxJsxAttribute", value: "" },
        { type: "mdxJsxExpressionAttribute" },
      ])
    ).toBeUndefined();
  });
});
