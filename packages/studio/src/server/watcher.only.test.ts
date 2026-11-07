import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { baseStudioConfig } from "./test-support.js";
import type { CreateStudioWatcher, ExecFileImpl } from "./types.js";
import { createProjectWatcher, onlyThese } from "./watcher.js";

const execFileAsync = promisify(execFileCb);

describe("onlyThese", () => {
  it("applies no filter when no file is named", () => {
    expect(onlyThese(["/r/.git"], {})).toBeUndefined();
  });

  it("keeps the named files and their directories and ignores everything else", () => {
    const filter = onlyThese(["/r/.git", "/r/.git/logs"], {
      only: ["/r/.git/index", "/r/.git/HEAD"],
    });

    expect(filter?.depth).toBe(0);
    expect(filter?.ignored("/r/.git")).toBe(false);
    expect(filter?.ignored("/r/.git/logs")).toBe(false);
    expect(filter?.ignored("/r/.git/index")).toBe(false);
    expect(filter?.ignored("/r/.git/HEAD")).toBe(false);
    expect(filter?.ignored("/r/.git/index.lock")).toBe(true);
    expect(filter?.ignored("/r/.git/COMMIT_EDITMSG")).toBe(true);
    expect(filter?.ignored("/r/.git/logs/HEAD")).toBe(true);
  });

  it("matches a path whichever separator either side uses, as on Windows", () => {
    const backslashed = onlyThese(["C:\\r\\.git"], { only: ["C:\\r\\.git\\index"] });
    const forward = onlyThese(["C:/r/.git"], { only: ["C:/r/.git/index"] });

    for (const filter of [backslashed, forward]) {
      expect(filter?.ignored("C:/r/.git/index")).toBe(false);
      expect(filter?.ignored("C:\\r\\.git\\index")).toBe(false);
      expect(filter?.ignored("C:/r/.git")).toBe(false);
      expect(filter?.ignored("C:\\r\\.git")).toBe(false);
      expect(filter?.ignored("C:\\r\\.git\\index.lock")).toBe(true);
      expect(filter?.ignored("C:/r/.git/other")).toBe(true);
    }
  });
});

describe("the project watcher's first lookup", () => {
  it("asks git where the index is exactly once at start", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "verbatra-once-")));
    try {
      await writeFile(join(root, "en.json"), "{}");
      await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: root });
      const asked: (readonly string[])[] = [];
      const execFile: ExecFileImpl = async (file, args, options) => {
        asked.push(args);
        return execFileAsync(file, [...args], options);
      };
      const createWatcher: CreateStudioWatcher = () => ({
        onChange: () => {},
        close: async () => {},
      });

      const watcher = await createProjectWatcher(
        {
          config: baseStudioConfig({ files: { pattern: "{locale}.json" } }),
          projectRoot: root,
          debounceMs: 5,
        },
        { createWatcher, execFile, gitPollMs: 60_000 },
      );
      await watcher.close();

      expect(asked.filter((args) => args.includes("--git-path"))).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
