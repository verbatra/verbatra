import { execFile as execFileCb } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { RefreshEvent } from "../shared/sse-events.js";
import { baseStudioConfig } from "./test-support.js";
import type { CreateStudioWatcher, StudioWatcher } from "./types.js";
import { createProjectWatcher, defaultCreateStudioWatcher } from "./watcher.js";

const execFileAsync = promisify(execFileCb);

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd },
  );
}

async function repo(options: { init?: boolean } = {}): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "verbatra-watch-")));
  roots.push(root);
  await mkdir(join(root, "locales"), { recursive: true });
  await writeFile(join(root, "locales", "en.json"), '{"a":"A"}\n');
  await writeFile(join(root, "locales", "de.json"), '{"a":"a"}\n');
  if (options.init !== false) {
    await git(root, "init", "-q", "-b", "main");
    await git(root, "add", "-A");
    await git(root, "commit", "-q", "-m", "first");
  }
  return root;
}

interface WatcherCall {
  readonly paths: readonly string[];
  readonly only: readonly string[] | undefined;
  listener?: () => void;
  closed: boolean;
}

function harness(): {
  readonly createWatcher: CreateStudioWatcher;
  readonly calls: WatcherCall[];
} {
  const calls: WatcherCall[] = [];
  const createWatcher: CreateStudioWatcher = (paths, options): StudioWatcher => {
    const call: WatcherCall = { paths, only: options?.only, closed: false };
    calls.push(call);
    return {
      onChange: (listener) => {
        call.listener = listener;
      },
      close: async () => {
        call.closed = true;
      },
    };
  };
  return { createWatcher, calls };
}

function gitCalls(calls: readonly WatcherCall[]): WatcherCall[] {
  return calls.filter((call) => call.only !== undefined);
}

