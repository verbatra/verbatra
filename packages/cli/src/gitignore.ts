import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const GITIGNORE_ENTRIES = [".env", ".env.local", ".verbatra-local/", "verbatra.cache.json"];

function missingEntries(content: string): string[] {
  const present = new Set(content.split(/\r?\n/).map((line) => line.trim()));
  return GITIGNORE_ENTRIES.filter((entry) => !present.has(entry));
}

function appendedEntries(content: string, entries: readonly string[]): string {
  const prefix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${prefix}${entries.join("\n")}\n`;
}

function appendEntries(path: string, content: string, entries: readonly string[]): void {
  appendFileSync(path, appendedEntries(content, entries));
}

export type GitignoreAction = "created" | "updated" | "unchanged";

export interface GitignorePlan {
  readonly action: GitignoreAction;
  readonly content: string;
  readonly note: string;
}

export function planGitignore(cwd: string): GitignorePlan {
  const gitignorePath = resolve(cwd, ".gitignore");
  if (!existsSync(gitignorePath)) {
    return {
      action: "created",
      content: `# Local environment files (never commit real keys)\n${GITIGNORE_ENTRIES.join("\n")}\n`,
      note: GITIGNORE_ENTRIES.join(", "),
    };
  }
  const content = readFileSync(gitignorePath, "utf8");
  const missing = missingEntries(content);
  if (missing.length === 0) {
    return {
      action: "unchanged",
      content,
      note: `already ignores ${GITIGNORE_ENTRIES.join(", ")}`,
    };
  }
  return {
    action: "updated",
    content: `${content}${appendedEntries(content, missing)}`,
    note: `added ${missing.join(", ")}`,
  };
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
