import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RUNNER =
  /(?<![\w@/.-])(?:npx|bunx|pnpx|pnpm\s+dlx|yarn\s+dlx|npm\s+(?:exec|x)|bun\s+x)(?=[ \t])/g;
const PACKAGE_FLAG = /^(?:-p|--package)(?:=(.*))?$/;
const UNSCOPED_SPEC = /^["'`]?verbatra(?:@[\w.^~<>=*-]*)?["'`.,;:)\]]*$/;
const UNSCOPED_ARGS =
  /\bargs["']?\s*[:=]?\s*\[\s*(?:(["'])(?:-y|--yes)\1\s*,\s*)?(["'])verbatra(?:@[^"']*)?\2/;

const TEXT_FILE = /\.(?:md|mdx|json|ts|tsx|mts|mjs|js|cjs|yml|yaml|toml|txt)$/;
const VENDORED_SKILLS = ".claude/skills/";
const RELEASE_HISTORY = /(?:^|\/)CHANGELOG\.md$/;

function unscopedPackageFlag(tokens, index) {
  const flag = PACKAGE_FLAG.exec(tokens[index] ?? "");
  if (flag === null) {
    return undefined;
  }
  const inline = flag[1] !== undefined;
  const value = inline ? flag[1] : (tokens[index + 1] ?? "");
  return { unscoped: UNSCOPED_SPEC.test(value), next: inline ? index + 1 : index + 2 };
}

function runsUnscopedPackage(tokens) {
  let packageGiven = false;
  let index = 0;
  while (index < tokens.length) {
    const flag = unscopedPackageFlag(tokens, index);
    if (flag?.unscoped) {
      return true;
    }
    if (flag !== undefined) {
      packageGiven = true;
      index = flag.next;
    } else if (tokens[index].startsWith("-")) {
      index += 1;
    } else {
      return !packageGiven && UNSCOPED_SPEC.test(tokens[index]);
    }
  }
  return false;
}

function unscopedInvocation(text) {
  for (const runner of text.matchAll(RUNNER)) {
    const start = runner.index + runner[0].length;
    const lineEnd = text.indexOf("\n", start);
    const rest = text.slice(start, lineEnd === -1 ? undefined : lineEnd);
    if (runsUnscopedPackage(rest.trim().split(/\s+/))) {
      return `${runner[0]}${rest}`.trim();
    }
  }
  return UNSCOPED_ARGS.exec(text)?.[0];
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
    unscoped("npm", "exec", "verbatra", "check"),
    unscoped("npm", "exec", "--", "verbatra", "check"),
    unscoped("npm", "x", "verbatra", "check"),
    unscoped("bun", "x", "verbatra", "check"),
    unscoped("npx", "--package=verbatra", "verbatra", "check"),
    unscoped("npx", "--package", "verbatra", "verbatra", "check"),
    unscoped("npx", "-p", "verbatra", "verbatra", "check"),
    unscoped("npx", "-p", "verbatra@latest", "verbatra", "check"),
    unscoped("npx", "verbatra@0.12.0", "check"),
    `Run ${unscoped("npx", "verbatra")}.`,
    `command "npx", args [${JSON.stringify("verbatra")}, "mcp"]`,
    `"args": ["-y", ${JSON.stringify("verbatra")}]`,
    `"args": ["--yes", ${JSON.stringify("verbatra")}]`,
    `args = [${JSON.stringify("verbatra")}, "mcp"]`,
    `args: ['${"verbatra"}', 'mcp']`,
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
    'args = ["-y", "@verbatra/mcp"]',
    "npm exec --package=@verbatra/cli -- verbatra check",
    "bun x @verbatra/cli check",
    "npx verbatra-unrelated",
    "npx is how you run verbatra without installing it",
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
