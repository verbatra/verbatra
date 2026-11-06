import { execFile as execFileCb } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { localeGitDiff } from "./git-diff.js";
import { defaultGitExecFile, type GitExecFile, SAFE_GIT_PREFIX } from "./git-exec.js";
import { localeGitStatus } from "./git-status.js";
import { localeHistory } from "./locale-history.js";

const execFileAsync = promisify(execFileCb);
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

  it("asks every command but the first probe not to fetch lazily, in any repository", async () => {
    const fx = await project();
    const calls: Recorded[] = [];
    const execFile = recording(calls);

    await localeGitStatus({ config: baseConfig(), cwd: fx.root }, { execFile });
    await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root }, { execFile });
    await localeHistory({ config: baseConfig(), cwd: fx.root }, { execFile });

    const without = calls.filter((call) => !call.args.includes("--no-lazy-fetch"));
    expect(calls.length).toBeGreaterThan(10);
    expect(without.length).toBe(2);
    for (const call of without) {
      expect(call.args).toContain("--is-inside-work-tree");
    }
  });

  it("stops the attack of a remote with only a partial clone filter, with no environment variable", async () => {
    const fx = await project();
    const marker = join(fx.base, "pcfmark");
    const script = join(fx.base, "uploadpack.sh");
    await writeFile(script, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`, { mode: 0o755 });
    await fx.commitAll("edit");
    const hash = (await fx.git(["rev-parse", "HEAD:locales/de.json"])).trim();
    await rm(join(fx.root, ".git", "objects", hash.slice(0, 2), hash.slice(2)));
    await fx.git(["config", "remote.evil.url", join(fx.base, "nowhere")]);
    await fx.git(["config", "remote.evil.uploadpack", script]);
    await fx.git(["config", "remote.evil.partialclonefilter", "blob:none"]);
    await fx.write("locales/de.json", '{"a":"c"}\n');
    const bareEnv: GitExecFile = async (file, args, options) =>
      execFileAsync(file, args as string[], {
        cwd: options.cwd,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", HOME: fx.home, LC_ALL: "C" },
      });

    await execFileAsync("git", ["cat-file", "blob", "HEAD:locales/de.json"], {
      cwd: fx.root,
      env: { PATH: process.env.PATH ?? "", HOME: fx.home },
    }).catch(() => undefined);
    const plainRan = await fx.exists("pcfmark");
    await rm(marker, { force: true });
    const diff = await localeGitDiff(
      { config: baseConfig(), locale: "de", cwd: fx.root },
      { execFile: bareEnv },
    );
    const history = await localeHistory(
      { config: baseConfig(), cwd: fx.root },
      { execFile: bareEnv },
    );

    expect(plainRan).toBe(true);
    expect(diff).toEqual({ available: false, reason: "revision-unreadable" });
    expect(history).toMatchObject({ available: true });
    expect(await fx.exists("pcfmark")).toBe(false);
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

    const execSource = readFileSync(join(import.meta.dirname, "git-exec.ts"), "utf8");

    expect([...subcommands].sort()).toEqual(
      ["cat-file", "ls-tree", "rev-parse", "show-ref", "status", "symbolic-ref"].sort(),
    );
    expect(execSource).toMatch(/CONFIG_LIST = \["config", "--list"/);
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
