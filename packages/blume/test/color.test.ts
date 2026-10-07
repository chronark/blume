import { describe, expect, it } from "bun:test";

import {
  composite,
  contrastRatio,
  isCssColor,
  luminance,
  parseColor,
} from "../src/theme/color.ts";
import type { Rgba } from "../src/theme/color.ts";

/** A parsed color as 0–255 channels and its alpha, or `null`. */
const bytes = (value: string): number[] | null => {
  const color = parseColor(value);
  return color
    ? [
        Math.round(color.red * 255),
        Math.round(color.green * 255),
        Math.round(color.blue * 255),
        Math.round(color.alpha * 100) / 100,
      ]
    : null;
};

/** A color the tests know parses. */
const color = (value: string): Rgba =>
  parseColor(value) ?? { alpha: 0, blue: 0, green: 0, red: 0 };

describe(parseColor, () => {
  it("reads hex in every length, and named colors", () => {
    expect(bytes("#f00")).toStrictEqual([255, 0, 0, 1]);
    expect(bytes("#f008")).toStrictEqual([255, 0, 0, 0.53]);
    expect(bytes(" #1D4ED8 ")).toStrictEqual([29, 78, 216, 1]);
    expect(bytes("#1d4ed880")).toStrictEqual([29, 78, 216, 0.5]);
    expect(bytes("RebeccaPurple")).toStrictEqual([102, 51, 153, 1]);
    expect(bytes("transparent")).toStrictEqual([0, 0, 0, 0]);
  });

  it("reads rgb() in the legacy and modern syntaxes", () => {
    expect(bytes("rgb(255, 0, 0)")).toStrictEqual([255, 0, 0, 1]);
    expect(bytes("rgba(0, 0, 255, 0.5)")).toStrictEqual([0, 0, 255, 0.5]);
    expect(bytes("rgb(100% 50% 0% / 25%)")).toStrictEqual([255, 128, 0, 0.25]);
    expect(bytes("rgb(300 -5 none)")).toStrictEqual([255, 0, 0, 1]);
  });

  it("reads hsl() and hwb() with any angle unit", () => {
    expect(bytes("hsl(120 100% 25%)")).toStrictEqual([0, 128, 0, 1]);
    expect(bytes("hsla(-240deg, 100%, 50%, 1)")).toStrictEqual([0, 255, 0, 1]);
    expect(bytes("hsl(0.5turn 100 50)")).toStrictEqual([0, 255, 255, 1]);
    expect(bytes("hsl(200grad 100% 50%)")).toStrictEqual([0, 255, 255, 1]);
    expect(bytes("hsl(3.14159265rad 100% 50%)")).toStrictEqual([
      0, 255, 255, 1,
    ]);
    expect(bytes("hwb(0 0% 0%)")).toStrictEqual([255, 0, 0, 1]);
    expect(bytes("hwb(0 20% 20%)")).toStrictEqual([204, 51, 51, 1]);
    expect(bytes("hwb(0 100% 100%)")).toStrictEqual([128, 128, 128, 1]);
  });

  it("reads lab(), lch(), oklab(), and oklch()", () => {
    // sRGB red in each space, as CSS Color 4 gives it.
    expect(bytes("lab(54.29% 80.82 69.9)")).toStrictEqual([255, 0, 0, 1]);
    expect(bytes("lch(54.29 106.84 40.85)")).toStrictEqual([255, 0, 0, 1]);
    expect(bytes("oklab(62.8% 0.2249 0.1258)")).toStrictEqual([255, 0, 0, 1]);
    expect(bytes("oklch(0.628 64.4% 29.23deg / 0.5)")).toStrictEqual([
      255, 0, 0, 0.5,
    ]);
    expect(bytes("oklch(1 0 0)")).toStrictEqual([255, 255, 255, 1]);
    // Dark enough that lab's linear segment carries every axis.
    expect(bytes("lab(2 0 0)")).toStrictEqual([7, 7, 7, 1]);
  });

  it("clips a color outside sRGB to it", () => {
    expect(bytes("oklab(1.2 0 0)")).toStrictEqual([255, 255, 255, 1]);
    expect(bytes("oklab(-0.1 0 0)")).toStrictEqual([0, 0, 0, 1]);
  });

  it("parses nothing it can't read", () => {
    for (const value of [
      "var(--brand)",
      "color-mix(in oklab, red, blue)",
      "color(display-p3 1 0 0)",
      "rgb(1 2)",
      "rgb(1 2 3 4 5)",
      "rgb(1 2 3 / 4 / 5)",
      "rgb(1 2 x)",
      "rgb(1 2 3 / x)",
      "#12345",
      "constructor",
      "not a color",
    ]) {
      expect(parseColor(value)).toBeNull();
    }
  });
});

describe(isCssColor, () => {
  it("takes what parseColor reads and the color syntax it leaves unread", () => {
    for (const value of [
      "#6340ac",
      " rebeccapurple ",
      "transparent",
      "oklch(0.6 0.2 290)",
      "var(--brand)",
      "color-mix(in oklab, red, blue)",
      "color(display-p3 1 0 0)",
      "light-dark(#fff, #000)",
      "oklch(from var(--brand) l c h)",
      "currentColor",
    ]) {
      expect(isCssColor(value)).toBe(true);
    }
  });

  it("rejects words that name no color and malformed hex", () => {
    for (const value of [
      "deep purple",
      "purpel",
      "6340ac",
      "#12345",
      "",
      "#fff;",
      "url(x.png)",
    ]) {
      expect(isCssColor(value)).toBe(false);
    }
  });
});

describe(contrastRatio, () => {
  it("measures WCAG 2 contrast", () => {
    expect(contrastRatio(color("#000"), color("#fff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(color("#fff"), color("#000"))).toBeCloseTo(21, 5);
    expect(contrastRatio(color("#777"), color("#fff"))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(color("#fff"), color("#fff"))).toBe(1);
  });

  it("paints a translucent foreground over the background first", () => {
    const half = color("rgb(0 0 0 / 50%)");
    expect(composite(half, color("#fff")).red).toBeCloseTo(0.5, 5);
    expect(contrastRatio(half, color("#fff"))).toBeCloseTo(
      contrastRatio(color("#808080"), color("#fff")),
      1
    );
    expect(luminance(color("#fff"))).toBeCloseTo(1, 5);
  });
});
