import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { languageLabel } from "../src/components/code-language.ts";

const component = (path: string): Promise<string> =>
  readFile(new URL(`../src/components/${path}`, import.meta.url), {
    encoding: "utf-8",
  });

describe(languageLabel, () => {
  it("names a language by its id or an alias, in any case", () => {
    expect(languageLabel("ts")).toBe("TypeScript");
    expect(languageLabel("typescript")).toBe("TypeScript");
    expect(languageLabel("python")).toBe("Python");
    expect(languageLabel("JSON")).toBe("JSON");
    expect(languageLabel("plaintext")).toBe("Text");
  });

  it("shows a language it has no name for as written", () => {
    expect(languageLabel("zig")).toBe("zig");
    // An inherited object key is no language.
    expect(languageLabel("constructor")).toBe("constructor");
  });
});

describe("code block labels", () => {
  it("labels an untitled CodeGroup tab by its block's language", async () => {
    // `<Tabs>` builds its strip in an inline client script (no DOM in this
    // suite), so pin the fallback order: a title, then a code block's
    // language, then the numbered `Tab {n}`.
    const tabs = await component("content/Tabs.astro");
    expect(tabs).toContain(
      'import { languageLabel } from "../code-language.ts";'
    );
    expect(tabs).toContain(
      "panel.dataset.title ??\n    codeLanguage(panel) ??"
    );
    expect(tabs).toContain(
      "(panel.dataset.blumeLanguage ?? panel.dataset.language)"
    );
  });

  it("gives a block's header the same label", async () => {
    const layout = await component("layout/RootLayout.astro");
    expect(layout).toContain(
      'pre.setAttribute("data-language", languageLabel(language));'
    );
  });
});
