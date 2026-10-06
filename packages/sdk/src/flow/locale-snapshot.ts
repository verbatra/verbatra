import { contentHash } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";

/**
 * One locale file reduced to a per-key content hash. Holding hashes rather than values keeps a
 * long-lived watcher's memory flat in the size of the translations and makes comparison a cheap
 * equality check.
 */
export interface LocaleFileSnapshot {
  /** The locale this snapshot was taken for. */
  readonly locale: string;
  /** Content hash per key, in the order the adapter read them. */
  readonly hashes: ReadonlyMap<string, string>;
}

/** Input for {@link readLocaleFileSnapshot}. */
export interface ReadLocaleFileSnapshotInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /**
   * The locale file to snapshot. Unlike most entry points this is not checked against the
   * configured target locales, so the source locale can be snapshotted too.
   */
  readonly locale: string;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of a config that {@link loadConfig} returned, else the process working directory. */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link readLocaleFileSnapshot}. Every field has a working default. */
export interface ReadLocaleFileSnapshotDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * Reads one locale file as a per-key content hash. Together with {@link diffLocaleSnapshots} this
 * is the building block for a live-refresh watcher: hold a snapshot, re-read on a file event, and
 * compare the two to learn what actually changed.
 *
 * A locale file that does not exist yet reads as an empty snapshot rather than an error, so a
 * watcher can start before the first translation run has written anything.
 *
 * Note that this entry point does not validate the locale against the configured targets, and that
 * a malformed target file surfaces the adapter's own error and code rather than a wrapped
 * {@link SdkError}, because no source-file contract is being asserted here. Its message names the
 * offending locale and the resolved path.
 *
 * @param input - The config and the locale to snapshot.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The locale's per-key content hashes.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 */
export async function readLocaleFileSnapshot(
  input: ReadLocaleFileSnapshotInput,
  deps: ReadLocaleFileSnapshotDeps = {},
): Promise<LocaleFileSnapshot> {
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(input.config.format, deps.adapterRegistry, deps.fs);
  const resource = await readTarget(cwd, input.config, adapter, fs, input.locale);
  const hashes = new Map<string, string>();
  for (const [key, entry] of resource.entries) {
    hashes.set(key, contentHash(entry));
  }
  return { locale: input.locale, hashes };
}

/** How many keys were added, changed, and removed between two {@link LocaleFileSnapshot}s. */
export interface LocaleSnapshotDelta {
  /** Keys present in the current snapshot but not the previous one. */
  readonly added: number;
  /** Keys present in both snapshots whose content hash differs. */
  readonly changed: number;
  /** Keys present in the previous snapshot but not the current one. */
  readonly removed: number;
}

/**
 * Compares two {@link LocaleFileSnapshot}s and counts what moved. It is pure, synchronous, and
 * touches no file system, so a watcher can call it on every file event without cost.
 *
 * The two snapshots are compared by key and content hash alone; neither the locale names nor the
 * order are consulted, so passing snapshots of two different locales compares them rather than
 * failing.
 *
 * @param previous - The earlier snapshot.
 * @param current - The later snapshot.
 * @returns The added, changed, and removed key counts.
 */
export function diffLocaleSnapshots(
  previous: LocaleFileSnapshot,
  current: LocaleFileSnapshot,
): LocaleSnapshotDelta {
  let added = 0;
  let changed = 0;
  for (const [key, hash] of current.hashes) {
    const previousHash = previous.hashes.get(key);
    if (previousHash === undefined) {
      added += 1;
    } else if (previousHash !== hash) {
      changed += 1;
    }
  }
  let removed = 0;
  for (const key of previous.hashes.keys()) {
    if (!current.hashes.has(key)) {
      removed += 1;
    }
  }
  return { added, changed, removed };
}
