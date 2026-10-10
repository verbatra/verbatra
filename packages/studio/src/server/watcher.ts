import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createLocalePathResolver,
  diffLocaleSnapshots,
  LOCK_FILE_NAME,
  type LocaleFileSnapshot,
  type LocaleSnapshotDelta,
  PROVENANCE_FILE_NAME,
  type ReadLocaleFileSnapshotDeps,
  readLocaleFileSnapshot,
  type SdkFs,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { watch as chokidarWatch } from "chokidar";
import type { RefreshEvent, RefreshReason } from "../shared/sse-events.js";
import type { CreateStudioWatcher, StudioWatcher } from "./types.js";

const DEFAULT_DEBOUNCE_MS = 300;

interface WatchedEntry {
  readonly reason: RefreshReason;
  readonly paths: readonly string[];
  readonly locale?: string;
}

function watchedEntries(config: VerbatraConfig, projectRoot: string): readonly WatchedEntry[] {
  const resolver = createLocalePathResolver(projectRoot, config);
  const source = resolver.pathFor(config.sourceLocale);
  const targets: WatchedEntry[] = config.targetLocales.map((locale) => ({
    reason: "targets",
    paths: [resolver.pathFor(locale)],
    locale,
  }));
  const lock = resolve(projectRoot, LOCK_FILE_NAME);

  return [
    { reason: "source", paths: [source], locale: config.sourceLocale },
    ...targets,
    { reason: "lock", paths: [lock] },
    { reason: "lock", paths: [resolve(projectRoot, PROVENANCE_FILE_NAME)] },
  ];
}

type ReadLocaleSnapshot = (locale: string) => Promise<LocaleFileSnapshot>;

function createSnapshotTracker(
  initial: LocaleFileSnapshot,
  readSnapshot: () => Promise<LocaleFileSnapshot>,
): { readonly settle: () => Promise<LocaleSnapshotDelta> } {
  let previous = initial;
  let tail: Promise<void> = Promise.resolve();

  function settle(): Promise<LocaleSnapshotDelta> {
    const attempt = tail.then(async () => {
      const current = await readSnapshot();
      const delta = diffLocaleSnapshots(previous, current);
      previous = current;
      return delta;
    });
    tail = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt;
  }

  return { settle };
}

type SnapshotTracker = ReturnType<typeof createSnapshotTracker>;

async function buildRefreshEvent(
  entry: WatchedEntry,
  tracker: SnapshotTracker | undefined,
): Promise<RefreshEvent> {
  const at = new Date().toISOString();
  if (tracker === undefined || entry.locale === undefined) {
    return { reason: entry.reason, at };
  }
  try {
    const delta = await tracker.settle();
    return { reason: entry.reason, at, locale: entry.locale, delta };
  } catch {
    return { reason: entry.reason, at };
  }
}

export type ReadFileIdentity = (path: string) => Promise<string | undefined>;

const readFileIdentityFromDisk: ReadFileIdentity = async (path) => {
  try {
    const info = await stat(path);
    return `${info.ino}:${info.size}:${info.mtimeMs}`;
  } catch {
    return undefined;
  }
};

function createIdentityGate(
  paths: readonly string[],
  readIdentity: ReadFileIdentity,
): { readonly admit: () => Promise<boolean> } {
  let lastEmitted: string | undefined;
  let tail: Promise<void> = Promise.resolve();

  async function readEntryIdentity(): Promise<string | undefined> {
    try {
      const tokens = await Promise.all(paths.map((path) => readIdentity(path)));
      return tokens.every((token) => token !== undefined) ? tokens.join("|") : undefined;
    } catch {
      return undefined;
    }
  }

  function admit(): Promise<boolean> {
    const attempt = tail.then(async () => {
      const current = await readEntryIdentity();
      const duplicate = current !== undefined && current === lastEmitted;
      lastEmitted = current;
      return !duplicate;
    });
    tail = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt;
  }

  return { admit };
}

type IdentityGate = ReturnType<typeof createIdentityGate>;

async function settleTrigger(
  entry: WatchedEntry,
  tracker: SnapshotTracker | undefined,
  gate: IdentityGate | undefined,
): Promise<RefreshEvent | undefined> {
  if (gate !== undefined && !(await gate.admit())) {
    return undefined;
  }
  return buildRefreshEvent(entry, tracker);
}

