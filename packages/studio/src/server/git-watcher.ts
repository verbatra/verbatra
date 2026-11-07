import { access } from "node:fs/promises";
import { dirname } from "node:path";
import type { CreateStudioWatcher, StudioWatcher } from "./types.js";

export type GitWatchPaths =
  | { readonly available: false }
  | { readonly available: true; readonly paths: readonly string[] };

export interface GitWatcherOptions {
  readonly resolvePaths: () => Promise<GitWatchPaths>;
  readonly createWatcher: CreateStudioWatcher;
  readonly onChange: () => void;
  readonly pollMs: number;
  readonly idlePollMs?: number;
  readonly exists?: (path: string) => Promise<boolean>;
}

export interface GitWatcher {
  readonly refresh: () => Promise<void>;
  readonly close: () => Promise<void>;
}

const DEFAULT_IDLE_POLL_FACTOR = 6;
const MAX_BACKOFF_MS = 30_000;

function directoriesOf(files: readonly string[]): readonly string[] {
  return Array.from(new Set(files.map((file) => dirname(file))));
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export async function createGitWatcher(options: GitWatcherOptions): Promise<GitWatcher> {
  const exists = options.exists ?? pathExists;
  const idlePollMs = options.idlePollMs ?? options.pollMs * DEFAULT_IDLE_POLL_FACTOR;
  let watcher: StudioWatcher | undefined;
  let watchedKey: string | undefined;
  let lastKey: string | undefined;
  let failures = 0;
  let recovering = false;
  let announcedSinceHealthy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let queue: Promise<void> = Promise.resolve();

  function enqueue(task: () => Promise<void>): Promise<void> {
    queue = queue.then(task).catch(() => undefined);
    return queue;
  }

  async function stopWatching(): Promise<void> {
    const old = watcher;
    watcher = undefined;
    watchedKey = undefined;
    await old?.close().catch(() => undefined);
  }

  function schedule(ms: number): void {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    if (closed) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void enqueue(() => refresh(true));
    }, ms);
    timer.unref();
  }

  function noteFailure(): void {
    failures += 1;
    if (!announcedSinceHealthy) {
      recovering = true;
    }
  }

  function retryLater(): void {
    schedule(Math.min(options.pollMs * 2 ** (failures - 1), MAX_BACKOFF_MS));
  }

  function noteHealthy(): void {
    failures = 0;
    recovering = false;
    announcedSinceHealthy = false;
  }

  async function failWatching(): Promise<void> {
    if (closed) {
      return;
    }
    noteFailure();
    await stopWatching();
    retryLater();
  }

  async function lookUp(): Promise<GitWatchPaths> {
    return options.resolvePaths().catch((): GitWatchPaths => ({ available: false }));
  }

  async function arm(paths: readonly string[], announce: boolean): Promise<void> {
    const present = await Promise.all(directoriesOf(paths).map((path) => exists(path)));
    const directories = directoriesOf(paths).filter((_, index) => present[index] === true);
    const key = `${paths.join("\n")}\n--\n${directories.join("\n")}`;
    if (key === watchedKey) {
      noteHealthy();
      schedule(idlePollMs);
      return;
    }
    await stopWatching();
    if (closed) {
      return;
    }
    const self: { current?: StudioWatcher } = {};
    try {
      const built = options.createWatcher(directories, {
        only: paths,
        onError: () => {
          if (watcher === self.current) {
            void enqueue(failWatching);
          }
        },
      });
      self.current = built;
      watcher = built;
      watchedKey = key;
      built.onChange(options.onChange);
    } catch {
      noteFailure();
      await stopWatching();
      retryLater();
      return;
    }
    const changed = key !== lastKey;
    lastKey = key;
    if (announce && (changed || recovering)) {
      if (recovering) {
        recovering = false;
        announcedSinceHealthy = true;
      }
      options.onChange();
    }
    schedule(idlePollMs);
  }

  async function refresh(announce: boolean): Promise<void> {
    if (closed) {
      return;
    }
    const resolved = await lookUp();
    if (closed) {
      return;
    }
    if (!resolved.available) {
      noteFailure();
      await stopWatching();
      retryLater();
      return;
    }
    await arm(resolved.paths, announce);
  }

  await enqueue(() => refresh(false));

  return {
    refresh: () => enqueue(() => refresh(false)),
    async close(): Promise<void> {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      await queue;
      await stopWatching();
    },
  };
}
