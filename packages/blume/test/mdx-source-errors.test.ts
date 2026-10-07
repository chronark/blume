import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { join } from "pathe";
import { z } from "zod";

import { mdxSourceErrorsPlugin } from "../src/astro/mdx-source-errors.ts";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

// What `@astrojs/mdx` leaves of a compiled page: the body's function, and the
// `Content` export that calls it by name.
const COMPILED = `function MDXContent(props = {}) {
  if (props.throws === "error") throw new ReferenceError("user is not defined");
  if (props.throws === "placed") throw Object.assign(new Error("x"), { id: "/elsewhere.ts" });
  if (props.throws === "value") throw "not an error";
  return "rendered";
}
export const Content = (props = {}) => MDXContent(props);
`;

const contentSchema = z.object({
  Content: z.function({ input: [z.record(z.string(), z.string())] }),
});

/** Load the transformed module and return its `Content`. */
const load = async (code: string) => {
  const dir = await mkdtemp(join(tmpdir(), "blume-mdx-source-errors-"));
  dirs.push(dir);
  const file = join(dir, "page.mjs");
  await writeFile(file, code);
  const mod: unknown = await import(pathToFileURL(file).href);
  return contentSchema.parse(mod).Content;
};

// A thrown error's fields, or a thrown value that isn't one.
const thrownSchema = z.union([
  z.string(),
  z.looseObject({ id: z.string().optional(), message: z.string() }),
]);

/** What `render` threw, or null when it returned. */
const thrown = (render: () => void): z.infer<typeof thrownSchema> | null => {
  try {
    render();
  } catch (error) {
    return thrownSchema.parse(error);
  }
  return null;
};

describe("mdxSourceErrorsPlugin", () => {
  const plugin = mdxSourceErrorsPlugin();

  it("leaves modules other than a compiled page alone", () => {
    expect(
      plugin.transform(COMPILED, "/site/docs/page.mdx?astroPropagatedAssets")
    ).toBeNull();
    expect(plugin.transform(COMPILED, "/site/src/page.ts")).toBeNull();
    expect(
      plugin.transform("export default 1;\n", "/site/docs/page.mdx")
    ).toBeNull();
  });

  it("names the page on an error its body throws while it renders", async () => {
    const result = plugin.transform(COMPILED, "/site/docs/page.mdx");
    const Content = await load(result?.code ?? "");
    expect(Content({})).toBe("rendered");
    expect(thrown(() => Content({ throws: "error" }))).toMatchObject({
      id: "/site/docs/page.mdx",
      message: "user is not defined",
    });
    // An error that already names its module keeps it, and a thrown value
    // that isn't an error passes through untouched.
    expect(thrown(() => Content({ throws: "placed" }))).toMatchObject({
      id: "/elsewhere.ts",
    });
    expect(thrown(() => Content({ throws: "value" }))).toBe("not an error");
  });
});
