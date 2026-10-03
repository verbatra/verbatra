#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_CHANGELOG = "@changesets/cli/changelog";
const WORKSPACE_DIRS = ["packages", "apps"];

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function previewConfig(config, env) {
  if (env.GITHUB_TOKEN) {
    return config;
  }
  return { ...config, changelog: PREVIEW_CHANGELOG };
}

function rewriteChangesetConfig(worktree, env) {
  const path = join(worktree, ".changeset", "config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  const rewritten = previewConfig(config, env);
  writeFileSync(path, `${JSON.stringify(rewritten, null, 2)}\n`);
  return rewritten;
}

function removeWorktree(repoRoot, worktree) {
  const linkedModules = join(worktree, "node_modules");
  if (existsSync(linkedModules)) {
    unlinkSync(linkedModules);
  }
  try {
    git(repoRoot, ["worktree", "remove", "--force", worktree]);
  } finally {
    rmSync(dirname(worktree), { recursive: true, force: true });
    git(repoRoot, ["worktree", "prune"]);
  }
}

async function withTemporaryWorktree(repoRoot, run) {
  const worktree = join(
    mkdtempSync(join(realpathSync(tmpdir()), "verbatra-release-preview-")),
    "wt",
  );
  git(repoRoot, ["worktree", "add", "--detach", worktree, "HEAD"]);
  try {
    return await run(worktree);
  } finally {
    removeWorktree(repoRoot, worktree);
  }
}

function workspaceManifests(root) {
  const manifests = [];
  for (const dir of WORKSPACE_DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) {
      continue;
    }
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const relative = join(dir, entry.name);
      if (entry.isDirectory() && existsSync(join(root, relative, "package.json"))) {
        manifests.push(relative);
      }
    }
  }
  return manifests.sort();
}

function readVersion(root, relative) {
  const manifest = JSON.parse(readFileSync(join(root, relative, "package.json"), "utf8"));
  return { name: manifest.name, version: manifest.version };
}

function committedVersion(worktree, relative) {
  try {
    return JSON.parse(git(worktree, ["show", `HEAD:${relative}/package.json`])).version;
  } catch {
    return undefined;
  }
}

function versionBumps(worktree) {
  const bumps = [];
  for (const relative of workspaceManifests(worktree)) {
    const next = readVersion(worktree, relative);
    const from = committedVersion(worktree, relative);
    if (from !== next.version) {
      bumps.push({ dir: relative, name: next.name, from, to: next.version });
    }
  }
  return bumps;
}

function changelogSection(text, version) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) {
    return undefined;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  const body = end === -1 ? rest : rest.slice(0, end);
  return [lines[start], ...body].join("\n").trimEnd();
}

function countLinesAndWords(text) {
  const trimmed = text.trim();
  return {
    lines: trimmed === "" ? 0 : trimmed.split("\n").length,
    words: trimmed === "" ? 0 : trimmed.split(/\s+/).length,
  };
}

function renderPreview(worktree, bumps) {
  const out = [];
  if (bumps.length === 0) {
    out.push("release-preview: no pending changesets, nothing would be versioned.");
    return out.join("\n");
  }
  out.push("Version bumps:");
  for (const bump of bumps) {
    out.push(`  ${bump.name}: ${bump.from ?? "(new)"} -> ${bump.to}`);
  }
  for (const bump of bumps) {
    const path = join(worktree, bump.dir, "CHANGELOG.md");
    const section = existsSync(path)
      ? changelogSection(readFileSync(path, "utf8"), bump.to)
      : undefined;
    out.push("");
    if (section === undefined) {
      out.push(`=== ${bump.name}@${bump.to}: no CHANGELOG section written ===`);
      continue;
    }
    const { lines, words } = countLinesAndWords(section);
    out.push(`=== ${bump.name}@${bump.to} (${lines} lines, ${words} words) ===`);
    out.push(section);
  }
  return out.join("\n");
}

function runVersioning(repoRoot, worktree, env) {
  symlinkSync(join(repoRoot, "node_modules"), join(worktree, "node_modules"), "dir");
  rewriteChangesetConfig(worktree, env);
  const options = { cwd: worktree, env, stdio: ["ignore", process.stderr, "inherit"] };
  execFileSync(join(repoRoot, "node_modules", ".bin", "changeset"), ["version"], options);
  execFileSync(
    process.execPath,
    [join(worktree, "scripts", "mcp-server-json.mjs"), "sync"],
    options,
  );
}

async function main(repoRoot = REPO_ROOT, env = process.env) {
  const report = await withTemporaryWorktree(repoRoot, (worktree) => {
    runVersioning(repoRoot, worktree, env);
    return renderPreview(worktree, versionBumps(worktree));
  });
  console.log(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`release-preview: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

export {
  changelogSection,
  countLinesAndWords,
  PREVIEW_CHANGELOG,
  previewConfig,
  renderPreview,
  rewriteChangesetConfig,
  versionBumps,
  withTemporaryWorktree,
};
