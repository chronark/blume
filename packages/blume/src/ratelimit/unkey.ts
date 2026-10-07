import { z } from "zod";

import type { AdapterDescriptor } from "../core/adapter.ts";
import { adapterDescriptorSchema } from "../core/adapter.ts";
import { rateLimitOptionsSchema } from "./memory.ts";
import type { RateLimitOptions } from "./memory.ts";

export interface UnkeyOptions extends RateLimitOptions {
  /** The Unkey rate limit namespace. Defaults to `docs`. */
  namespace?: string;
  /** Name of the env var holding the root key. Defaults to `UNKEY_ROOT_KEY`. */
  rootKeyEnv?: string;
}

export const unkeyAdapterSchema = adapterDescriptorSchema(
  "unkey",
  rateLimitOptionsSchema.extend({
    namespace: z.string().min(1).optional(),
    rootKeyEnv: z.string().min(1).optional(),
  })
);

export type UnkeyAdapter = AdapterDescriptor<"unkey", UnkeyOptions>;

export const unkeySecrets = (options: UnkeyOptions): [string] => [
  options.rootKeyEnv ?? "UNKEY_ROOT_KEY",
];

/** Counts requests through Unkey's REST API without an SDK dependency. */
export const unkey = (options: UnkeyOptions = {}): UnkeyAdapter => ({
  kind: "unkey",
  options,
  requiredSecrets: unkeySecrets(options),
  runtimeDeps: [],
});
