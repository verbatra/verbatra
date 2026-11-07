import { stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { localeWatchPaths } from "./locale-watch.js";

const fixtures: GitFixture[] = [];

async function fixture(options?: { init?: boolean }): Promise<GitFixture> {
  const created = await makeGitFixture(options);
  fixtures.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function committed(): Promise<GitFixture> {
  const fx = await fixture();
  await fx.write("locales/en.json", '{"a":"A"}\n');
  await fx.write("locales/de.json", '{"a":"a"}\n');
  await fx.commitAll();
  return fx;
}

async function gitPaths(cwd: string): Promise<readonly string[]> {
  const { git } = await localeWatchPaths({ config: baseConfig(), cwd });
  if (!git.available) {
    throw new Error("expected a work tree");
  }
  return git.paths;
}

async function mtimes(paths: readonly string[]): Promise<number[]> {
  return Promise.all(
    paths.map(async (path) => {
      try {
        return (await stat(path)).mtimeMs;
      } catch {
        return -1;
      }
    }),
  );
}

async function ageAll(paths: readonly string[]): Promise<void> {
  const past = new Date(Date.now() - 60_000);
  await Promise.all(paths.map((path) => utimes(path, past, past).catch(() => undefined)));
}

function lying(stdout: string): GitExecFile {
  return async (file, args, options) => {
    const result = await defaultGitExecFile(file, args, options);
    return args.includes("--git-path") ? { ...result, stdout } : result;
  };
}

type Operation = (fx: GitFixture) => Promise<unknown>;

const OPERATIONS: readonly (readonly [string, Operation])[] = [
  ["a commit", (fx) => fx.commitAll("second")],
  ["a branch switch", (fx) => fx.git(["checkout", "-q", "-b", "side"])],
  ["a staged change", (fx) => fx.git(["add", "locales/de.json"])],
  ["a soft reset", (fx) => fx.git(["reset", "-q", "--soft", "HEAD"])],
];

describe("localeWatchPaths git files", () => {
  it("names this work tree's index, HEAD and HEAD reflog as absolute paths", async () => {
    const fx = await committed();

    expect((await localeWatchPaths({ config: baseConfig(), cwd: fx.root })).git).toEqual({
      available: true,
      paths: [
        join(fx.root, ".git", "index"),
        join(fx.root, ".git", "HEAD"),
        join(fx.root, ".git", "logs", "HEAD"),
      ],
    });
  });

  it("names the root's files for a project in a monorepo subdirectory", async () => {
    const fx = await committed();
    const app = join(fx.root, "packages", "app");
    await fx.write("locales/en.json", '{"a":"A"}\n', app);
    await fx.commitAll();

    const paths = await gitPaths(app);

    expect(paths.slice(0, 2)).toEqual([
      join(fx.root, ".git", "index"),
      join(fx.root, ".git", "HEAD"),
    ]);
  });

  it("follows a linked work tree to its own index and HEAD", async () => {
    const fx = await committed();
    const linked = join(fx.base, "linked");
    await fx.git(["worktree", "add", "-q", "-b", "other", linked]);

    const paths = await gitPaths(linked);

    expect(paths[0]).toContain(join(".git", "worktrees"));
    expect(paths[0]?.endsWith("index")).toBe(true);
    expect(paths[0]).not.toBe(join(fx.root, ".git", "index"));
  });

  it.each(OPERATIONS)("a real git operation touches a named file: %s", async (name, operate) => {
    const fx = await committed();
    const paths = await gitPaths(fx.root);
    await fx.write("locales/de.json", '{"a":"changed"}\n');
    await ageAll(paths);
    const before = await mtimes(paths);

    await operate(fx);

    const after = await mtimes(paths);
    expect(
      after.some((time, index) => time > (before[index] ?? 0)),
      name,
    ).toBe(true);
  });

  it("answers not-a-repository for a folder outside any work tree", async () => {
    const fx = await fixture({ init: false });

    expect((await localeWatchPaths({ config: baseConfig(), cwd: fx.root })).git).toEqual({
      available: false,
      reason: "not-a-repository",
    });
  });

  it("answers git-missing without throwing", async () => {
    const fx = await committed();
    const missing: GitExecFile = async () => {
      throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
    };

    const result = await localeWatchPaths(
      { config: baseConfig(), cwd: fx.root },
      { execFile: missing },
    );

    expect(result.git).toEqual({ available: false, reason: "git-missing" });
  });

  it.each([
    ["not three paths", "only-one\n"],
    ["a control character", "a\u0007b\n.git/HEAD\n.git/logs/HEAD\n"],
  ])("refuses an answer with %s", async (_name, stdout) => {
    const fx = await committed();

    const result = await localeWatchPaths(
      { config: baseConfig(), cwd: fx.root },
      { execFile: lying(stdout) },
    );

    expect(result.git).toEqual({ available: false, reason: "git-failed" });
  });
});

describe("localeWatchPaths locale files", () => {
  it("lists the source locale first, each locale with its own file", async () => {
    const fx = await committed();

    const { locales } = await localeWatchPaths({
      config: baseConfig({ targetLocales: ["de", "fr"] }),
      cwd: fx.root,
    });

    expect(locales).toEqual([
      { locale: "en", paths: [join(fx.root, "locales", "en.json")] },
      { locale: "de", paths: [join(fx.root, "locales", "de.json")] },
      { locale: "fr", paths: [join(fx.root, "locales", "fr.json")] },
    ]);
  });

  it("adds the stringsdict file next to an apple-strings file", async () => {
    const fx = await committed();

    const { locales } = await localeWatchPaths({
      config: baseConfig({
        format: "apple-strings",
        files: { pattern: "{locale}.lproj/Localizable.strings" },
      }),
      cwd: fx.root,
    });

    expect(locales[1]).toEqual({
      locale: "de",
      paths: [
        join(fx.root, "de.lproj", "Localizable.strings"),
        join(fx.root, "de.lproj", "Localizable.stringsdict"),
      ],
    });
  });

  it("still lists the locale files for a project outside a repository", async () => {
    const fx = await fixture({ init: false });

    const result = await localeWatchPaths({ config: baseConfig(), cwd: fx.root });

    expect(result.locales).toHaveLength(2);
    expect(result.git.available).toBe(false);
  });
});
