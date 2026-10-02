import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Streams } from "./types.js";

const GITIGNORE_ENTRIES = [".env", ".env.local", ".verbatra-local/", "verbatra.cache.json"];

function missingEntries(content: string): string[] {
  const present = new Set(content.split(/\r?\n/).map((line) => line.trim()));
  return GITIGNORE_ENTRIES.filter((entry) => !present.has(entry));
}

function appendEntries(path: string, content: string, entries: readonly string[]): void {
  const prefix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  appendFileSync(path, `${prefix}${entries.join("\n")}\n`);
}

export type GitignoreAction = "created" | "updated" | "unchanged";

export function ensureGitignore(cwd: string, streams: Streams): GitignoreAction {
  const gitignorePath = resolve(cwd, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(
      gitignorePath,
      `# Local environment files (never commit real keys)\n${GITIGNORE_ENTRIES.join("\n")}\n`,
    );
    streams.out(`created .gitignore (${GITIGNORE_ENTRIES.join(", ")})\n`);
    return "created";
  }
  const content = readFileSync(gitignorePath, "utf8");
  const missing = missingEntries(content);
  if (missing.length === 0) {
    streams.out(`.gitignore already ignores ${GITIGNORE_ENTRIES.join(", ")}\n`);
    return "unchanged";
  }
  appendEntries(gitignorePath, content, missing);
  streams.out(`updated .gitignore (added ${missing.join(", ")})\n`);
  return "updated";
}

export function appendMissingGitignoreEntries(cwd: string, dryRun = false): readonly string[] {
  if (dryRun) {
    return [];
  }
  try {
    const gitignorePath = resolve(cwd, ".gitignore");
    if (!existsSync(gitignorePath)) {
      return [];
    }
    const content = readFileSync(gitignorePath, "utf8");
    const missing = missingEntries(content);
    if (missing.length > 0) {
      appendEntries(gitignorePath, content, missing);
    }
    return missing;
  } catch {
    return [];
  }
}
