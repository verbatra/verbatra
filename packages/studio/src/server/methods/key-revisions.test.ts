import { execFile as execFileCb } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { type LoadedConfig, SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { keyRevisionsHandler } from "./key-revisions.js";

const execFileAsync = promisify(execFileCb);

const LEAKED_KEY = `sk-${"a1B2c3D4".repeat(5)}`;

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "user.name=Test Author", "-c", "user.email=test@example.com", ...args],
    { cwd },
  );
}

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function committedProject(subject: string, value: string): Promise<FixtureProject> {
  const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
  await runGit(project.root, ["init", "-q", "-b", "main"]);
  await writeFile(join(project.root, "locales", "de.json"), '{"greeting":"hallo"}\n', "utf8");
  await runGit(project.root, ["add", "-A"]);
  await runGit(project.root, ["commit", "-q", "-m", "first"]);
  await writeFile(
    join(project.root, "locales", "de.json"),
    `${JSON.stringify({ greeting: value })}\n`,
    "utf8",
  );
  await runGit(project.root, ["add", "-A"]);
  await runGit(project.root, ["commit", "-q", "-m", subject]);
  return project;
}

describe("keyRevisionsHandler", () => {
  it("lists the revisions of a key in a configured target locale", async () => {
    const project = await committedProject("reword greeting", "servus");
    try {
      const result = await keyRevisionsHandler({ locale: "de", key: "greeting" }, deps(project));

      expect(result).toMatchObject({ available: true, truncated: false });
      if (result.available) {
        expect(result.revisions.map((revision) => revision.value)).toEqual(["servus", "hallo"]);
        expect(result.revisions[0]?.subject).toBe("reword greeting");
        expect(result.revisions[0]?.author).toBe("Test Author");
      }
    } finally {
      await project.cleanup();
    }
  });

  it("scrubs a key that a commit subject quotes before it leaves the server", async () => {
    const project = await committedProject(`rotate ${LEAKED_KEY}`, "servus");
    try {
      const result = await keyRevisionsHandler({ locale: "de", key: "greeting" }, deps(project));

      expect(JSON.stringify(result)).not.toContain(LEAKED_KEY);
      if (result.available) {
        expect(result.revisions[0]?.subject).toBe("rotate [REDACTED]");
      }
    } finally {
      await project.cleanup();
    }
  });

  it("marks a value that held a key as redacted and does not return it", async () => {
    const project = await committedProject("add secret", LEAKED_KEY);
    try {
      const result = await keyRevisionsHandler({ locale: "de", key: "greeting" }, deps(project));

      expect(JSON.stringify(result)).not.toContain(LEAKED_KEY);
      if (result.available) {
        expect(result.revisions[0]).toMatchObject({ valueRedacted: true });
      }
    } finally {
      await project.cleanup();
    }
  });

  it.each(["en", "xx", "__proto__", "DE", "../de"])(
    "refuses %j, which is not a configured target locale",
    async (locale) => {
      const project = await committedProject("second", "servus");
      try {
        await expect(
          keyRevisionsHandler({ locale, key: "greeting" }, deps(project)),
        ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
        await expect(
          keyRevisionsHandler({ locale, key: "greeting" }, deps(project)),
        ).rejects.toBeInstanceOf(SdkError);
      } finally {
        await project.cleanup();
      }
    },
  );

  it("reports a folder that is not a repository as unavailable", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await keyRevisionsHandler({ locale: "de", key: "greeting" }, deps(project));

      expect(result).toEqual({ available: false, reason: "not-a-repository" });
    } finally {
      await project.cleanup();
    }
  });
});
