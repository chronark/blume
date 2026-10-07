import { describe, expect, it } from "bun:test";

import { nextFenceState } from "../src/core/code-fences.ts";
import type { FenceState } from "../src/core/code-fences.ts";

/** The quote depth of the fence open after each of `lines`, or null. */
const depths = (lines: string[]): (number | null)[] => {
  let fence: FenceState = null;
  return lines.map((line) => {
    fence = nextFenceState(line, fence);
    return fence === null ? null : fence.quotes;
  });
};

describe(nextFenceState, () => {
  it("reads a fence inside a block quote past its markers", () => {
    expect(
      depths([
        "> ```ts",
        "> interface X {",
        ">   [key: string]: string;",
        "> }",
        "> ```",
        "> [after](/x)",
      ])
    ).toStrictEqual([1, 1, 1, 1, null, null]);
  });

  it("closes a quoted fence where its quote ends", () => {
    // Code takes no lazy continuation lines, so a line without the marker
    // ends the quote and the fence it holds. That line can open a fence of
    // its own.
    expect(
      depths(["> ```", "> code", "after the quote", ">```", "```"])
    ).toStrictEqual([1, 1, null, 1, 0]);
  });

  it("reads a nested quote's fence past every marker it opened under", () => {
    expect(
      depths([
        "> > ~~~",
        "> > code",
        "> > ~~~",
        "> > ~~~",
        "> ~~~",
        "> code in the outer quote",
        "> ~~~",
      ])
    ).toStrictEqual([2, 2, null, 2, 1, 1, null]);
    // A deeper marker inside the fence is code, not a closer.
    expect(depths(["> ```", "> > ```", "> ```", "text"])).toStrictEqual([
      1,
      1,
      null,
      null,
    ]);
  });

  it("keeps a quoted line inside an unquoted fence as code", () => {
    expect(depths(["```md", "> ```", "> quoted", "```", "x"])).toStrictEqual([
      0,
      0,
      0,
      null,
      null,
    ]);
  });
});
