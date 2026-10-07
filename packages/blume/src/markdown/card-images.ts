import { fileURLToPath } from "node:url";

import { dirname, join, normalize } from "pathe";

import { RUNTIME_MODULE_FILES } from "../astro/runtime-modules.ts";
import {
  contentAssetUrl,
  resolveRelativeImage,
} from "../core/content-assets.ts";
import type { MdastNode, MdastValue } from "./mdast.ts";
import { snapshotReader } from "./route-snapshot.ts";

/** An MDX JSX attribute, as the plugin reads it. */
interface JsxAttribute {
  [key: string]: MdastValue;
  name?: string;
  type?: string;
  value?: MdastValue;
}

/** An MDX JSX element (`<Card img="./cover.png" />`), as the plugin reads it. */
interface JsxNode extends MdastNode {
  attributes?: JsxAttribute[];
  children?: MdastValue[];
  name?: string | null;
}

/** The visitor-context slice this plugin uses (see `mdast.ts` for the model). */
interface CardImagesContext {
  fileURL: URL | undefined;
  replaceNode: (node: MdastNode, replacement: MdastNode) => void;
}

export interface CardImagesPluginOptions {
  /**
   * The `blume:data` snapshot file an ejected app aliases. The served
   * content-assets map is written beside it, and read from there when no CLI
   * publishes it.
   */
  dataFile?: string;
  /** Astro's `deployment.base` subdirectory (`""` or `/seg`). */
  deployBase?: string;
}

/** A plain string attribute value; an expression value isn't a path. */
const isStringValue = (value: MdastValue): value is string =>
  typeof value === "string";

/**
 * Satteri MDAST plugin that points a `<Card img="./cover.png">` at the image's
 * served copy (`/blume-assets/content/…`), the way a colocated
 * `![](./cover.png)` is published. A card renders `img` as a plain
 * `<img src>`, so left as written the browser would resolve the path against
 * the page's URL and 404. The image is resolved from beside the page, as an
 * embed is (`resolveRelativeImage`; an included partial's value was already
 * rebased onto the page by the include expander), and rewritten only when
 * the content-assets endpoint serves it: the map `collectContentAssets`
 * builds over the same `<Card img>` values. Anything else is left as written,
 * and `blume validate` reports it.
 */
export const cardImagesPlugin = (options: CardImagesPluginOptions = {}) => {
  const assetsFile = options.dataFile
    ? join(
        dirname(options.dataFile),
        RUNTIME_MODULE_FILES.get("blume:content-assets") ?? ""
      )
    : undefined;
  const readAssets = snapshotReader("blume:content-assets", assetsFile);

  // The map is published as `param → absolute path`; parsed once per
  // published text and inverted, so each card looks its file up directly.
  let cached: { params: Map<string, string>; text: string } | undefined;
  const servedParams = (): Map<string, string> | undefined => {
    const text = readAssets();
    if (text === undefined) {
      return undefined;
    }
    if (cached?.text !== text) {
      const files: Record<string, string> = JSON.parse(text);
      cached = {
        params: new Map(
          Object.entries(files).map(([param, path]) => [normalize(path), param])
        ),
        text,
      };
    }
    return cached.params;
  };

  const rewriteImg = (node: JsxNode, ctx: CardImagesContext): void => {
    if (node.name !== "Card" || !ctx.fileURL) {
      return;
    }
    const attributes = node.attributes ?? [];
    const at = attributes.findIndex(
      (attribute) =>
        attribute.type === "mdxJsxAttribute" &&
        attribute.name === "img" &&
        isStringValue(attribute.value)
    );
    const value = attributes[at]?.value;
    if (!isStringValue(value)) {
      return;
    }
    const file = resolveRelativeImage(
      dirname(normalize(fileURLToPath(ctx.fileURL))),
      value
    );
    const param = file === null ? undefined : servedParams()?.get(file);
    if (param === undefined) {
      return;
    }
    // Sätteri can't set a JSX element's attributes in place, so the element
    // is swapped for a copy; its children carry over and are still visited.
    ctx.replaceNode(node, {
      attributes: attributes.map((attribute, position) =>
        position === at
          ? {
              name: attribute.name,
              type: attribute.type,
              value: contentAssetUrl(param, options.deployBase),
            }
          : attribute
      ),
      children: node.children ?? [],
      name: node.name,
      type: node.type,
    });
  };

  return {
    mdxJsxFlowElement: rewriteImg,
    mdxJsxTextElement: rewriteImg,
    name: "blume-card-images",
  };
};
