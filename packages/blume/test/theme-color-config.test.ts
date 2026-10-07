import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import { loadConfig } from "../src/core/config.ts";
import { scanProject } from "../src/core/project-graph.ts";
import { blumeConfigSchema } from "../src/core/schema.ts";
import { invalidColorSettings } from "../src/theme/palette.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** A project holding `config` as its blume.config.ts and one page. */
const project = async (config: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-theme-color-"));
  dirs.push(root);
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "blume.config.ts"), config);
  await writeFile(join(root, "docs", "index.md"), "# Home\n");
  return root;
};

const CONFIG = `export default {
  theme: {
    accent: "deep purple",
    action: "teal",
    background: { light: "#fff", dark: "0a0a0a" },
  },
  seo: { og: { palette: { accent: "oklch(0.6 0.2 290)", muted: "grey-ish" } } },
};
`;

describe("configured colors that aren't CSS colors", () => {
  it("warns once per setting, at the line that sets it", async () => {
    const root = await project(CONFIG);
    const { diagnostics } = await loadConfig(root);
    expect(
      diagnostics.map((d) => [d.code, d.severity, d.schemaPath, d.line])
    ).toStrictEqual([
      ["BLUME_THEME_COLOR_INVALID", "warning", "theme.accent", 3],
      ["BLUME_THEME_COLOR_INVALID", "warning", "theme.background.dark", 5],
      ["BLUME_THEME_COLOR_INVALID", "warning", "seo.og.palette.muted", 7],
    ]);
    const [accent, background, muted] = diagnostics;
    expect(accent?.file).toBe(join(root, "blume.config.ts"));
    expect(accent?.message).toBe(
      `theme.accent: "deep purple" isn't a CSS color, so browsers ignore the styles that use it.`
    );
    expect(accent?.suggestion).toBe(
      "Use a preset (blue, green, orange, pink, purple, red, teal) or a CSS color: a hex value like #6340ac, rgb(), hsl(), oklch(), or a color name like rebeccapurple."
    );
    expect(background?.message).toBe(
      `theme.background.dark: "0a0a0a" isn't a CSS color, so browsers ignore the styles that use it.`
    );
    expect(background?.suggestion).toBe(
      "Use a CSS color: a hex value like #6340ac, rgb(), hsl(), oklch(), or a color name like rebeccapurple."
    );
    expect(muted?.message).toBe(
      `seo.og.palette.muted: "grey-ish" isn't a CSS color, so the social card renderer rejects it.`
    );

    // The scan reports them with the rest of the project's diagnostics.
    const scanned = await scanProject(root);
    expect(
      scanned.diagnostics.filter((d) => d.code === "BLUME_THEME_COLOR_INVALID")
    ).toHaveLength(3);
  });

  it("is quiet for presets, CSS colors, and an unset config", async () => {
    const root = await project(
      `export default { theme: { accent: { light: "teal", dark: "var(--brand)" }, background: { dark: "#0a0a0a" } } };\n`
    );
    const { diagnostics } = await loadConfig(root);
    expect(diagnostics).toStrictEqual([]);
    expect(invalidColorSettings(blumeConfigSchema.parse({}))).toStrictEqual([]);
  });

  it("names each mode of a per-mode value that differs", () => {
    const config = blumeConfigSchema.parse({
      theme: { accent: { dark: "nope", light: "#6340ac" }, action: "x y" },
    });
    expect(invalidColorSettings(config)).toStrictEqual([
      { path: ["theme", "accent", "dark"], presets: true, value: "nope" },
      { path: ["theme", "action"], presets: true, value: "x y" },
    ]);
  });
});
