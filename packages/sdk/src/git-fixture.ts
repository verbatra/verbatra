import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

export interface GitFixture {
  readonly base: string;
  readonly root: string;
  git(args: readonly string[], cwd?: string): Promise<string>;
  write(path: string, content: string, cwd?: string): Promise<void>;
  commitAll(message?: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  cleanup(): Promise<void>;
}

export interface GitFixtureOptions {
  readonly init?: boolean;
}

export async function makeGitFixture(options: GitFixtureOptions = {}): Promise<GitFixture> {
  const base = await realpath(await mkdtemp(join(tmpdir(), "verbatra-sdk-gitfx-")));
  const root = join(base, "repo");
  await mkdir(root);
  const git = async (args: readonly string[], cwd: string = root): Promise<string> => {
    const { stdout } = await execFileAsync("git", args as string[], { cwd });
    return stdout;
  };
  if (options.init !== false) {
    await git(["init", "-q", "-b", "main"]);
    await git(["config", "user.email", "test@example.com"]);
    await git(["config", "user.name", "Test User"]);
    await git(["config", "commit.gpgsign", "false"]);
  }
  return {
    base,
    root,
    git,
    async write(path, content, cwd = root) {
      const absolute = join(cwd, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    },
    async commitAll(message = "commit") {
      await git(["add", "-A"]);
      await git(["commit", "-q", "-m", message]);
    },
    async exists(path) {
      try {
        await stat(join(base, path));
        return true;
      } catch {
        return false;
      }
    },
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}
