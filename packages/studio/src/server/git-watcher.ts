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
}

export interface GitWatcher {
  readonly refresh: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function directoriesOf(files: readonly string[]): readonly string[] {
  return Array.from(new Set(files.map((file) => dirname(file))));
}

export async function createGitWatcher(options: GitWatcherOptions): Promise<GitWatcher> {
  let watcher: StudioWatcher | undefined;
  let watchedKey: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let queue: Promise<void> = Promise.resolve();

  function enqueue(announce: boolean): Promise<void> {
    queue = queue.then(() => refresh(announce));
    return queue;
  }

  async function stopWatching(): Promise<void> {
    const old = watcher;
    watcher = undefined;
    watchedKey = undefined;
    await old?.close();
  }

  function startPolling(): void {
    if (timer === undefined && !closed) {
      timer = setInterval(() => {
        void enqueue(true);
      }, options.pollMs);
      timer.unref();
    }
  }

  function stopPolling(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  async function refresh(announce = false): Promise<void> {
    const resolved = await options.resolvePaths().catch(() => ({ available: false as const }));
    if (closed) {
      return;
    }
    if (!resolved.available) {
      await stopWatching();
      startPolling();
      return;
    }
    stopPolling();
    const key = resolved.paths.join("\n");
    if (key === watchedKey) {
      return;
    }
    await stopWatching();
    watchedKey = key;
    watcher = options.createWatcher(directoriesOf(resolved.paths), { only: resolved.paths });
    watcher.onChange(options.onChange);
    if (announce) {
      options.onChange();
    }
  }

  await enqueue(false);

  return {
    refresh: () => enqueue(false),
    async close(): Promise<void> {
      closed = true;
      stopPolling();
      await stopWatching();
    },
  };
}