function createDebouncedTrigger(
  settle: () => Promise<RefreshEvent | undefined>,
  debounceMs: number,
  emit: (event: RefreshEvent) => void,
): { readonly trigger: () => void; readonly clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        void settle().then((event) => {
          if (event !== undefined) {
            emit(event);
          }
        });
      }, debounceMs);
    },
    clear(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

export interface ProjectWatcherInput {
  readonly config: VerbatraConfig;
  readonly projectRoot: string;
  readonly debounceMs?: number;
}

export interface ProjectWatcherDeps {
  readonly createWatcher: CreateStudioWatcher;
  readonly adapterRegistry?: NonNullable<ReadLocaleFileSnapshotDeps["adapterRegistry"]>;
  readonly fs?: SdkFs;
  readonly readLocaleSnapshot?: ReadLocaleSnapshot;
  readonly readFileIdentity?: ReadFileIdentity;
}

export interface ProjectWatcher {
  onRefresh(listener: (event: RefreshEvent) => void): void;
  close(): Promise<void>;
}

function buildReadLocaleSnapshot(
  input: ProjectWatcherInput,
  deps: ProjectWatcherDeps,
): ReadLocaleSnapshot {
  if (deps.readLocaleSnapshot !== undefined) {
    return deps.readLocaleSnapshot;
  }
  const snapshotDeps: ReadLocaleFileSnapshotDeps = {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
  return (locale) =>
    readLocaleFileSnapshot({ config: input.config, locale, cwd: input.projectRoot }, snapshotDeps);
}

async function primeEntry(
  entry: WatchedEntry,
  readSnapshot: ReadLocaleSnapshot,
): Promise<{ readonly entry: WatchedEntry; readonly tracker: SnapshotTracker | undefined }> {
  if (entry.locale === undefined) {
    return { entry, tracker: undefined };
  }
  const locale = entry.locale;
  const read = (): Promise<LocaleFileSnapshot> => readSnapshot(locale);
  const initial = await readInitialSnapshot(locale, read);
  return { entry, tracker: createSnapshotTracker(initial, read) };
}

async function readInitialSnapshot(
  locale: string,
  read: () => Promise<LocaleFileSnapshot>,
): Promise<LocaleFileSnapshot> {
  try {
    return await read();
  } catch {
    return { locale, hashes: new Map() };
  }
}

export async function createProjectWatcher(
  input: ProjectWatcherInput,
  deps: ProjectWatcherDeps,
): Promise<ProjectWatcher> {
  const debounceMs = input.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const listeners = new Set<(event: RefreshEvent) => void>();

  function emit(event: RefreshEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  const readSnapshot = buildReadLocaleSnapshot(input, deps);
  const primed = await Promise.all(
    watchedEntries(input.config, input.projectRoot).map((entry) => primeEntry(entry, readSnapshot)),
  );

  const readIdentity = deps.readFileIdentity ?? readFileIdentityFromDisk;

  const entries = primed.map(({ entry, tracker }) => {
    const gate = tracker === undefined ? createIdentityGate(entry.paths, readIdentity) : undefined;
    const debounced = createDebouncedTrigger(
      () => settleTrigger(entry, tracker, gate),
      debounceMs,
      emit,
    );
    const watcher = deps.createWatcher(entry.paths);
    watcher.onChange(debounced.trigger);
    return { debounced, watcher };
  });

  return {
    onRefresh(listener: (event: RefreshEvent) => void): void {
      listeners.add(listener);
    },
    async close(): Promise<void> {
      for (const entry of entries) {
        entry.debounced.clear();
      }
      await Promise.all(entries.map((entry) => entry.watcher.close()));
    },
  };
}

export const defaultCreateStudioWatcher: CreateStudioWatcher = (paths): StudioWatcher => {
  const fsWatcher = chokidarWatch([...paths], { persistent: true, ignoreInitial: true });
  return {
    onChange(listener: () => void): void {
      fsWatcher.on("change", () => listener());
      fsWatcher.on("add", () => listener());
    },
    close: () => fsWatcher.close(),
  };
};
