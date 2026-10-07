import { describe, expect, it } from "bun:test";

import { downlevelComponents } from "../src/ai/component-markdown.ts";
import { openapiComponentSerializers } from "../src/ai/openapi-components.ts";
import type {
  ApiDocument,
  ApiOperationRef,
  ApiSpecData,
} from "../src/openapi/model.ts";

/**
 * An operation page's Markdown copy (`<route>.md`, llms-full.txt, MCP
 * `get_page`) carries its request body and responses, with the examples the
 * spec records, as compactly as the page's own components show them.
 */

const document: ApiDocument = {
  components: {
    examples: {
      rex: { summary: "A dog", value: { id: 1, name: "Rex" } },
    },
    requestBodies: {
      Pet: {
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/Pet" } },
        },
        description: "The pet to add.",
        required: true,
      },
    },
    responses: {
      Error: {
        content: {
          "application/json": {
            schema: {
              properties: { message: { type: "string" } },
              type: "object",
            },
          },
        },
        description: "Something went wrong.",
      },
    },
    schemas: {
      Pet: {
        example: { id: 7, name: "Rex", secret: "x", tag: "dog" },
        properties: {
          id: { readOnly: true, type: "integer" },
          name: { description: "The pet's\n  name.", type: "string" },
          secret: { type: "string", writeOnly: true },
          tag: { type: ["string", "null"] },
        },
        required: ["id", "name"],
        type: "object",
      },
    },
  },
  info: { title: "API", version: "1" },
  openapi: "3.1.0",
  paths: {
    "/pets": {
      get: {
        responses: {
          "200": {
            content: {
              "application/json": {
                examples: {
                  cat: { value: [{ id: 2, name: "Tom" }] },
                  dog: { $ref: "#/components/examples/rex" },
                },
              },
            },
            description: "The pets.",
          },
          "500": { $ref: "#/components/responses/Error" },
        },
      },
      post: {
        requestBody: { $ref: "#/components/requestBodies/Pet" },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
            description: "Added.",
          },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/search": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              examples: {
                byName: { summary: "By name", value: { q: "Rex" } },
                byTag: { value: { q: "dog" } },
              },
            },
          },
        },
      },
      // A body with no media type has nothing to show.
      put: { requestBody: { content: {}, description: "Nothing." } },
    },
    "/upload": {
      put: {
        requestBody: { content: { "application/octet-stream": {} } },
        responses: {},
      },
    },
  },
  webhooks: {
    petAdded: {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Pet" },
            },
          },
        },
      },
    },
  },
};

const ref = (
  key: string,
  method: ApiOperationRef["method"],
  path: string,
  extra: Partial<ApiOperationRef> = {}
): ApiOperationRef => ({
  deprecated: false,
  description: "",
  key,
  method,
  path,
  route: `/api/pets/${key}`,
  summary: "",
  tag: "Pets",
  tagSlug: "pets",
  ...extra,
});

const spec: ApiSpecData = {
  codeSamples: [],
  description: "",
  document,
  expandSchemas: false,
  kind: "openapi",
  label: "API",
  operations: Object.fromEntries(
    [
      ref("list", "get", "/pets"),
      ref("add", "post", "/pets"),
      ref("upload", "put", "/upload"),
      ref("search", "post", "/search"),
      ref("replace", "put", "/search"),
      ref("pet-added", "post", "petAdded", { webhook: true }),
    ].map((operation) => [operation.key, operation])
  ),
  playground: { enabled: false, proxy: false },
  route: "/api",
  slug: "api",
  tags: [],
  title: "API",
  version: "1",
};

const markdown = (id: string): string =>
  downlevelComponents(
    `<Operation source="api" id="${id}" />\n`,
    openapiComponentSerializers({ api: spec })
  );

describe("operation Markdown", () => {
  it("lists a request body's properties and the example a request sends", () => {
    expect(markdown("add")).toBe(
      [
        "`POST /pets`",
        "",
        "**Request body** (`application/json`, required)",
        "",
        "The pet to add.",
        "",
        "- `name` (string, required) — The pet's name.",
        "- `secret` (string)",
        "- `tag` (string | null)",
        "",
        "Request body example:",
        "",
        "```json",
        "{",
        '  "name": "Rex",',
        '  "secret": "x",',
        '  "tag": "dog"',
        "}",
        "```",
        "",
        "**Responses**",
        "",
        "- `201` — Added.",
        "- `400` — Something went wrong.",
        "",
        // The first success response records no example, so it gets the
        // sampled one; the error response doesn't.
        "Response example, 201:",
        "",
        "```json",
        "{",
        '  "id": 7,',
        '  "name": "Rex",',
        '  "tag": "dog"',
        "}",
        "```",
        "",
      ].join("\n")
    );
  });

  it("shows every example a response records, under its name", () => {
    const text = markdown("list");
    expect(text).toContain("Response example, 200 · cat:");
    expect(text).toContain("Response example, 200 · A dog:");
    expect(text).toContain("- `500` — Something went wrong.");
    expect(text).not.toContain("Response example, 500");
  });

  it("describes a webhook's payload as one, read like a response", () => {
    const text = markdown("pet-added");
    expect(text).toContain("**Payload** (`application/json`)");
    // A payload travels from the API: readOnly in, writeOnly out.
    expect(text).toContain("- `id` (integer, required)");
    expect(text).not.toContain("`secret`");
    expect(text).toContain("Payload example:");
    expect(text).not.toContain("**Responses**");
  });

  it("names a body's media type even with no schema or example", () => {
    expect(markdown("upload")).toBe(
      "`PUT /upload`\n\n**Request body** (`application/octet-stream`)\n"
    );
    expect(markdown("replace")).toBe("`PUT /search`\n");
  });

  it("shows each named request example, under its name", () => {
    const text = markdown("search");
    expect(text).toContain(
      'Request body example, By name:\n\n```json\n{\n  "q": "Rex"\n}\n```'
    );
    expect(text).toContain("Request body example, byTag:");
  });
});
