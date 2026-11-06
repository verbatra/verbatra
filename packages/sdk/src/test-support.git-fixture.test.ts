import { execFile as execFileCb } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeGitFixture } from "./test-support.js";

const execFileAsync = promisify(execFileCb);

afterEach(() => {
  vi.unstubAllEnvs();
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("makeGitFixture", () => {
  it("runs no hook of the host's global configuration, and ignores inherited repository variables", async () => {
    const host = await mkdtemp(join(tmpdir(), "verbatra-sdk-hosthome-"));
    try {
      const marker = join(host, "marker");
      const hooks = join(host, "hooks");
      await mkdir(hooks);
      await writeFile(join(hooks, "pre-commit"), `#!/bin/sh\necho ran >> "${marker}"\n`);
      await chmod(join(hooks, "pre-commit"), 0o755);
      await writeFile(join(host, ".gitconfig"), `[core]\n\thooksPath = ${hooks}\n`);
      const hostEnv = { PATH: process.env.PATH ?? "", HOME: host };
      const control = join(host, "control");
      await mkdir(control);
      await execFileAsync("git", ["init", "-q"], { cwd: control, env: hostEnv });
      await execFileAsync(
        "git",
        ["-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"],
        {
          cwd: control,
          env: hostEnv,
        },
      );
      const controlRan = await exists(marker);
      await rm(marker, { force: true });
      vi.stubEnv("HOME", host);
      vi.stubEnv("GIT_DIR", join(host, "elsewhere"));
      vi.stubEnv("GIT_INDEX_FILE", join(host, "no", "index"));

      const fx = await makeGitFixture();
      await fx.write("a.json", "{}\n");
      await fx.commitAll();
      const hookRan = await exists(marker);
      await fx.cleanup();

      expect(controlRan).toBe(true);
      expect(hookRan).toBe(false);
    } finally {
      await rm(host, { recursive: true, force: true });
    }
  });

  it("puts the environment back, and leaves nothing behind, when its setup fails", async () => {
    const home = process.env.HOME;
    const xdg = process.env.XDG_CONFIG_HOME;
    vi.stubEnv("PATH", "");

    await expect(makeGitFixture()).rejects.toBeDefined();
    vi.unstubAllEnvs();

    expect(process.env.HOME).toBe(home);
    expect(process.env.XDG_CONFIG_HOME).toBe(xdg);
  });

  it("restores the environment once the last fixture is cleaned up", async () => {
    const home = process.env.HOME;
    const first = await makeGitFixture();
    const second = await makeGitFixture();

    await first.cleanup();
    expect(process.env.HOME).not.toBe(home);
    await second.cleanup();

    expect(process.env.HOME).toBe(home);
  });
});
