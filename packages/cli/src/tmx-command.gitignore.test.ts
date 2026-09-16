import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, recordingDeps } from "./test-support.js";

async function projectWithGitignore(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-cli-tmx-"));
  await writeFile(join(dir, ".gitignore"), content, "utf8");
  return dir;
}

async function gitignoreOf(dir: string): Promise<string> {
  return readFile(join(dir, ".gitignore"), "utf8");
}

describe("verbatra tmx import guards the cache it is about to write", () => {
  it("adds the cache file to an existing .gitignore that does not list it", async () => {
    const dir = await projectWithGitignore("node_modules\n");
    const { deps } = recordingDeps();
    const { streams } = captureStreams();

    const code = await run(["tmx", "import", "legacy.tmx", "--cwd", dir], deps, streams);

    expect(code).toBe(0);
    expect(await gitignoreOf(dir)).toContain("verbatra.cache.json");
  });

  it("leaves a .gitignore that already lists the cache byte for byte", async () => {
    const content = "node_modules\n.env\n.env.local\n.verbatra-local/\nverbatra.cache.json\n";
    const dir = await projectWithGitignore(content);
    const { deps } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "import", "legacy.tmx", "--cwd", dir], deps, streams);

    expect(await gitignoreOf(dir)).toBe(content);
  });

  it("writes nothing to .gitignore on a dry run, which changes no memory to hide", async () => {
    const dir = await projectWithGitignore("node_modules\n");
    const { deps } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "import", "legacy.tmx", "--cwd", dir, "--dry-run"], deps, streams);

    expect(await gitignoreOf(dir)).toBe("node_modules\n");
  });

  it("writes nothing to .gitignore on an export, which never touches the memory", async () => {
    const dir = await projectWithGitignore("node_modules\n");
    const { deps } = recordingDeps();
    const { streams } = captureStreams();

    await run(["tmx", "export", "out.tmx", "--cwd", dir], deps, streams);

    expect(await gitignoreOf(dir)).toBe("node_modules\n");
  });
});
