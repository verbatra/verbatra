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

describe("commands that top up .gitignore say so on stderr", () => {
  it.each([
    [["translate"]],
    [["import", "wb.xlsx"]],
    [["tmx", "import", "legacy.tmx"]],
    [["pseudo"]],
  ])("verbatra %j names the entries it added", async (args) => {
    const dir = await projectWithGitignore(".env\n.env.local\n");
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run([...args, "--cwd", dir], deps, cap.streams);

    expect(cap.err()).toContain(
      "verbatra: updated .gitignore (added .verbatra-local/, verbatra.cache.json)\n",
    );
    expect(cap.out()).not.toContain(".gitignore");
  });

  it("stays quiet when nothing was added", async () => {
    const dir = await projectWithGitignore(
      ".env\n.env.local\n.verbatra-local/\nverbatra.cache.json\n",
    );
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["translate", "--cwd", dir], deps, cap.streams);

    expect(cap.err()).not.toContain(".gitignore");
  });

  it("keeps --json stderr free of the human line while still adding the entries", async () => {
    const dir = await projectWithGitignore("node_modules\n");
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["translate", "--cwd", dir, "--json"], deps, cap.streams);

    expect(await gitignoreOf(dir)).toContain("verbatra.cache.json");
    expect(cap.err()).not.toContain(".gitignore");
  });
});
