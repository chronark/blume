import { describe, expect, it } from "bun:test";

import { codeBlockHtml } from "../src/components/content/code-block.ts";

describe("codeBlockHtml", () => {
  it("highlights the code prop, trailing newlines trimmed", async () => {
    const html = await codeBlockHtml({
      code: "const x = 1;\n\n",
      lang: "ts",
      title: "x.ts",
    });
    expect(html).toContain("astro-code");
    expect(html).toContain('data-title="x.ts"');
    expect(html).not.toContain("\n</code>");
  });

  it("highlights as plain text without a lang", async () => {
    expect(await codeBlockHtml({ code: "plain" })).toContain("plain");
  });

  it("has nothing to highlight without code, so the children render", async () => {
    expect(await codeBlockHtml({ title: "example.ts" })).toBeNull();
  });
});
