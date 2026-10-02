import { describe, expect, it, vi } from "vitest";
import { baseConfig } from "../test-support.js";
import type { GitExecFile } from "./git-log.js";
import { LOCALE_HISTORY_LIMIT_CAP } from "./git-log.js";
import { localeHistory } from "./locale-history.js";

const COMMIT =
  "\x1eabc\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1fupdate de\0\nlocales/de.json\0";

function stubExecFile(stdout: string): GitExecFile & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ stdout, stderr: "" })) as unknown as GitExecFile &
    ReturnType<typeof vi.fn>;
}

function failingExecFile(failure: Record<string, unknown>): GitExecFile {
  return async () => {
    throw Object.assign(new Error("git failed"), failure);
  };
}

describe("localeHistory", () => {
  it("runs git log in cwd over the source and every target locale file", async () => {
    const execFile = stubExecFile(COMMIT);

    const result = await localeHistory(
      { config: baseConfig({ targetLocales: ["de", "fr"] }), cwd: "/project" },
      { execFile },
    );

    expect(result).toEqual({
      available: true,
      commits: [
        {
          hash: "abc",
          author: "Ada Lovelace",
          authorDate: "2026-01-01T00:00:00+00:00",
          subject: "update de",
          touchedPaths: ["locales/de.json"],
        },
      ],
    });
    const [file, args, options] = execFile.mock.calls[0] as [string, string[], { cwd: string }];
    expect(file).toBe("git");
    expect(options).toEqual({ cwd: "/project" });
    expect(args.slice(args.indexOf("--") + 1)).toEqual([
      "/project/locales/en.json",
      "/project/locales/de.json",
      "/project/locales/fr.json",
    ]);
  });

  it("never asks git for the author email", async () => {
    const execFile = stubExecFile("");

    await localeHistory({ config: baseConfig(), cwd: "/project" }, { execFile });

    const args = execFile.mock.calls[0]?.[1] as string[];
    expect(args.join(" ")).not.toMatch(/%a[eE]|%c[eE]/);
  });

  it("clamps the limit to the cap", async () => {
    const execFile = stubExecFile("");

    await localeHistory({ config: baseConfig(), cwd: "/project", limit: 5000 }, { execFile });

    expect(execFile.mock.calls[0]?.[1]).toContain(`--max-count=${LOCALE_HISTORY_LIMIT_CAP}`);
  });

  it("returns an empty history for a repository with no commits on the locale files", async () => {
    const result = await localeHistory(
      { config: baseConfig(), cwd: "/project" },
      { execFile: stubExecFile("") },
    );

    expect(result).toEqual({ available: true, commits: [] });
  });

  it("reports itself unavailable when git is not installed", async () => {
    const result = await localeHistory(
      { config: baseConfig(), cwd: "/project" },
      { execFile: failingExecFile({ code: "ENOENT" }) },
    );

    expect(result).toEqual({ available: false });
  });

  it("reports itself unavailable outside a git repository", async () => {
    const result = await localeHistory(
      { config: baseConfig(), cwd: "/project" },
      { execFile: failingExecFile({ code: 128, stderr: "fatal: not a git repository" }) },
    );

    expect(result).toEqual({ available: false });
  });

  it("never passes a locale path that resolves to a git option", async () => {
    const execFile = stubExecFile("");

    await localeHistory(
      {
        config: baseConfig({ targetLocales: ["de"], files: { pattern: "-x{locale}.json" } }),
        cwd: "/project",
      },
      { execFile },
    );

    const args = execFile.mock.calls[0]?.[1] as string[];
    const paths = args.slice(args.indexOf("--") + 1);
    expect(paths).toEqual(["/project/-xen.json", "/project/-xde.json"]);
    expect(args.slice(0, args.indexOf("--")).some((arg) => arg.startsWith("-x"))).toBe(false);
  });

  it("skips git entirely when every locale path leaves the project", async () => {
    const execFile = stubExecFile("");

    const result = await localeHistory(
      {
        config: baseConfig({ files: { pattern: "../outside/{locale}.json" } }),
        cwd: "/project",
      },
      { execFile },
    );

    expect(result).toEqual({ available: true, commits: [] });
    expect(execFile).not.toHaveBeenCalled();
  });
});
