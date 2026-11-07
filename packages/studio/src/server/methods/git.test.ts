import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createDefaultRegistry, type LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import type { ExecFileImpl, ExecFileResult } from "../types.js";
import { gitLocaleDiffHandler, gitStatusHandler } from "./git.js";

const execFileAsync = promisify(execFileCb);

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd },
  );
}

function deps(project: FixtureProject, execFileImpl?: ExecFileImpl): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, ...(execFileImpl ? { execFileImpl } : {}) };
}

async function committedProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject({ targetLocales: ["de", "fr"] }, { greeting: "hello" });
  await writeFile(join(project.root, "locales", "de.json"), '{"greeting":"hallo"}\n', "utf8");
  await runGit(project.root, ["init", "-q", "-b", "main"]);
  await runGit(project.root, ["add", "-A"]);
  await runGit(project.root, ["commit", "-q", "-m", "first"]);
  return project;
}

describe("gitStatusHandler", () => {
  it("lists the changed locale files with their locales", async () => {
    const project = await committedProject();
    try {
      await writeFile(join(project.root, "locales", "de.json"), '{"greeting":"hi"}\n', "utf8");
      await writeFile(join(project.root, "locales", "fr.json"), '{"greeting":"salut"}\n', "utf8");

      const result = await gitStatusHandler({}, deps(project));

      expect(result).toEqual({
        available: true,
        branch: "main",
        files: [
          { path: "locales/de.json", locales: ["de"], state: "modified" },
          { path: "locales/fr.json", locales: ["fr"], state: "untracked" },
        ],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("reports a folder that is not a repository as unavailable, not as a failure", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "verbatra-no-repo-")));
    try {
      await mkdir(join(root, "locales"), { recursive: true });
      const project = await makeFixtureProject();
      try {
        const result = await gitStatusHandler(
          {},
          { ...deps(project), projectRoot: root, config: deps(project).config },
        );

        expect(result).toEqual({ available: false, reason: "not-a-repository" });
      } finally {
        await project.cleanup();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs the injected git runner in the project root", async () => {
    const project = await makeFixtureProject();
    try {
      const execFileImpl = vi.fn(
        async (): Promise<ExecFileResult> => ({ stdout: "", stderr: "" }),
      ) as unknown as ExecFileImpl;

      await gitStatusHandler({}, deps(project, execFileImpl));

      expect(execFileImpl).toHaveBeenCalledWith(
        "git",
        expect.any(Array),
        expect.objectContaining({ cwd: project.root }),
      );
    } finally {
      await project.cleanup();
    }
  });
});

describe("gitLocaleDiffHandler", () => {
  it("returns the key difference of a configured locale", async () => {
    const project = await committedProject();
    try {
      await writeFile(
        join(project.root, "locales", "de.json"),
        '{"greeting":"hi","extra":"x"}\n',
        "utf8",
      );

      const result = await gitLocaleDiffHandler({ locale: "de" }, deps(project));

      expect(result).toMatchObject({
        available: true,
        path: "locales/de.json",
        state: "modified",
        added: [{ key: "extra", value: "x" }],
        changed: [{ key: "greeting", before: "hallo", after: "hi" }],
        removed: [],
        truncated: false,
      });
    } finally {
      await project.cleanup();
    }
  });

  it("accepts the source locale", async () => {
    const project = await committedProject();
    try {
      const result = await gitLocaleDiffHandler({ locale: "en" }, deps(project));

      expect(result).toMatchObject({ available: true, state: "unchanged" });
    } finally {
      await project.cleanup();
    }
  });

  it.each(["xx", "", "__proto__", "constructor", "toString", "de ", "DE", "../de", "locales/de"])(
    "refuses the locale %j that is not configured, without running git",
    async (locale) => {
      const project = await makeFixtureProject({ targetLocales: ["de"] });
      try {
        const execFileImpl = vi.fn(
          async (): Promise<ExecFileResult> => ({ stdout: "", stderr: "" }),
        ) as unknown as ExecFileImpl;

        await expect(
          gitLocaleDiffHandler({ locale }, deps(project, execFileImpl)),
        ).rejects.toMatchObject({
          name: "SdkError",
          code: "UNKNOWN_LOCALE",
          message: "The locale is not one of this project's configured locales.",
        });
        expect(execFileImpl).not.toHaveBeenCalled();
      } finally {
        await project.cleanup();
      }
    },
  );

  it("answers custom-adapter for a custom format without reading git", async () => {
    const project = await makeFixtureProject({ format: "custom:acme" as never });
    try {
      const execFileImpl = vi.fn(
        async (): Promise<ExecFileResult> => ({ stdout: "", stderr: "" }),
      ) as unknown as ExecFileImpl;

      const result = await gitLocaleDiffHandler({ locale: "de" }, deps(project, execFileImpl));

      expect(result).toEqual({ available: false, reason: "custom-adapter" });
    } finally {
      await project.cleanup();
    }
  });

  it("answers custom-adapter when the server was given an adapter registry", async () => {
    const project = await committedProject();
    try {
      const adapterRegistry = createDefaultRegistry();

      const result = await gitLocaleDiffHandler(
        { locale: "de" },
        { ...deps(project), adapterRegistry },
      );

      expect(result).toEqual({ available: false, reason: "custom-adapter" });
    } finally {
      await project.cleanup();
    }
  });

  it("reads through the built-in adapters when the server was given no registry", async () => {
    const project = await committedProject();
    try {
      const result = await gitLocaleDiffHandler({ locale: "de" }, deps(project));

      expect(result).toMatchObject({ available: true });
    } finally {
      await project.cleanup();
    }
  });
});
