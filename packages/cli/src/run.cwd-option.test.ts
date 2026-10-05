import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLI_ERROR_HINTS } from "./cli-error-hints.js";
import { isDirectory } from "./cwd-option.js";
import { run } from "./run.js";
import { captureStreams, parseEnvelope, recordingDeps } from "./test-support.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "verbatra-cwd-option-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const COMMANDS_TAKING_CWD: readonly (readonly string[])[] = [
  ["translate"],
  ["watch"],
  ["export"],
  ["import", "handoff.xlsx"],
  ["tmx", "export"],
  ["check"],
  ["diff"],
  ["report", "provenance"],
  ["pseudo"],
  ["types"],
  ["doctor"],
  ["studio"],
  ["mcp"],
  ["init", "--yes", "--provider", "none"],
  ["extract"],
];

function totalCalls(calls: object): number {
  return Object.values(calls).reduce(
    (sum: number, list: readonly unknown[]) => sum + list.length,
    0,
  );
}

describe("run: a --cwd that names no directory", () => {
  it.each(COMMANDS_TAKING_CWD)(
    "refuses %s with INVALID_OPTION before doing anything",
    async (...args) => {
      const missing = join(root, "missing");
      const { deps, calls } = recordingDeps({ isDirectory });
      const cap = captureStreams();

      const code = await run([...args, "--cwd", missing], deps, cap.streams);

      expect(code).toBe(2);
      expect(cap.err()).toBe(
        `verbatra: error [INVALID_OPTION] --cwd names "${missing}", which is not an existing directory. Create it first, or pass the project directory.\nnext: ${CLI_ERROR_HINTS.INVALID_OPTION}\n`,
      );
      expect(cap.out()).toBe("");
      expect(totalCalls(calls)).toBe(0);
    },
  );

  it("quotes an empty --cwd so the message shows what was passed", async () => {
    const { deps } = recordingDeps({ isDirectory });
    const cap = captureStreams();

    expect(await run(["check", "--cwd", ""], deps, cap.streams)).toBe(2);
    expect(cap.err()).toContain('--cwd names "", which is not an existing directory');
  });

  it("refuses a --cwd that names a file", async () => {
    const file = join(root, "file");
    writeFileSync(file, "");
    const { deps } = recordingDeps({ isDirectory });
    const cap = captureStreams();

    expect(await run(["check", "--cwd", file], deps, cap.streams)).toBe(2);
    expect(cap.err()).toContain("[INVALID_OPTION] --cwd names");
  });

  it("answers --json with an error envelope naming the command and the hint", async () => {
    const { deps } = recordingDeps({ isDirectory });
    const cap = captureStreams();

    expect(await run(["diff", "--json", "--cwd", join(root, "nope")], deps, cap.streams)).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "diff",
      code: "INVALID_OPTION",
      hint: CLI_ERROR_HINTS.INVALID_OPTION,
    });
  });

  it("keeps the next line off under --quiet", async () => {
    const { deps } = recordingDeps({ isDirectory });
    const cap = captureStreams();

    expect(await run(["-q", "check", "--cwd", join(root, "nope")], deps, cap.streams)).toBe(2);
    expect(cap.err()).toContain("[INVALID_OPTION]");
    expect(cap.err()).not.toContain("next:");
  });

  it("runs the command when --cwd names an existing directory", async () => {
    const { deps, calls } = recordingDeps({ isDirectory });
    const cap = captureStreams();

    expect(await run(["check", "--cwd", root], deps, cap.streams)).toBe(0);
    expect(calls.loadConfig).toHaveLength(1);
  });
});
