import type { SdkFs } from "../fs.js";
import { type LimitsUnusable, limitsFilePath, readLimitsFile } from "./limits-file.js";
import { toMaxLengthMap } from "./max-length.js";
import type { VerbatraConfig } from "./schema.js";

/** Where a key's `maxLength` budget comes from: the config's own `maxLength`, or `verbatra.limits.json`. The config wins per key. */
export type MaxLengthSource = "config" | "limits-file";

export interface ResolvedMaxLengths {
  readonly limits: ReadonlyMap<string, number> | undefined;
  readonly sources: ReadonlyMap<string, MaxLengthSource>;
  readonly unusable?: LimitsUnusable;
}

export interface ResolveMaxLengthsInput {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly fs: SdkFs;
}

export async function resolveMaxLengths(
  input: ResolveMaxLengthsInput,
): Promise<ResolvedMaxLengths> {
  const read = await readLimitsFile(limitsFilePath(input.cwd), input.fs);
  const merged = new Map<string, number>();
  const sources = new Map<string, MaxLengthSource>();
  if (read.kind === "ok") {
    for (const [key, value] of read.limits) {
      merged.set(key, value);
      sources.set(key, "limits-file");
    }
  }
  for (const [key, value] of toMaxLengthMap(input.config.maxLength) ?? []) {
    merged.set(key, value);
    sources.set(key, "config");
  }
  return {
    limits: merged.size === 0 ? undefined : merged,
    sources,
    ...(read.kind === "unusable" ? { unusable: read.unusable } : {}),
  };
}
