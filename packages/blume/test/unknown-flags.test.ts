import { describe, expect, it } from "bun:test";

import type { ArgsDef } from "citty";

import {
  COMMAND_HANDLED_FLAGS,
  unknownFlags,
  unknownFlagsDiagnostic,
} from "../src/cli/unknown-flags.ts";
import { closestMatch } from "../src/core/closest-match.ts";

const args = {
  "budget-js": { description: "", type: "string" },
  force: { alias: ["f"], description: "", type: "boolean" },
  id: { description: "", required: false, type: "positional" },
  isolated: { description: "", type: "boolean" },
  listChecks: { description: "", type: "boolean" },
  port: { alias: "p", description: "", type: "string" },
  strict: { default: true, description: "", type: "boolean" },
  template: { description: "", options: ["docs", "api"], type: "enum" },
  verbose: { alias: "v", description: "", type: "boolean" },
} satisfies ArgsDef;

describe("unknownFlags", () => {
  it("accepts every spelling citty accepts", () => {
    expect(
      unknownFlags(
        [
          "v1.0",
          "--isolated",
          "--budget-js",
          "120",
          "--budgetJs=90",
          "--list-checks",
          "--listChecks",
          "--no-strict",
          "--port",
          "--weird-value",
          "--template=api",
          "-f",
          "-p=4000",
          "-fv",
          "-",
          "--force=false",
        ],
        args
      )
    ).toEqual([]);
  });

  it("reports typos with the declared flag they most resemble", () => {
    expect(unknownFlags(["--isolatd", "--strcit"], args)).toEqual([
      { flag: "--isolatd", suggestion: "--isolated" },
      { flag: "--strcit", suggestion: "--strict" },
    ]);
  });

  it("keeps a mistyped negation negated in its suggestion", () => {
    expect(
      unknownFlags(["--no-strcit", "--no-isolatd", "--no-portt"], args)
    ).toEqual([
      { flag: "--no-strcit", suggestion: "--no-strict" },
      { flag: "--no-isolatd", suggestion: "--no-isolated" },
      // Negating a flag that takes a value means nothing: suggest the flag.
      { flag: "--no-portt", suggestion: "--port" },
    ]);
  });

  it("reports an unknown negation and short flag, without a far-fetched suggestion", () => {
    expect(unknownFlags(["--no-colour", "-x", "-xz"], args)).toEqual([
      { flag: "--no-colour" },
      { flag: "-x" },
      { flag: "-xz" },
    ]);
  });

  it("drops the value of an unknown `--flag=value`", () => {
    expect(unknownFlags(["--output=server"], args)).toEqual([
      { flag: "--output" },
    ]);
  });

  it("ignores everything after a bare --", () => {
    expect(unknownFlags(["--", "--anything"], args)).toEqual([]);
  });

  it("lets a command keep flags it handles itself", () => {
    expect(
      unknownFlags(
        ["--adapter", "vercel", "--output=server", "--no-base"],
        {},
        COMMAND_HANDLED_FLAGS.get("build")
      )
    ).toEqual([]);
  });
});

describe("closestMatch", () => {
  it("returns the nearest candidate within two edits", () => {
    expect(closestMatch("link", ["links", "content"])).toBe("links");
    expect(closestMatch("verbos", ["verbose", "version"])).toBe("verbose");
  });

  it("returns nothing when no candidate is close enough", () => {
    expect(closestMatch("x", ["yes"])).toBeUndefined();
    expect(closestMatch("zzzzzz", ["links"])).toBeUndefined();
    expect(closestMatch("anything", [])).toBeUndefined();
  });
});

describe("unknownFlagsDiagnostic", () => {
  it("names each unknown flag, its suggestion, and the flags the command takes", () => {
    const diagnostic = unknownFlagsDiagnostic(
      "build",
      [{ flag: "--isolatd", suggestion: "--isolated" }],
      args
    );
    expect(diagnostic.code).toBe("BLUME_UNKNOWN_OPTION");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.message).toBe(
      "blume build doesn't know the option --isolatd (did you mean --isolated?)."
    );
    // `strict` is on by default, so the form worth listing is `--no-strict`.
    expect(diagnostic.suggestion).toBe(
      "It takes --budget-js, --force, --isolated, --list-checks, --no-strict, --port, --template, --verbose. Run `blume build --help` for what each does."
    );
  });

  it("pluralizes several flags and says when a command takes none", () => {
    const diagnostic = unknownFlagsDiagnostic(
      "version",
      [{ flag: "--a" }, { flag: "--b" }],
      { id: { description: "", type: "positional" } }
    );
    expect(diagnostic.message).toBe(
      "blume version doesn't know the options --a, --b."
    );
    expect(diagnostic.suggestion).toStartWith("It takes no options.");
  });
});
