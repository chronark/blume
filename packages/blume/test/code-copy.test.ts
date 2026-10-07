import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { copyableCode } from "../src/components/code-copy.ts";

const lines = (...text: string[]): string => text.join("\n");

describe(copyableCode, () => {
  it("copies a block in any other language as shown", () => {
    const text = lines("$ npm i blume", "added 1 package");
    expect(copyableCode(text, "bash")).toBe(text);
    expect(copyableCode(text)).toBe(text);
  });

  it("copies a session's commands without prompts or output", () => {
    expect(
      copyableCode(
        lines(
          "$ npm i blume",
          "added 1 package in 2s",
          "",
          "$ npx blume dev",
          "> my-docs@1.0.0 dev",
          "Local http://localhost:4321"
        ),
        "console"
      )
    ).toBe(lines("npm i blume", "npx blume dev"));
  });

  it("reads the prompt spellings Shiki highlights", () => {
    expect(
      copyableCode(
        lines(
          "(venv) $ pip install uv",
          "user@host:~/site$ ls",
          "[user@host site]% make",
          "# apt install git",
          "❯ git status",
          "➜ git push"
        ),
        "shellsession"
      )
    ).toBe(
      lines(
        "pip install uv",
        "ls",
        "make",
        "apt install git",
        "git status",
        "git push"
      )
    );
  });

  it("keeps a command's continuation lines, dropping their > prompt", () => {
    expect(
      copyableCode(
        lines(
          "$ docker run \\",
          ">   --rm \\",
          "    hello-world",
          "Hello from Docker!"
        ),
        "Console"
      )
    ).toBe(lines("docker run \\", "  --rm \\", "    hello-world"));
  });

  it("skips an empty prompt", () => {
    expect(copyableCode(lines("$ ", "$ ls"), "console")).toBe("ls");
  });

  it("copies a session with no prompt as written", () => {
    const text = lines("npm i blume", "npx blume dev");
    expect(copyableCode(text, "console")).toBe(text);
  });

  it("is what the layout's copy button copies", async () => {
    // The button lives in the layout's inline client script (no DOM in this
    // suite), so pin that it runs the block's text through copyableCode with
    // the fence's own language id, not the display label.
    const layout = await readFile(
      new URL("../src/components/layout/RootLayout.astro", import.meta.url),
      { encoding: "utf-8" }
    );
    expect(layout).toContain("copyText(copyableCode(codeText(pre), language))");
    expect(layout).toContain(
      "(pre.dataset.blumeLanguage ?? pre.dataset.language)"
    );
  });
});
