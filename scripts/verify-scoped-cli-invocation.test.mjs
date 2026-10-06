import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RUNNER = String.raw`(?:npx|bunx|pnpx|pnpm\s+dlx|yarn\s+dlx)`;
const RUNNER_OPTION = String.raw`\s+-(?!-package\b)-?[\w-]+(?:=\S+)?`;
const UNSCOPED_RUNNER = new RegExp(`\\b${RUNNER}(?:${RUNNER_OPTION})*\\s+verbatra(?![\\w./-])`);
const UNSCOPED_ARGS = /\bargs"?:?\s*\[\s*(?:"-y",\s*)?"verbatra"/;

const TEXT_FILE = /\.(?:md|mdx|json|ts|tsx|mts|mjs|js|cjs|yml|yaml|toml|txt)$/;
const VENDORED_SKILLS = ".claude/skills/";
const RELEASE_HISTORY = /(?:^|\/)CHANGELOG\.md$/;

function unscopedInvocation(text) {
  return UNSCOPED_RUNNER.exec(text)?.[0] ?? UNSCOPED_ARGS.exec(text)?.[0];
}

function trackedTextFiles() {
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (listed.status !== 0) {
    throw new Error(`git ls-files failed: ${listed.stderr}`);
  }
  return listed.stdout
    .split("\0")
    .filter((file) => TEXT_FILE.test(file))
    .filter((file) => !file.startsWith(VENDORED_SKILLS) && !RELEASE_HISTORY.test(file));
}

function unscoped(...words) {
  return words.join(" ");
}

describe("every documented package-runner invocation of the CLI names the scoped package", () => {
  it.each([
    unscoped("npx", "verbatra", "init"),
    unscoped("npx", "-y", "verbatra", "translate --json"),
    unscoped("npx", "--yes", "verbatra"),
    `\`${unscoped("npx", "verbatra")}\``,
    unscoped("pnpm", "dlx", "verbatra", "check"),
    unscoped("yarn", "dlx", "verbatra", "check"),
    unscoped("bunx", "verbatra", "doctor"),
    unscoped("pnpx", "verbatra", "doctor"),
    `command "npx", args [${JSON.stringify("verbatra")}, "mcp"]`,
    `"args": ["-y", ${JSON.stringify("verbatra")}]`,
  ])("flags the unscoped form %s", (text) => {
    expect(unscopedInvocation(text)).toBeDefined();
  });

  it.each([
    "npx @verbatra/cli init --agent",
    "npx -y @verbatra/mcp",
    "pnpm dlx @verbatra/cli check",
    "npx -y -p @verbatra/cli -p @verbatra/studio verbatra studio",
    "npx --package=@verbatra/cli verbatra check",
    "npx @modelcontextprotocol/inspector npx @verbatra/cli mcp",
    "npx skills@latest add verbatra/skills --skill verbatra-cli",
    "pnpm exec verbatra check",
    'command "npx", args ["@verbatra/cli", "mcp"]',
  ])("accepts %s", (text) => {
    expect(unscopedInvocation(text)).toBeUndefined();
  });

  it("finds no unscoped invocation in any tracked text file", () => {
    const offenders = trackedTextFiles().flatMap((file) => {
      const found = unscopedInvocation(readFileSync(resolve(REPO_ROOT, file), "utf8"));
      return found === undefined ? [] : [`${file}: ${found}`];
    });
    expect(offenders).toEqual([]);
  });

  it("keeps @verbatra/cli at exactly one bin, so the scoped runner form resolves it", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "packages/cli/package.json"), "utf8"),
    );
    expect(manifest.bin).toEqual({ verbatra: "./dist/index.js" });
  });
});
