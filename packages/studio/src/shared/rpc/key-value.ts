import type { KeyProvenance } from "@verbatra/sdk";
import { z } from "zod";

export const KEY_VALUE_METHOD = "key.value";

export const keyValueParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
});

export type KeyValueParams = z.infer<typeof keyValueParamsSchema>;

export interface KeyValueResult {
  readonly source: string;
  readonly target?: string;
  readonly description?: string;
  readonly provenance?: KeyProvenance;
}
