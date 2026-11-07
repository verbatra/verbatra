import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  diffLocaleSnapshots,
  LOCK_FILE_NAME,
  type LocaleFileSnapshot,
  type LocaleSnapshotDelta,
  localeWatchPaths,
  PROVENANCE_FILE_NAME,
  type ReadLocaleFileSnapshotDeps,
  readLocaleFileSnapshot,
  type SdkFs,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { watch as chokidarWatch } from "chokidar";
import type { RefreshEvent, RefreshReason } from "../shared/sse-events.js";
import { createGitWatcher } from "./git-watcher.js";
import type {
  CreateStudioWatcher,
  ExecFileImpl,
  StudioWatcher,
  StudioWatcherOptions,
} from "./types.js";

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_GIT_POLL_MS = 5000;

interface WatchedEntry {
  readonly reason: RefreshReason;
  readonly paths: readonly string[];
  readonly locale?: string;
}

function watchedEntries(
  config: VerbatraConfig,
  projectRoot: string,
  glossaryPath: string | undefined,
  locales: readonly { readonly locale: string; readonly paths: readonly string[] }[],
): readonly WatchedEntry[] {
  const localeEntries: WatchedEntry[] = locales.map(({ locale, paths }) => ({
    reason: locale === config.sourceLocale ? "source" : "targets",
    paths,
    locale,
  }));
  const lock = resolve(projectRoot, LOCK_FILE_NAME);

  return [
    ...localeEntries,
    { reason: "lock", paths: [lock] },
    { reason: "lock", paths: [resolve(projectRoot, PROVENANCE_FILE_NAME)] },
    ...(glossaryPath === undefined ? [] : [{ reason: "lock" as const, paths: [glossaryPath] }]),
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
  readonly glossaryPath?: string;
  readonly debounceMs?: number;
}

export interface ProjectWatcherDeps {
  readonly createWatcher: CreateStudioWatcher;
  readonly adapterRegistry?: NonNullable<ReadLocaleFileSnapshotDeps["adapterRegistry"]>;
  readonly fs?: SdkFs;
  readonly execFile?: ExecFileImpl;
  readonly readLocaleSnapshot?: ReadLocaleSnapshot;
  readonly readFileIdentity?: ReadFileIdentity;
  readonly gitPollMs?: number;
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
  const watch = await localeWatchPaths(
    { config: input.config, cwd: input.projectRoot },
    deps.execFile !== undefined ? { execFile: deps.execFile } : {},
  );
  const primed = await Promise.all(
    watchedEntries(input.config, input.projectRoot, input.glossaryPath, watch.locales).map(
      (entry) => primeEntry(entry, readSnapshot),
    ),
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

  const gitDebounced = createDebouncedTrigger(
    async () => {
      void gitWatcher?.refresh();
      return { reason: "git", at: new Date().toISOString() };
    },
    debounceMs,
    emit,
  );
  const gitWatcher = await createGitWatcher({
    resolvePaths: async () => {
      const found = await localeWatchPaths(
        { config: input.config, cwd: input.projectRoot },
        deps.execFile !== undefined ? { execFile: deps.execFile } : {},
      );
      return found.git;
    },
    createWatcher: deps.createWatcher,
    onChange: gitDebounced.trigger,
    pollMs: deps.gitPollMs ?? DEFAULT_GIT_POLL_MS,
  });

  return {
    onRefresh(listener: (event: RefreshEvent) => void): void {
      listeners.add(listener);
    },
    async close(): Promise<void> {
      for (const entry of entries) {
        entry.debounced.clear();
      }
      gitDebounced.clear();
      await Promise.all([gitWatcher.close(), ...entries.map((entry) => entry.watcher.close())]);
    },
  };
}

function onlyThese(
  paths: readonly string[],
  options: StudioWatcherOptions,
): { readonly depth: number; readonly ignored: (path: string) => boolean } | undefined {
  if (options.only === undefined) {
    return undefined;
  }
  const files = new Set(options.only);
  const directories = new Set(paths);
  return { depth: 0, ignored: (path) => !files.has(path) && !directories.has(path) };
}

export const defaultCreateStudioWatcher: CreateStudioWatcher = (
  paths,
  options = {},
): StudioWatcher => {
  const fsWatcher = chokidarWatch([...paths], {
    persistent: true,
    ignoreInitial: true,
    ...onlyThese(paths, options),
  });
  return {
    onChange(listener: () => void): void {
      fsWatcher.on("change", () => listener());
      fsWatcher.on("add", () => listener());
      fsWatcher.on("unlink", () => listener());
    },
    close: () => fsWatcher.close(),
  };
};
