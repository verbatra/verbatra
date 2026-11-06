import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { localeGitDiff } from "./git-diff.js";
import { defaultGitExecFile, type GitExecFile, SAFE_GIT_PREFIX } from "./git-exec.js";
import { localeGitStatus } from "./git-status.js";
import { localeHistory } from "./locale-history.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

interface Recorded {
  readonly args: readonly string[];
  readonly timeout: number;
  readonly maxBuffer: number;
}

function recording(calls: Recorded[]): GitExecFile {
  return (file, args, options) => {
    calls.push({ args: [...args], timeout: options.timeout, maxBuffer: options.maxBuffer });
    return defaultGitExecFile(file, args, options);
  };
}

function subcommand(args: readonly string[]): string | undefined {
  const rest = args.slice(SAFE_GIT_PREFIX.length);
  let index = 0;
  while (index < rest.length) {
    const arg = rest[index];
    if (arg === "-c") {
      index += 2;
    } else if (arg?.startsWith("--")) {
      index += 1;
    } else {
      return arg;
    }
  }
  return undefined;
}

async function project(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  await fx.write("locales/en.json", '{"a":"A"}\n');
  await fx.write("locales/de.json", '{"a":"a"}\n');
  await fx.commitAll();
  await fx.write("locales/de.json", '{"a":"b"}\n');
  return fx;
}

async function allCalls(fx: GitFixture): Promise<Recorded[]> {
  const calls: Recorded[] = [];
  const execFile = recording(calls);
  const config = baseConfig();
  await localeGitStatus({ config, cwd: fx.root }, { execFile });
  await localeGitDiff({ config, cwd: fx.root, locale: "de" }, { execFile });
  await localeHistory({ config, cwd: fx.root }, { execFile });
  return calls;
}

describe("every git invocation", () => {
  it("starts with the safety flags, has a timeout and an output cap, and ends paths after --", async () => {
    const calls = await allCalls(await project());

    expect(calls.length).toBeGreaterThan(10);
    for (const call of calls) {
      expect(call.args.slice(0, SAFE_GIT_PREFIX.length)).toEqual([...SAFE_GIT_PREFIX]);
      expect(call.timeout).toBeGreaterThan(0);
      expect(call.maxBuffer).toBeGreaterThan(0);
    }
  });

  it("is one of the known read-only subcommands", async () => {
    const calls = await allCalls(await project());

    expect(new Set(calls.map((call) => subcommand(call.args)))).toEqual(
      new Set(["config", "rev-parse", "symbolic-ref", "status", "ls-tree", "cat-file", "log"]),
    );
  });

  it("passes paths only after a -- separator", async () => {
    const calls = await allCalls(await project());

    for (const call of calls) {
      const name = subcommand(call.args);
      if (name === "status" || name === "log" || name === "ls-tree") {
        const separator = call.args.indexOf("--");
        expect(separator).toBeGreaterThan(-1);
        expect(call.args.slice(separator + 1).every((arg) => !arg.startsWith("--"))).toBe(true);
      }
    }
  });

  it("also asks a partial clone not to fetch lazily, on every command after the first two", async () => {
    const fx = await project();
    await fx.git(["config", "core.repositoryformatversion", "1"]);
    await fx.git(["config", "extensions.partialclone", "origin"]);
    await fx.git(["config", "remote.origin.promisor", "true"]);
    await fx.git(["config", "remote.origin.url", join(fx.base, "nowhere")]);
    const calls: Recorded[] = [];
    const execFile = recording(calls);

    await localeGitStatus({ config: baseConfig(), cwd: fx.root }, { execFile });
    const statusCalls = calls.splice(0);
    await localeGitDiff({ config: baseConfig(), cwd: fx.root, locale: "de" }, { execFile });
    const diffCalls = calls.splice(0);
    await localeHistory({ config: baseConfig(), cwd: fx.root }, { execFile });
    const historyCalls = calls.splice(0);

    for (const call of statusCalls.slice(2)) {
      expect(call.args).toContain("--no-lazy-fetch");
    }
    for (const call of diffCalls.slice(2)) {
      expect(call.args).toContain("--no-lazy-fetch");
    }
    expect(statusCalls.length).toBeGreaterThan(3);
    expect(diffCalls.length).toBeGreaterThan(3);
    expect(historyCalls.slice(1).map((call) => subcommand(call.args))).toEqual(["log"]);
    expect(historyCalls[1]?.args).toContain("--no-lazy-fetch");
  });
});

describe("the source of the git calls", () => {
  const sources = readdirSync(join(import.meta.dirname), { encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
    .map((name) => [name, readFileSync(join(import.meta.dirname, name), "utf8")] as const);

  it("spawns a process in git-exec.ts only", () => {
    const spawning = sources
      .filter(([, text]) => /node:child_process/.test(text))
      .map(([name]) => name);

    expect(spawning).toEqual(["git-exec.ts"]);
  });

  it("runs only known subcommands through a runner, and the history log through the safe args", () => {
    const subcommands = new Set<string>();
    for (const [, text] of sources) {
      for (const match of text.matchAll(/\.run\(\s*\[\s*"([a-z-]+)"/g)) {
        subcommands.add(match[1] as string);
      }
    }
    const logSource = readFileSync(join(import.meta.dirname, "git-log.ts"), "utf8");

    expect([...subcommands].sort()).toEqual(
      ["cat-file", "config", "ls-tree", "rev-parse", "show-ref", "status", "symbolic-ref"].sort(),
    );
    expect(logSource).toMatch(/buildSafeGitArgs\(/);
    expect(logSource).not.toMatch(/execFile\("git",\s*buildGitLogArgs/);
  });
});

describe("an inherited GIT_DIR does not steer localeHistory", () => {
  it("lists the project's own commit, not the one in the repository the variable names", async () => {
    const own = await makeGitFixture();
    const other = await makeGitFixture();
    fixtures.push(own, other);
    await own.write("locales/de.json", "{}\n");
    await own.commitAll("own commit");
    await other.write("locales/de.json", "{}\n");
    await other.commitAll("other commit");
    const config = baseConfig();
    const steered = {
      ...process.env,
      GIT_DIR: join(other.root, ".git"),
      GIT_WORK_TREE: other.root,
    };
    const plain = await new Promise<string>((resolve, reject) => {
      import("node:child_process").then(({ execFile }) =>
        execFile("git", ["log", "--format=%s"], { cwd: own.root, env: steered }, (error, stdout) =>
          error ? reject(error) : resolve(stdout),
        ),
      );
    });
    vi.stubEnv("GIT_DIR", join(other.root, ".git"));
    vi.stubEnv("GIT_WORK_TREE", other.root);

    const history = await localeHistory({ config, cwd: own.root });

    expect(plain.trim()).toBe("other commit");
    expect(history).toMatchObject({ available: true, commits: [{ subject: "own commit" }] });
  });
});

describe("a bare repository planted in the project folder", () => {
  it("is refused by localeHistory as an empty history, never opened", async () => {
    const fx = await makeGitFixture({ init: false });
    fixtures.push(fx);
    await fx.git(["init", "-q", "--bare"]);

    const history = await localeHistory({ config: baseConfig(), cwd: fx.root });

    expect(history).toEqual({ available: true, commits: [] });
  });
});
