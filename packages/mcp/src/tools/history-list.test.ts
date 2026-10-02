import type { GitExecFile } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { baseLoadedConfig, baseVerbatraConfig, makeContext } from "../test-support.js";
import { historyListTool } from "./history-list.js";

const COMMIT =
  "\x1eabc\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1fupdate de\0\nlocales/de.json\0";

function stub(stdout: string): GitExecFile & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ stdout, stderr: "" })) as unknown as GitExecFile &
    ReturnType<typeof vi.fn>;
}

function failing(failure: Record<string, unknown>): GitExecFile {
  return async () => {
    throw Object.assign(new Error("git failed"), failure);
  };
}

describe("history.list", () => {
  it("lists commits with the author name and never an email", async () => {
    const execFile = stub(COMMIT);

    const outcome = await historyListTool.execute({}, makeContext({ cwd: "/project", execFile }));

    expect(outcome).toEqual({
      kind: "ok",
      result: {
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
      },
    });
    const args = execFile.mock.calls[0]?.[1] as string[];
    expect(args.join(" ")).not.toMatch(/%a[eE]/);
  });

  it("returns an empty history when no commit touched the locale files", async () => {
    const outcome = await historyListTool.execute(
      {},
      makeContext({ cwd: "/project", execFile: stub("") }),
    );

    expect(outcome).toEqual({ kind: "ok", result: { available: true, commits: [] } });
  });

  it("reports itself unavailable when git is not installed", async () => {
    const outcome = await historyListTool.execute(
      {},
      makeContext({ cwd: "/project", execFile: failing({ code: "ENOENT" }) }),
    );

    expect(outcome).toEqual({ kind: "ok", result: { available: false } });
  });

  it("reports itself unavailable outside a git repository", async () => {
    const outcome = await historyListTool.execute(
      {},
      makeContext({
        cwd: "/project",
        execFile: failing({ code: 128, stderr: "fatal: not a git repository" }),
      }),
    );

    expect(outcome).toEqual({ kind: "ok", result: { available: false } });
  });

  it("passes a locale path shaped like an option only after the -- separator", async () => {
    const execFile = stub("");
    const config = baseVerbatraConfig({ files: { pattern: "-x{locale}.json" } });

    await historyListTool.execute(
      {},
      makeContext({ cwd: "/project", execFile, config: baseLoadedConfig({ config }) }),
    );

    const args = execFile.mock.calls[0]?.[1] as string[];
    const separator = args.indexOf("--");
    expect(args.slice(0, separator).some((arg) => arg.startsWith("-x"))).toBe(false);
    expect(args.slice(separator + 1)).toEqual(["/project/-xen.json", "/project/-xde.json"]);
  });

  it("caps a large limit at the server's maximum", async () => {
    const execFile = stub("");

    await historyListTool.execute({ limit: 5000 }, makeContext({ cwd: "/project", execFile }));

    expect(execFile.mock.calls[0]?.[1]).toContain("--max-count=200");
  });

  it.each([{ limit: 0 }, { limit: 1.5 }, { since: "yesterday" }])(
    "rejects the invalid input %j",
    async (params) => {
      const outcome = await historyListTool.execute(params, makeContext());

      expect(outcome.kind).toBe("invalid");
    },
  );
});
