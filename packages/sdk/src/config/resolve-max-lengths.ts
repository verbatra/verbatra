import type { SdkFs } from "../fs.js";
import { type LimitsUnusable, limitsFilePath, readLimitsFile } from "./limits-file.js";
import { toMaxLengthMap } from "./max-length.js";
import type { VerbatraConfig } from "./schema.js";

/** Where a key's `maxLength` budget comes from: the config's own `maxLength`, or `verbatra.limits.json`. The config wins per key. */
export type MaxLengthSource = "config" | "limits-file";

export interface ResolvedMaxLength {
  readonly value: number;
  readonly source: MaxLengthSource;
}

export interface ResolvedMaxLengths {
  readonly limits: ReadonlyMap<string, number> | undefined;
  readonly entries: ReadonlyMap<string, ResolvedMaxLength>;
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
  const entries = new Map<string, ResolvedMaxLength>();
  if (read.kind === "ok") {
    for (const [key, value] of read.limits) {
      entries.set(key, { value, source: "limits-file" });
    }
  }
  for (const [key, value] of toMaxLengthMap(input.config.maxLength) ?? []) {
    entries.set(key, { value, source: "config" });
  }
  return {
    limits:
      entries.size === 0
        ? undefined
        : new Map([...entries].map(([key, entry]) => [key, entry.value])),
    entries,
    ...(read.kind === "unusable" ? { unusable: read.unusable } : {}),
  };
}
