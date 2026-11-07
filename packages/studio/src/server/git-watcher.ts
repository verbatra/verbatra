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

  async function failWatching(): Promise<void> {
    if (closed) {
      return;
    }
    await stopWatching();
    schedule(options.pollMs);
  }

  async function lookUp(): Promise<GitWatchPaths> {
    return options.resolvePaths().catch((): GitWatchPaths => ({ available: false }));
  }

  async function arm(paths: readonly string[], announce: boolean): Promise<void> {
    const present = await Promise.all(directoriesOf(paths).map((path) => exists(path)));
    const directories = directoriesOf(paths).filter((_, index) => present[index] === true);
    const key = `${paths.join("\n")}\n--\n${directories.join("\n")}`;
    if (key === watchedKey) {
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
      await stopWatching();
      schedule(options.pollMs);
      return;
    }
    if (announce) {
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
      await stopWatching();
      schedule(options.pollMs);
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
