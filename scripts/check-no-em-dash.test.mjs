import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMMAND = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")).scripts[
  "check:no-em-dash"
];

const EM_DASH = String.fromCharCode(0x2014);
const HORIZONTAL_BAR = String.fromCharCode(0x2015);

function withoutGitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
}

describe("check:no-em-dash", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "no-em-dash-"));
    execFileSync("git", ["init", "-q"], { cwd: repo, env: withoutGitEnv() });
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function run(content) {
    writeFileSync(join(repo, "sample.txt"), content);
    execFileSync("git", ["add", "sample.txt"], { cwd: repo, env: withoutGitEnv() });
    return spawnSync("sh", ["-c", COMMAND], { cwd: repo, encoding: "utf8", env: withoutGitEnv() });
  }

  it("passes a tracked file with a spaced hyphen and ordinary CJK punctuation", () => {
    expect(run("a - b 。 – −\n").status).toBe(0);
  });

  it("stages into its own repository when the caller exports a git index", () => {
    const decoy = join(repo, "decoy-index");
    vi.stubEnv("GIT_INDEX_FILE", decoy);
    try {
      expect(run(`a ${EM_DASH} b\n`).status).not.toBe(0);
      expect(existsSync(decoy)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects the em dash", () => {
    const result = run(`a ${EM_DASH} b\n`);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("sample.txt:1");
  });

  it("rejects the horizontal bar that Chinese and Japanese text uses as a look-alike", () => {
    const result = run(`a ${HORIZONTAL_BAR}${HORIZONTAL_BAR} b\n`);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("sample.txt:1");
  });
});
