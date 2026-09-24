import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveServerCwd } from "./server-cwd.js";

async function makeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-mcp-cwd-"));
}

describe("resolveServerCwd", () => {
  it("returns an explicit cwd even when CLAUDE_PROJECT_DIR names an existing directory", async () => {
    const projectDir = await makeDir();

    expect(resolveServerCwd("/explicit", { CLAUDE_PROJECT_DIR: projectDir })).toBe("/explicit");
  });

  it("falls back to CLAUDE_PROJECT_DIR when no cwd is given and it is an existing directory", async () => {
    const projectDir = await makeDir();

    expect(resolveServerCwd(undefined, { CLAUDE_PROJECT_DIR: projectDir })).toBe(projectDir);
  });

  it("falls back to process.cwd() when CLAUDE_PROJECT_DIR is unset", () => {
    expect(resolveServerCwd(undefined, {})).toBe(process.cwd());
  });

  it.each([
    ["empty", async () => ""],
    ["a missing path", async () => join(await makeDir(), "missing")],
    [
      "a file",
      async () => {
        const file = join(await makeDir(), "file.txt");
        await writeFile(file, "x");
        return file;
      },
    ],
  ])("ignores CLAUDE_PROJECT_DIR when it is %s", async (_label, value) => {
    expect(resolveServerCwd(undefined, { CLAUDE_PROJECT_DIR: await value() })).toBe(process.cwd());
  });

  it("reads process.env by default", async () => {
    const projectDir = await makeDir();
    const previous = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = projectDir;
    try {
      expect(resolveServerCwd()).toBe(projectDir);
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_PROJECT_DIR;
      } else {
        process.env.CLAUDE_PROJECT_DIR = previous;
      }
    }
  });
});
