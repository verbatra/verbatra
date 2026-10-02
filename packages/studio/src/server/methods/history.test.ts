import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { baseStudioConfig, type FixtureProject, makeFixtureProject } from "../test-support.js";
import type { ExecFileImpl, ExecFileResult } from "../types.js";
import { historyListHandler } from "./history.js";

const execFileAsync = promisify(execFileCb);

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync("git", args as string[], { cwd });
}

function deps(project: FixtureProject, execFileImpl?: ExecFileImpl): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, ...(execFileImpl ? { execFileImpl } : {}) };
}

type MockedExecFile = ExecFileImpl & { readonly mock: { readonly calls: readonly unknown[][] } };

function resolvedExecFile(stdout: string): MockedExecFile {
  return vi.fn(
    async (): Promise<ExecFileResult> => ({
      stdout,
      stderr: "",
    }),
  ) as unknown as MockedExecFile;
}

describe("historyListHandler", () => {
  it("scopes git log to the source and every target locale file", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello" },
    );
    try {
      const execFileImpl = resolvedExecFile("");

      await historyListHandler({}, deps(project, execFileImpl));

      const args = execFileImpl.mock.calls[0]?.[1] as readonly string[];
      const sentinelIndex = args.indexOf("--");
      const paths = args.slice(sentinelIndex + 1);
      expect(paths).toEqual([
        join(project.root, "locales", "en.json"),
        join(project.root, "locales", "de.json"),
        join(project.root, "locales", "fr.json"),
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("runs git with cwd set to the project root", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const execFileImpl = resolvedExecFile("");

      await historyListHandler({}, deps(project, execFileImpl));

      expect(execFileImpl).toHaveBeenCalledWith("git", expect.any(Array), {
        cwd: project.root,
        timeout: expect.any(Number),
        maxBuffer: expect.any(Number),
      });
    } finally {
      await project.cleanup();
    }
  });

  it("passes a requested limit through to the git invocation", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const execFileImpl = resolvedExecFile("");

      await historyListHandler({ limit: 5 }, deps(project, execFileImpl));

      const args = execFileImpl.mock.calls[0]?.[1] as readonly string[];
      expect(args).toContain("--max-count=5");
    } finally {
      await project.cleanup();
    }
  });

  it("clamps a requested limit above 200 down to the cap", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const execFileImpl = resolvedExecFile("");

      await historyListHandler({ limit: 10000 }, deps(project, execFileImpl));

      const args = execFileImpl.mock.calls[0]?.[1] as readonly string[];
      expect(args).toContain("--max-count=200");
    } finally {
      await project.cleanup();
    }
  });

  it("degrades to available: false when the project root is not a git repository, using the real default execFileImpl", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await historyListHandler({}, deps(project));

      expect(result).toEqual({ available: false, reason: "not-a-repository" });
    } finally {
      await project.cleanup();
    }
  });
});

interface NestedGitProject {
  readonly repoRoot: string;
  readonly projectRoot: string;
  cleanup(): Promise<void>;
}

async function makeNestedGitProject(): Promise<NestedGitProject> {
  const repoRoot = await mkdtemp(join(tmpdir(), "verbatra-studio-nested-repo-"));
  await runGit(repoRoot, ["init", "-q"]);
  await runGit(repoRoot, ["config", "user.email", "test@example.com"]);
  await runGit(repoRoot, ["config", "user.name", "Test User"]);

  const projectRoot = join(repoRoot, "project");
  await mkdir(join(projectRoot, "locales"), { recursive: true });
  await writeFile(join(projectRoot, "locales", "en.json"), '{"greeting":"hello"}\n', "utf8");
  await writeFile(join(projectRoot, "locales", "de.json"), '{"greeting":"hallo"}\n', "utf8");
  await runGit(repoRoot, ["add", "project/locales/en.json", "project/locales/de.json"]);
  await runGit(repoRoot, ["commit", "-q", "-m", "add locale files"]);

  return { repoRoot, projectRoot, cleanup: () => rm(repoRoot, { recursive: true, force: true }) };
}

describe("historyListHandler against a git repository rooted above the project root", () => {
  it("returns history for the nested project's locale files, using the real default execFileImpl", async () => {
    const nested = await makeNestedGitProject();
    try {
      const loaded: LoadedConfig = {
        config: baseStudioConfig({ targetLocales: ["de"] }),
        source: { kind: "override" },
        glossary: { source: "none" },
      };

      const result = await historyListHandler(
        {},
        { config: loaded, projectRoot: nested.projectRoot },
      );

      expect(result.available).toBe(true);
      if (!result.available) {
        throw new Error("expected available: true");
      }
      expect(result.commits).toHaveLength(1);
      expect(result.commits[0]?.subject).toBe("add locale files");
      expect(result.commits[0]?.author).toBe("Test User");
      expect(JSON.stringify(result)).not.toContain("test@example.com");
      expect(result.commits[0]?.touchedPaths).toEqual([
        "project/locales/de.json",
        "project/locales/en.json",
      ]);
    } finally {
      await nested.cleanup();
    }
  });
});

describe("historyListHandler reads git history fresh on every call", () => {
  it("reflects a new commit made between two calls, never caching the previous result", async () => {
    const nested = await makeNestedGitProject();
    try {
      const loaded: LoadedConfig = {
        config: baseStudioConfig({ targetLocales: ["de"] }),
        source: { kind: "override" },
        glossary: { source: "none" },
      };
      const rpcDeps: RpcHandlerDeps = { config: loaded, projectRoot: nested.projectRoot };

      const first = await historyListHandler({}, rpcDeps);
      expect(first.available).toBe(true);
      if (!first.available) {
        throw new Error("expected available: true");
      }
      expect(first.commits).toHaveLength(1);

      await writeFile(
        join(nested.projectRoot, "locales", "de.json"),
        '{"greeting":"servus"}\n',
        "utf8",
      );
      await runGit(nested.repoRoot, ["add", "project/locales/de.json"]);
      await runGit(nested.repoRoot, ["commit", "-q", "-m", "update german translation"]);

      const second = await historyListHandler({}, rpcDeps);
      expect(second.available).toBe(true);
      if (!second.available) {
        throw new Error("expected available: true");
      }
      expect(second.commits).toHaveLength(2);
      expect(second.commits[0]?.subject).toBe("update german translation");
    } finally {
      await nested.cleanup();
    }
  });
});
