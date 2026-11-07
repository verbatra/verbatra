import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitWatcher, type GitWatchPaths } from "./git-watcher.js";
import type { CreateStudioWatcher, StudioWatcher } from "./types.js";

interface Built {
  readonly paths: readonly string[];
  readonly only: readonly string[] | undefined;
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

afterEach(() => {
  vi.useRealTimers();
});

describe("createGitWatcher", () => {
  it("watches the directories of the files and reports only the files", async () => {
    const { createWatcher, built } = harness();

    await createGitWatcher({
      resolvePaths: async () => HERE,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });

    expect(built).toHaveLength(1);
    expect(built[0]?.paths).toEqual(["/r/.git", "/r/.git/logs"]);
    expect(built[0]?.only).toEqual(HERE.available ? HERE.paths : []);
  });

  it("forwards every change of the watcher", async () => {
    const { createWatcher, built } = harness();
    const onChange = vi.fn();
    await createGitWatcher({
      resolvePaths: async () => HERE,
      createWatcher,
      onChange,
      pollMs: 1000,
    });

    built[0]?.fire();
    built[0]?.fire();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("builds no watcher outside a repository, and none from a failed lookup", async () => {
    const { createWatcher, built } = harness();

    await createGitWatcher({
      resolvePaths: async () => ({ available: false }),
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });
    await createGitWatcher({
      resolvePaths: async () => {
        throw new Error("git exploded");
      },
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });

    expect(built).toHaveLength(0);
  });

  it("keeps the watcher when a refresh finds the same files", async () => {
    const { createWatcher, built } = harness();
    const watcher = await createGitWatcher({
      resolvePaths: async () => HERE,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });

    await watcher.refresh();
    await watcher.refresh();

    expect(built).toHaveLength(1);
    expect(built[0]?.closed).toBe(false);
  });

  it("replaces the watcher when the files move, for example after a branch switch in a linked work tree", async () => {
    const { createWatcher, built } = harness();
    let current: GitWatchPaths = HERE;
    const watcher = await createGitWatcher({
      resolvePaths: async () => current,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });

    current = { available: true, paths: ["/w/index", "/w/HEAD", "/w/logs/HEAD"] };
    await watcher.refresh();

    expect(built).toHaveLength(2);
    expect(built[0]?.closed).toBe(true);
    expect(built[1]?.paths).toEqual(["/w", "/w/logs"]);
  });

  it("drops the watcher when the repository goes away and polls until it returns", async () => {
    vi.useFakeTimers();
    const { createWatcher, built } = harness();
    const onChange = vi.fn();
    let current: GitWatchPaths = HERE;
    const watcher = await createGitWatcher({
      resolvePaths: async () => current,
      createWatcher,
      onChange,
      pollMs: 1000,
    });

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

  it("stops polling once the repository is back", async () => {
    vi.useFakeTimers();
    const { createWatcher } = harness();
    const resolvePaths = vi.fn(async (): Promise<GitWatchPaths> => ({ available: false }));
    const watcher = await createGitWatcher({
      resolvePaths,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });

    resolvePaths.mockResolvedValue(HERE);
    await vi.advanceTimersByTimeAsync(1000);
    const calls = resolvePaths.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    expect(resolvePaths.mock.calls.length).toBe(calls);
    await watcher.close();
  });

  it("closes its watcher and its timer", async () => {
    vi.useFakeTimers();
    const { createWatcher, built } = harness();
    const resolvePaths = vi.fn(async (): Promise<GitWatchPaths> => ({ available: false }));
    const gone = await createGitWatcher({
      resolvePaths,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });
    await gone.close();
    const calls = resolvePaths.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    const here = await createGitWatcher({
      resolvePaths: async () => HERE,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });
    await here.close();

    expect(resolvePaths.mock.calls.length).toBe(calls);
    expect(built[0]?.closed).toBe(true);
  });

  it("builds nothing for a lookup that finishes after close", async () => {
    const { createWatcher, built } = harness();
    let release: (value: GitWatchPaths) => void = () => {};
    const slow = new Promise<GitWatchPaths>((resolve) => {
      release = resolve;
    });
    const pending = createGitWatcher({
      resolvePaths: () => slow,
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });
    release(HERE);
    const watcher = await pending;
    await watcher.close();
    await watcher.refresh();

    expect(built.every((entry) => entry.closed)).toBe(true);
  });

  it("runs lookups one after another", async () => {
    const { createWatcher } = harness();
    let active = 0;
    let peak = 0;
    const watcher = await createGitWatcher({
      resolvePaths: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return HERE;
      },
      createWatcher,
      onChange: () => {},
      pollMs: 1000,
    });

    await Promise.all([watcher.refresh(), watcher.refresh(), watcher.refresh()]);

    expect(peak).toBe(1);
  });
});
