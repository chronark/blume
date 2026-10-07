import { describe, expect, it, spyOn } from "bun:test";

import { rateLimitTemplate } from "../src/astro/templates.ts";
import { blumeConfigSchema } from "../src/core/schema.ts";
import { unkey } from "../src/ratelimit/index.ts";
import type { UnkeyAdapter } from "../src/ratelimit/index.ts";
import { createLimiter, rateLimited } from "../src/ratelimit/runtime.ts";

describe("Unkey rate limiting", () => {
  it("uses default limits and accepts allowed replies with past reset times", async () => {
    const requests: Request[] = [];
    const limiter = createLimiter(unkey({ namespace: "docs" }), {
      fetch: Object.assign(
        (input: string | URL | Request, init?: RequestInit) => {
          requests.push(new Request(input, init));
          return Promise.resolve(
            Response.json({ data: { reset: 999_000, success: true } })
          );
        },
        { preconnect: fetch.preconnect }
      ),
      now: () => 1_000_000,
      secret: (name) => (name === "UNKEY_ROOT_KEY" ? "test-key" : undefined),
    });
    expect(await limiter?.("reader")).toStrictEqual({
      allowed: true,
      retryAfter: 1,
    });
    expect(await requests[0]?.json()).toStrictEqual({
      duration: 600_000,
      identifier: "reader",
      limit: 30,
      namespace: "docs",
    });
    const serialized = JSON.stringify(unkey({ namespace: "docs" }));
    expect(JSON.parse(serialized)).toStrictEqual({
      kind: "unkey",
      options: { namespace: "docs" },
      requiredSecrets: ["UNKEY_ROOT_KEY"],
      runtimeDeps: [],
    });
  });

  it.each([
    { namespace: "" },
    { namespace: "docs", rootKeyEnv: "" },
    { namespace: "docs", requests: 0 },
    { namespace: "docs", window: 0.5 },
  ])("rejects invalid options %j", (options) => {
    expect(
      blumeConfigSchema.safeParse({ rateLimit: unkey(options) }).success
    ).toBe(false);
  });

  it("warns and uses the configured memory budget without a root key", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const limiter = createLimiter(
        unkey({ namespace: "docs", requests: 1, window: 9 }),
        {
          now: () => 1000,
        }
      );
      expect(await limiter?.("reader")).toStrictEqual({
        allowed: true,
        retryAfter: 9,
      });
      expect(await limiter?.("reader")).toStrictEqual({
        allowed: false,
        retryAfter: 9,
      });
      expect(warn).toHaveBeenCalledWith(
        "Rate limiting counts in memory: set UNKEY_ROOT_KEY to share the count through Unkey."
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("hands Unkey the server secret reader in generated routes", () => {
    const template = rateLimitTemplate(unkey({ namespace: "docs" }), "search");
    expect(template.imports).toContain(
      'import { getSecret } from "astro:env/server";'
    );
    expect(template.setup).toContain(", { secret: getSecret }");
    expect(template.setup).toContain('"UNKEY_ROOT_KEY"');
    expect(template.check).toContain('rateLimited(limiter, context, "search")');
  });

  it.each([
    [200, { data: { reset: 1_020_000, success: "false" } }],
    [200, { data: { reset: "1020000", success: false } }],
    [200, { data: { success: false } }],
    [503, { data: { reset: 1_020_000, success: false } }],
  ])(
    "fails open on an invalid Unkey response (%s, %j)",
    async (status, body) => {
      const error = spyOn(console, "error").mockImplementation(() => {});
      try {
        const limiter = createLimiter(unkey({ namespace: "docs" }), {
          fetch: Object.assign(
            () => Promise.resolve(Response.json(body, { status })),
            { preconnect: fetch.preconnect }
          ),
          now: () => 1_000_000,
          secret: () => "test-key",
        });
        expect(
          await rateLimited(
            limiter,
            {
              clientAddress: "192.0.2.1",
              request: new Request("https://docs.example.com/api/ask"),
            },
            "ask"
          )
        ).toBeNull();
        expect(error).toHaveBeenCalledTimes(1);
      } finally {
        error.mockRestore();
      }
    }
  );

  it("accepts a serializable Unkey adapter on any deployment", () => {
    const adapter: UnkeyAdapter = {
      kind: "unkey",
      options: { namespace: "docs" },
      requiredSecrets: ["UNKEY_ROOT_KEY"],
      runtimeDeps: [],
    };
    expect(
      blumeConfigSchema.parse({ rateLimit: adapter }).rateLimit
    ).toStrictEqual(adapter);
  });

  it("sends the scoped reader budget to Unkey and returns its denial", async () => {
    const requests: Request[] = [];
    const fetchImpl = Object.assign(
      (input: string | URL | Request, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Promise.resolve(
          Response.json({ data: { reset: 1_012_501, success: false } })
        );
      },
      { preconnect: fetch.preconnect }
    );
    const limiter = createLimiter(
      unkey({
        namespace: "docs",
        requests: 7,
        rootKeyEnv: "DOCS_KEY",
        window: 43,
      }),
      {
        fetch: fetchImpl,
        now: () => 1_000_000,
        secret: (name) => (name === "DOCS_KEY" ? "test-root-key" : undefined),
      }
    );
    const response = await rateLimited(
      limiter,
      {
        clientAddress: "192.0.2.1",
        request: new Request("https://docs.example.com/api/ask"),
      },
      "ask"
    );
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("13");
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("https://api.unkey.com/v2/ratelimit.limit");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe("Bearer test-root-key");
    expect(await request?.json()).toStrictEqual({
      duration: 43_000,
      identifier: "blume:docs.example.com:ask:192.0.2.1",
      limit: 7,
      namespace: "docs",
    });
  });
});
