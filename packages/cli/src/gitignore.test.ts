import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendMissingGitignoreEntries, ensureGitignore } from "./gitignore.js";
import { captureStreams } from "./test-support.js";

function project(gitignore?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "verbatra-gitignore-"));
  if (gitignore !== undefined) {
    writeFileSync(join(dir, ".gitignore"), gitignore);
  }
  return dir;
}

function readGitignore(dir: string): string {
  return readFileSync(join(dir, ".gitignore"), "utf8");
}

function gitignoreExists(dir: string): boolean {
  try {
    readGitignore(dir);
    return true;
  } catch {
    return false;
  }
}

const restore: (() => void)[] = [];
afterEach(() => {
  for (const undo of restore.splice(0)) {
    undo();
  }
});

describe("appendMissingGitignoreEntries", () => {
  it("adds the cache entry to a .gitignore written by an older init", () => {
    const dir = project(".env\n.env.local\n.verbatra-local/\n");

    appendMissingGitignoreEntries(dir);

    expect(readGitignore(dir)).toContain("verbatra.cache.json");
  });

  it("adds every missing entry to a pre-0.5.0 .gitignore, not just the cache", () => {
    const dir = project(".env\n.env.local\n");

    appendMissingGitignoreEntries(dir);

    const content = readGitignore(dir);
    expect(content).toContain(".verbatra-local/");
    expect(content).toContain("verbatra.cache.json");
  });

  it("returns the entries it added, and none once the file is complete", () => {
    const dir = project(".env\n.env.local\n");

    expect(appendMissingGitignoreEntries(dir)).toEqual([".verbatra-local/", "verbatra.cache.json"]);
    expect(appendMissingGitignoreEntries(dir)).toEqual([]);
  });

  it("returns no entries on a dry run, when no file exists, or when the write fails", () => {
    expect(appendMissingGitignoreEntries(project(".env\n"), true)).toEqual([]);
    expect(appendMissingGitignoreEntries(project())).toEqual([]);
    const dir = project(".env\n");
    const path = join(dir, ".gitignore");
    chmodSync(path, 0o444);
    restore.push(() => chmodSync(path, 0o644));
    expect(appendMissingGitignoreEntries(dir)).toEqual([]);
  });

  it("preserves the user's own entries", () => {
    const dir = project("node_modules\ndist\n.env\n");

    appendMissingGitignoreEntries(dir);

    const content = readGitignore(dir);
    expect(content).toContain("node_modules");
    expect(content).toContain("dist");
  });

  it("writes nothing on a dry run, even with entries missing", () => {
    const before = ".env\n";
    const dir = project(before);

    appendMissingGitignoreEntries(dir, true);

    expect(readGitignore(dir)).toBe(before);
  });

  it("is idempotent: a second call changes nothing", () => {
    const dir = project(".env\n");
    appendMissingGitignoreEntries(dir);
    const afterFirst = readGitignore(dir);

    appendMissingGitignoreEntries(dir);

    expect(readGitignore(dir)).toBe(afterFirst);
  });

  it("writes nothing when every entry is already listed", () => {
    const complete = ".env\n.env.local\n.verbatra-local/\nverbatra.cache.json\n";
    const dir = project(complete);

    appendMissingGitignoreEntries(dir);

    expect(readGitignore(dir)).toBe(complete);
  });

  it("separates appended entries when the file has no trailing newline", () => {
    const dir = project(".env");

    appendMissingGitignoreEntries(dir);

    expect(readGitignore(dir).split("\n")).toContain(".env.local");
    expect(readGitignore(dir)).not.toContain(".env.env.local");
  });

  it("matches an entry written with surrounding whitespace or CRLF endings", () => {
    const dir = project(".env\r\n.env.local\r\n  .verbatra-local/  \r\nverbatra.cache.json\r\n");

    appendMissingGitignoreEntries(dir);

    expect(readGitignore(dir).match(/verbatra\.cache\.json/g)).toHaveLength(1);
  });

  it("never creates a .gitignore that does not exist", () => {
    const dir = project();

    appendMissingGitignoreEntries(dir);

    expect(gitignoreExists(dir)).toBe(false);
  });

  it("does not throw when the .gitignore cannot be written", () => {
    const dir = project(".env\n");
    const path = join(dir, ".gitignore");
    chmodSync(path, 0o444);
    restore.push(() => chmodSync(path, 0o644));

    expect(() => appendMissingGitignoreEntries(dir)).not.toThrow();
  });
});

describe("ensureGitignore", () => {
  it("creates the file with every entry when none exists", () => {
    const dir = project();
    const cap = captureStreams();

    ensureGitignore(dir, cap.streams);

    const content = readGitignore(dir);
    for (const entry of [".env", ".env.local", ".verbatra-local/", "verbatra.cache.json"]) {
      expect(content).toContain(entry);
    }
    expect(cap.out()).toContain("created .gitignore");
  });

  it("appends only the missing entries to an existing file", () => {
    const dir = project(".env\n");
    const cap = captureStreams();

    ensureGitignore(dir, cap.streams);

    expect(readGitignore(dir).match(/\.env\n/g)).toHaveLength(1);
    expect(cap.out()).toContain("updated .gitignore");
  });

  it("reports and writes nothing when every entry is present", () => {
    const complete = ".env\n.env.local\n.verbatra-local/\nverbatra.cache.json\n";
    const dir = project(complete);
    const cap = captureStreams();

    ensureGitignore(dir, cap.streams);

    expect(readGitignore(dir)).toBe(complete);
    expect(cap.out()).toContain("already ignores");
  });

  it("produces no duplicate after the run-path top-up already added the entries", () => {
    const dir = project(".env\n");
    appendMissingGitignoreEntries(dir);
    const cap = captureStreams();

    ensureGitignore(dir, cap.streams);

    expect(readGitignore(dir).match(/verbatra\.cache\.json/g)).toHaveLength(1);
    expect(cap.out()).toContain("already ignores");
  });
});
