import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitWatcher, type GitWatchPaths } from "./git-watcher.js";
import type { CreateStudioWatcher, StudioWatcher } from "./types.js";

interface Built {
  readonly paths: readonly string[];
  readonly only: readonly string[] | undefined;
  readonly fail: () => void;
  closed: boolean;
  fire(): void;
}

function harness(): { readonly createWatcher: CreateStudioWatcher; readonly built: Built[] } {
  const built: Built[] = [];
  const createWatcher: CreateStudioWatcher = (paths, options): StudioWatcher => {
    let listener: (() => void) | undefined;
    const entry: Built = {
      paths,
      only: options?.only,
      fail: () => options?.onError?.(new Error("EACCES")),
      closed: false,
      fire: () => listener?.(),
    };
    built.push(entry);
    return {
      onChange: (next) => {
        listener = next;
      },
      close: async () => {
        entry.closed = true;
      },
    };
  };
  return { createWatcher, built };
}

const HERE: GitWatchPaths = {
  available: true,
  paths: ["/r/.git/index", "/r/.git/HEAD", "/r/.git/logs/HEAD"],
};

const ALL_EXIST = async (): Promise<boolean> => true;

function options(
  overrides: Partial<Parameters<typeof createGitWatcher>[0]> & {
    readonly createWatcher: CreateStudioWatcher;
  },
): Parameters<typeof createGitWatcher>[0] {
  return {
    resolvePaths: async () => HERE,
    onChange: () => {},
    pollMs: 1000,
    idlePollMs: 30_000,
    exists: ALL_EXIST,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createGitWatcher", () => {
  it("watches the directories of the files and reports only the files", async () => {
    const { createWatcher, built } = harness();

    await createGitWatcher(options({ createWatcher }));

    expect(built).toHaveLength(1);
    expect(built[0]?.paths).toEqual(["/r/.git", "/r/.git/logs"]);
    expect(built[0]?.only).toEqual(HERE.available ? HERE.paths : []);
  });

  it("forwards every change of the watcher", async () => {
    const { createWatcher, built } = harness();
    const onChange = vi.fn();
    await createGitWatcher(options({ createWatcher, onChange }));

    built[0]?.fire();
    built[0]?.fire();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("builds no watcher outside a repository, and none from a failed lookup", async () => {
    const { createWatcher, built } = harness();

    const outside = await createGitWatcher(
      options({ createWatcher, resolvePaths: async () => ({ available: false }) }),
    );
    const failing = await createGitWatcher(
      options({
        createWatcher,
        resolvePaths: async () => {
          throw new Error("git exploded");
        },
      }),
    );

    expect(built).toHaveLength(0);
    await outside.close();
    await failing.close();
  });

  it("keeps the watcher when a refresh finds the same files", async () => {
    const { createWatcher, built } = harness();
    const watcher = await createGitWatcher(options({ createWatcher }));

    await watcher.refresh();
    await watcher.refresh();

    expect(built).toHaveLength(1);
    expect(built[0]?.closed).toBe(false);
  });

  it("replaces the watcher when the files move", async () => {
    const { createWatcher, built } = harness();
    let current: GitWatchPaths = HERE;
    const watcher = await createGitWatcher(
      options({ createWatcher, resolvePaths: async () => current }),
    );

    current = { available: true, paths: ["/w/index", "/w/HEAD", "/w/logs/HEAD"] };
    await watcher.refresh();

    expect(built).toHaveLength(2);
    expect(built[0]?.closed).toBe(true);
    expect(built[1]?.paths).toEqual(["/w", "/w/logs"]);
  });

  it("watches only the directories that exist and arms the logs directory when it appears", async () => {
    const { createWatcher, built } = harness();
    let logsExist = false;
    const watcher = await createGitWatcher(
      options({ createWatcher, exists: async (path) => logsExist || !path.endsWith("logs") }),
    );
    expect(built[0]?.paths).toEqual(["/r/.git"]);

    await watcher.refresh();
    expect(built).toHaveLength(1);

    logsExist = true;
    await watcher.refresh();

    expect(built).toHaveLength(2);
    expect(built[0]?.closed).toBe(true);
    expect(built[1]?.paths).toEqual(["/r/.git", "/r/.git/logs"]);
  });

  it("drops the watcher when the repository goes away and polls until it returns", async () => {
    vi.useFakeTimers();
    const { createWatcher, built } = harness();
    const onChange = vi.fn();
    let current: GitWatchPaths = HERE;
    const watcher = await createGitWatcher(
      options({ createWatcher, onChange, resolvePaths: async () => current }),
    );

    current = { available: false };
    await watcher.refresh();
    expect(built[0]?.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(built).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();

    current = HERE;
    await vi.advanceTimersByTimeAsync(1000);

    expect(built).toHaveLength(2);
    expect(built[1]?.closed).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    await watcher.close();
  });

  it("looks again while watching, so a nested repository that moved away and came back is found", async () => {
    vi.useFakeTimers();
    const { createWatcher, built } = harness();
    const onChange = vi.fn();
    const inner: GitWatchPaths = {
      available: true,
      paths: ["/r/app/.git/index", "/r/app/.git/HEAD", "/r/app/.git/logs/HEAD"],
    };
    let current: GitWatchPaths = inner;
    const watcher = await createGitWatcher(
      options({
        createWatcher,
        onChange,
        idlePollMs: 5000,
        resolvePaths: async () => current,
      }),
    );

    current = HERE;
    await vi.advanceTimersByTimeAsync(5000);
    expect(built).toHaveLength(2);
    expect(built[1]?.paths).toEqual(["/r/.git", "/r/.git/logs"]);

    current = inner;
    await vi.advanceTimersByTimeAsync(5000);

    expect(built).toHaveLength(3);
    expect(built[2]?.paths).toEqual(["/r/app/.git", "/r/app/.git/logs"]);
    expect(onChange).toHaveBeenCalledTimes(2);
    await watcher.close();
  });

  it("looks again no more often than the idle interval while nothing moves", async () => {
    vi.useFakeTimers();
    const { createWatcher } = harness();
    const resolvePaths = vi.fn(async (): Promise<GitWatchPaths> => HERE);
    const watcher = await createGitWatcher(
      options({ createWatcher, resolvePaths, idlePollMs: 5000 }),
    );

    await vi.advanceTimersByTimeAsync(24_000);

    expect(resolvePaths.mock.calls.length).toBe(1 + 4);
    await watcher.close();
  });

  it("never runs two lookups at once, however slow git is", async () => {
    vi.useFakeTimers();
    const { createWatcher } = harness();
    let active = 0;
    let peak = 0;
    let calls = 0;
    const starting = createGitWatcher(
      options({
        createWatcher,
        resolvePaths: async () => {
          calls += 1;
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 4000));
          active -= 1;
          return { available: false };
        },
        pollMs: 1000,
      }),
    );

    await vi.advanceTimersByTimeAsync(30_000);
    const watcher = await starting;

    expect(peak).toBe(1);
    expect(calls).toBeLessThanOrEqual(8);
    const closing = watcher.close();
    await vi.advanceTimersByTimeAsync(5000);
    await closing;
  });

  it("closes its watcher and runs no lookup after close", async () => {
    vi.useFakeTimers();
    const { createWatcher, built } = harness();
    const resolvePaths = vi.fn(async (): Promise<GitWatchPaths> => HERE);
    const watcher = await createGitWatcher(
      options({ createWatcher, resolvePaths, idlePollMs: 1000 }),
    );
    await watcher.close();
    const calls = resolvePaths.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10_000);
    await watcher.refresh();

    expect(resolvePaths.mock.calls.length).toBe(calls);
    expect(built[0]?.closed).toBe(true);
  });

  it("builds nothing for a lookup that finishes after close", async () => {
    const { createWatcher, built } = harness();
    let release: (value: GitWatchPaths) => void = () => {};
    const slow = new Promise<GitWatchPaths>((resolve) => {
      release = resolve;
    });
    const pending = createGitWatcher(options({ createWatcher, resolvePaths: () => slow }));
    release(HERE);
    const watcher = await pending;
    await watcher.close();
    await watcher.refresh();

    expect(built.every((entry) => entry.closed)).toBe(true);
  });

  it("leaves no watcher open when close races a move", async () => {
    const { createWatcher, built } = harness();
    let current: GitWatchPaths = HERE;
    let releaseStop: () => void = () => {};
    const slowClose: CreateStudioWatcher = (paths, opts) => {
      const real = createWatcher(paths, opts);
      return {
        onChange: real.onChange,
        close: async () => {
          await new Promise<void>((resolve) => {
            releaseStop = resolve;
          });
          await real.close();
        },
      };
    };
    const watcher = await createGitWatcher(
      options({ createWatcher: slowClose, resolvePaths: async () => current }),
    );

    current = { available: true, paths: ["/w/index", "/w/HEAD", "/w/logs/HEAD"] };
    const moving = watcher.refresh();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const closing = watcher.close();
    releaseStop();
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseStop();
    await Promise.all([moving, closing]);

    expect(built.every((entry) => entry.closed)).toBe(true);
  });

  it("keeps serving lookups after a watcher cannot be built, and surfaces no rejection", async () => {
    const { createWatcher, built } = harness();
    let failBuild = true;
    const flaky: CreateStudioWatcher = (paths, opts) => {
      if (failBuild) {
        throw new Error("watch failed");
      }
      return createWatcher(paths, opts);
    };
    const watcher = await createGitWatcher(options({ createWatcher: flaky }));
    expect(built).toHaveLength(0);

    failBuild = false;
    await watcher.refresh();

    expect(built).toHaveLength(1);
    await watcher.close();
  });

  it("survives a watcher whose close rejects", async () => {
    const { createWatcher } = harness();
    let current: GitWatchPaths = HERE;
    const rejecting: CreateStudioWatcher = (paths, opts) => ({
      onChange: createWatcher(paths, opts).onChange,
      close: () => Promise.reject(new Error("close failed")),
    });
    const watcher = await createGitWatcher(
      options({ createWatcher: rejecting, resolvePaths: async () => current }),
    );

    current = { available: true, paths: ["/w/index", "/w/HEAD", "/w/logs/HEAD"] };
    await expect(watcher.refresh()).resolves.toBeUndefined();
    await expect(watcher.close()).resolves.toBeUndefined();
  });

  it("degrades to polling when the watcher reports an error, and watches again later", async () => {
    vi.useFakeTimers();
    const { createWatcher, built } = harness();
    const onChange = vi.fn();
    const watcher = await createGitWatcher(options({ createWatcher, onChange }));

    built[0]?.fail();
    await vi.advanceTimersByTimeAsync(10);
    expect(built[0]?.closed).toBe(true);
    expect(built).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(built).toHaveLength(2);
    expect(built[1]?.closed).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    await watcher.close();
  });

  it("ignores an error from a watcher that has already been replaced", async () => {
    const { createWatcher, built } = harness();
    let current: GitWatchPaths = HERE;
    const watcher = await createGitWatcher(
      options({ createWatcher, resolvePaths: async () => current }),
    );
    const old = built[0];
    current = { available: true, paths: ["/w/index", "/w/HEAD", "/w/logs/HEAD"] };
    await watcher.refresh();

    old?.fail();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(built[1]?.closed).toBe(false);
    await watcher.close();
  });
});