async function until(check: () => boolean, ms = 6000): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 50) {
    if (check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

describe("the project watcher and git", () => {
  it("watches the work tree's index, HEAD and HEAD reflog for a project in a repository", async () => {
    const root = await repo();
    const { createWatcher, calls } = harness();

    await createProjectWatcher(
      { config: baseStudioConfig(), projectRoot: root, debounceMs: 5 },
      { createWatcher },
    );

    expect(gitCalls(calls)).toHaveLength(1);
    expect(gitCalls(calls)[0]?.only).toEqual([
      join(root, ".git", "index"),
      join(root, ".git", "HEAD"),
      join(root, ".git", "logs", "HEAD"),
    ]);
    expect(gitCalls(calls)[0]?.paths).toEqual([join(root, ".git"), join(root, ".git", "logs")]);
  });

  it("emits a git refresh, with no locale and no delta, when a git file changes", async () => {
    const root = await repo();
    const { createWatcher, calls } = harness();
    const watcher = await createProjectWatcher(
      { config: baseStudioConfig(), projectRoot: root, debounceMs: 5 },
      { createWatcher },
    );
    const events: RefreshEvent[] = [];
    watcher.onRefresh((event) => events.push(event));

    gitCalls(calls)[0]?.listener?.();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: "git" });
    expect(events[0]).not.toHaveProperty("locale");
    expect(events[0]).not.toHaveProperty("delta");
  });

  it("watches no git file for a project outside a work tree", async () => {
    const root = await repo({ init: false });
    const { createWatcher, calls } = harness();

    await createProjectWatcher(
      { config: baseStudioConfig(), projectRoot: root, debounceMs: 5 },
      { createWatcher },
    );

    expect(gitCalls(calls)).toHaveLength(0);
    expect(calls.flatMap((call) => call.paths).some((path) => path.includes(".git"))).toBe(false);
  });

  it("watches the stringsdict file of an apple-strings locale with its strings file", async () => {
    const root = await repo({ init: false });
    const { createWatcher, calls } = harness();

    await createProjectWatcher(
      {
        config: baseStudioConfig({
          format: "apple-strings",
          files: { pattern: "{locale}.lproj/Localizable.strings" },
        }),
        projectRoot: root,
        debounceMs: 5,
      },
      { createWatcher },
    );

    expect(calls.map((call) => call.paths)).toContainEqual([
      join(root, "de.lproj", "Localizable.strings"),
      join(root, "de.lproj", "Localizable.stringsdict"),
    ]);
  });

  it("stops watching when the repository goes away and watches again when it comes back", async () => {
    const root = await repo();
    const { createWatcher, calls } = harness();
    const watcher = await createProjectWatcher(
      { config: baseStudioConfig(), projectRoot: root, debounceMs: 5 },
      { createWatcher, gitPollMs: 100 },
    );
    const events: RefreshEvent[] = [];
    watcher.onRefresh((event) => events.push(event));
    const first = gitCalls(calls)[0];

    try {
      await rename(join(root, ".git"), join(root, ".git.off"));
      first?.listener?.();
      expect(await until(() => first?.closed === true)).toBe(true);
      expect(gitCalls(calls)).toHaveLength(1);
      const before = events.filter((event) => event.reason === "git").length;

      await rename(join(root, ".git.off"), join(root, ".git"));

      expect(await until(() => gitCalls(calls).length === 2)).toBe(true);
      expect(gitCalls(calls)[1]?.closed).toBe(false);
      expect(
        await until(() => events.filter((event) => event.reason === "git").length > before),
      ).toBe(true);
    } finally {
      await watcher.close();
    }
  }, 30_000);

  it("stops polling once it is closed", async () => {
    const root = await repo({ init: false });
    const { createWatcher, calls } = harness();
    const watcher = await createProjectWatcher(
      { config: baseStudioConfig(), projectRoot: root, debounceMs: 5 },
      { createWatcher, gitPollMs: 50 },
    );
    await watcher.close();
    await git(root, "init", "-q", "-b", "main");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(gitCalls(calls)).toHaveLength(0);
  });

  it("sees a real commit, a branch switch and a staged change through the default watcher", async () => {
    const root = await repo();
    const watcher = await createProjectWatcher(
      { config: baseStudioConfig(), projectRoot: root, debounceMs: 50 },
      { createWatcher: defaultCreateStudioWatcher },
    );
    const events: RefreshEvent[] = [];
    watcher.onRefresh((event) => events.push(event));
    await new Promise((resolve) => setTimeout(resolve, 500));

    async function settleGit(operate: () => Promise<void>): Promise<boolean> {
      const before = events.filter((event) => event.reason === "git").length;
      await operate();
      for (let waited = 0; waited < 5000; waited += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (events.filter((event) => event.reason === "git").length > before) {
          return true;
        }
      }
      return false;
    }

    try {
      expect(await settleGit(() => git(root, "checkout", "-q", "-b", "side"))).toBe(true);
      await writeFile(join(root, "locales", "de.json"), '{"a":"b"}\n');
      expect(await settleGit(() => git(root, "add", "locales/de.json"))).toBe(true);
      expect(await settleGit(() => git(root, "commit", "-q", "-m", "second"))).toBe(true);
    } finally {
      await watcher.close();
    }
  }, 30_000);

  it("reports a change to a named file in a watched directory and ignores its neighbours", async () => {
    const root = await repo({ init: false });
    const directory = join(root, "gitdir");
    await mkdir(directory, { recursive: true });
    const watched = join(directory, "HEAD");
    const neighbour = join(directory, "COMMIT_EDITMSG");
    await writeFile(watched, "a");
    await writeFile(neighbour, "a");
    let changes = 0;
    const watcher = defaultCreateStudioWatcher([directory], { only: [watched] });
    watcher.onChange(() => {
      changes += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    changes = 0;

    try {
      await writeFile(neighbour, "b");
      await writeFile(join(directory, "index.lock"), "x");
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(changes).toBe(0);

      await writeFile(watched, "b");
      expect(await until(() => changes > 0)).toBe(true);
    } finally {
      await watcher.close();
    }
  }, 30_000);

  it.skipIf(process.getuid?.() === 0)(
    "survives a git directory it may not read, and keeps serving the rest",
    async () => {
      const root = await repo();
      const real = join(root, "real-logs");
      await mkdir(real, { recursive: true });
      await writeFile(join(real, "HEAD"), "x");
      await rm(join(root, ".git", "logs"), { recursive: true, force: true });
      await symlink(real, join(root, ".git", "logs"));
      await chmod(real, 0o000);
      const events: RefreshEvent[] = [];
      const errors: unknown[] = [];
      const onError = (error: unknown): void => {
        errors.push(error);
      };
      process.on("uncaughtException", onError);
      try {
        const watcher = await createProjectWatcher(
          { config: baseStudioConfig(), projectRoot: root, debounceMs: 20 },
          { createWatcher: defaultCreateStudioWatcher, gitPollMs: 200 },
        );
        watcher.onRefresh((event) => events.push(event));
        await new Promise((resolve) => setTimeout(resolve, 800));
        await writeFile(join(root, "locales", "de.json"), '{"a":"changed"}\n');
        expect(await until(() => events.some((event) => event.reason === "targets"))).toBe(true);
        await watcher.close();
      } finally {
        process.off("uncaughtException", onError);
        await chmod(real, 0o755);
      }

      expect(errors).toEqual([]);
    },
    30_000,
  );
});
