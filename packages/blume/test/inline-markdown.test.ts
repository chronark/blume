import { describe, expect, it } from "bun:test";

import {
  renderInlineMarkdown,
  renderInlineTitle,
  unwrapParagraph,
} from "../src/components/content/inline-markdown.ts";

describe("renderInlineMarkdown", () => {
  it("shows raw HTML as text but leaves entities authorable", async () => {
    expect(await renderInlineMarkdown("<b>bold</b> *em*")).toBe(
      "&lt;b&gt;bold&lt;/b&gt; <em>em</em>"
    );
    expect(await renderInlineMarkdown("x <img src=y onerror=alert(1)>")).toBe(
      "x &lt;img src=y onerror=alert(1)&gt;"
    );
    // A block of raw HTML (and a comment) is text too, not markup.
    expect(await renderInlineMarkdown("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(await renderInlineMarkdown("<!-- note --> after")).toBe(
      "&lt;!-- note --&gt; after"
    );
    // CommonMark resolves entities itself, so `&copy;` keeps rendering as ©
    // instead of the literal text `&copy;`.
    expect(await renderInlineMarkdown("a &copy; b")).toBe("a © b");
  });

  it("keeps angle brackets in code spans and autolinks intact", async () => {
    expect(
      await renderInlineMarkdown("Use `Array<string>` and ``a ` <b>``")
    ).toBe(
      "Use <code>Array&lt;string&gt;</code> and <code>a ` &lt;b&gt;</code>"
    );
    expect(await renderInlineMarkdown("See <https://x.dev/a?b=1&c=2>")).toBe(
      'See <a href="https://x.dev/a?b=1&amp;c=2">https://x.dev/a?b=1&amp;c=2</a>'
    );
    expect(await renderInlineMarkdown("Mail <team@x.dev>")).toBe(
      'Mail <a href="mailto:team@x.dev">team@x.dev</a>'
    );
  });
});

describe("renderInlineTitle", () => {
  it("renders a title's inline Markdown, raw HTML as text", async () => {
    expect(await renderInlineTitle("Use **bold** and `code`")).toBe(
      "Use <strong>bold</strong> and <code>code</code>"
    );
    expect(await renderInlineTitle("The `x` option, [docs](/x)")).toBe(
      'The <code>x</code> option, <a href="/x">docs</a>'
    );
    expect(await renderInlineTitle("`a` and <b>b</b>")).toBe(
      "<code>a</code> and &lt;b&gt;b&lt;/b&gt;"
    );
  });

  it("reads back the Markdown a callout label is written as", async () => {
    expect(
      await renderInlineTitle(
        "*em* ~~gone~~ ``a`b`` [docs](</a b%3Cc%3E>) snake\\_case \\*star\\* \\[x\\]"
      )
    ).toBe(
      '<em>em</em> <del>gone</del> <code>a`b</code> <a href="/a%20b%3Cc%3E">docs</a> snake_case *star* [x]'
    );
  });

  it("leaves a title with no inline syntax as written", async () => {
    // No smart quotes or entity decoding: the component prints it as is.
    expect(
      await renderInlineTitle(`Don't "quote" Tom & Jerry`)
    ).toBeUndefined();
  });

  it("leaves a title that renders as more than one line as written", async () => {
    expect(await renderInlineTitle("1. Install `blume`")).toBeUndefined();
    expect(await renderInlineTitle("- `item`")).toBeUndefined();
  });
});

describe("unwrapParagraph", () => {
  it("unwraps a single rendered paragraph", () => {
    expect(unwrapParagraph("<p>hi <em>there</em></p>")).toBe(
      "hi <em>there</em>"
    );
    expect(unwrapParagraph("  <p>trimmed</p>\n")).toBe("trimmed");
  });

  it("leaves multi-paragraph and non-paragraph HTML balanced", () => {
    const multi = "<p>a</p>\n<p>b</p>";
    expect(unwrapParagraph(multi)).toBe(multi);
    expect(unwrapParagraph("<ul><li>x</li></ul>")).toBe("<ul><li>x</li></ul>");
  });
});
