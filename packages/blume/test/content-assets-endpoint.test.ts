import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import { contentAssetsEndpointTemplate } from "../src/astro/templates.ts";

interface EndpointModule {
  GET: (context: { params: { asset?: string } }) => Promise<Response>;
  getStaticPaths: () => Promise<{ params: { asset: string } }[]>;
}

/** Write the generated endpoint with a content map, and import it. */
const loadEndpoint = async (
  stagedDir: string | null,
  assets: Record<string, string> = {}
): Promise<EndpointModule> => {
  const root = await mkdtemp(join(tmpdir(), "blume-assets-endpoint-"));
  const source = contentAssetsEndpointTemplate(stagedDir).replace(
    'import assets from "blume:content-assets";',
    `const assets = ${JSON.stringify(assets)};`
  );
  const file = join(root, "endpoint.ts");
  await writeFile(file, source);
  return import(file);
};

describe("contentAssetsEndpointTemplate with a staged directory", () => {
  it("publishes only the images and videos a source downloaded", async () => {
    const staged = await mkdtemp(join(tmpdir(), "blume-assets-staged-"));
    await mkdir(join(staged, "notion"), { recursive: true });
    await writeFile(join(staged, "notion", "a.png"), "png-bytes");
    await writeFile(join(staged, "notion", "b.MP4"), "mp4-bytes");
    // What a build before the media-only downloads could leave behind.
    await writeFile(join(staged, "notion", "pwn.html"), "<script>1</script>");
    const endpoint = await loadEndpoint(staged);

    const paths = await endpoint.getStaticPaths();
    expect(paths.map((path) => path.params.asset).toSorted()).toEqual([
      "notion/a.png",
      "notion/b.MP4",
    ]);

    const video = await endpoint.GET({ params: { asset: "notion/b.MP4" } });
    expect(video.status).toBe(200);
    expect(video.headers.get("Content-Type")).toBe("video/mp4");

    const page = await endpoint.GET({ params: { asset: "notion/pwn.html" } });
    expect(page.status).toBe(404);
  });
});

describe("contentAssetsEndpointTemplate with content files", () => {
  it("types a file a page links beside it, and downloads an unknown one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "blume-assets-files-"));
    await writeFile(join(dir, "spec.pdf"), "pdf-bytes");
    await writeFile(join(dir, "notes.xyz"), "xyz-bytes");
    const endpoint = await loadEndpoint(null, {
      "docs/notes.xyz": join(dir, "notes.xyz"),
      "docs/spec.pdf": join(dir, "spec.pdf"),
    });

    const pdf = await endpoint.GET({
      params: { asset: "content/docs/spec.pdf" },
    });
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(await pdf.text()).toBe("pdf-bytes");
    const other = await endpoint.GET({
      params: { asset: "content/docs/notes.xyz" },
    });
    expect(other.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
