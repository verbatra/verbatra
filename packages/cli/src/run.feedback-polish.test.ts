import { describe, expect, it } from "vitest";
import { renderCheckHuman, renderInterrupted, renderProgressHuman } from "./render.js";
import { run } from "./run.js";
import {
  captureStreams,
  flush,
  makeCheckSummary,
  makeConfig,
  makeDiffSummary,
  makeLocale,
  makeMcpModule,
  makeSummary,
  type RecordingImpl,
  recordingDeps,
} from "./test-support.js";
import type { RunHooks, Session } from "./types.js";

const humanOnly = makeConfig({ provider: { id: "none", options: {} } });

async function runWith(argv: readonly string[], impl: RecordingImpl, hooks: RunHooks = {}) {
  const cap = captureStreams();
  const code = await run([...argv], recordingDeps(impl).deps, cap.streams, hooks);
  return { code, err: cap.err(), out: cap.out() };
}

describe("translate: progress and hints", () => {
  it("says a dry-run locale would translate its keys rather than that it translated them", () => {
    const event = {
      type: "locale-finished",
      locale: "de",
      status: "succeeded",
      translated: 3,
      localeIndex: 0,
      totalLocales: 1,
    } as const;

    expect(renderProgressHuman(event, true)).toBe("verbatra: de done, 3 would translate");
    expect(renderProgressHuman(event)).toBe("verbatra: de done, 3 translated");
  });

  it("uses the dry-run wording for the progress of a translate --dry-run", async () => {
    const { err } = await runWith(["translate", "--dry-run"], {
      translate: async (input) => {
        input.onProgress?.({
          type: "locale-finished",
          locale: "de",
          status: "succeeded",
          translated: 3,
          localeIndex: 0,
          totalLocales: 1,
        });
        return makeSummary({ dryRun: true });
      },
    });

    expect(err).toContain("verbatra: de done, 3 would translate\n");
  });

  it.each([
    ["an estimate", ["translate", "--estimate"], true],
    ["a live run", ["translate"], false],
  ])(
    "points %s under provider none that needs a person at the handoff, not at a real run",
    async (_label, argv, dryRun) => {
      const { code, err } = await runWith(argv, {
        loadConfig: async () => humanOnly,
        translate: async () =>
          makeSummary({
            dryRun,
            partial: [],
            succeeded: ["de"],
            locales: [makeLocale({ unfilled: ["a", "b"] })],
          }),
      });

      expect(code).toBe(3);
      expect(err).not.toContain("run it for real");
      expect(err).toContain(
        "next: verbatra export (hand the keys that need a person to a translator, or edit them in verbatra studio)\n",
      );
    },
  );
});

describe("provider none: next steps point at the human handoff", () => {
  const HAND_OFF =
    "next: verbatra export (hand the keys that need a person to a translator, or edit them in verbatra studio)\n";

  it("check says out of sync with the handoff, never translate", async () => {
    const { out } = await runWith(["check"], {
      loadConfig: async () => humanOnly,
      check: async () =>
        makeCheckSummary({
          inSync: false,
          locales: [{ locale: "de", missing: 1, stale: 0, upToDate: 1, inSync: false }],
        }),
    });

    expect(out).not.toContain("verbatra translate");
    expect(out).toContain(
      "out of sync (machine translation is disabled: hand the keys to a translator with verbatra export, or edit them in verbatra studio)",
    );
  });

  it("diff points at export for the pending keys", async () => {
    const { err } = await runWith(["diff"], {
      loadConfig: async () => humanOnly,
      diff: async () => makeDiffSummary({ hasPendingChanges: true }),
    });

    expect(err).not.toContain("verbatra translate");
    expect(err).toContain(HAND_OFF);
  });

  it("a dry run with nothing to fill points at check, not at a real run", async () => {
    const { code, err } = await runWith(["translate", "--dry-run"], {
      loadConfig: async () => humanOnly,
      translate: async () => makeSummary({ dryRun: true, locales: [makeLocale({})] }),
    });

    expect(code).toBe(0);
    expect(err).not.toContain("run it for real");
    expect(err).toContain("next: verbatra check (confirm every locale is in sync)\n");
  });

  it("a dry run the translation memory would fill still offers the real run", async () => {
    const { err } = await runWith(["translate", "--dry-run"], {
      loadConfig: async () => humanOnly,
      translate: async () =>
        makeSummary({ dryRun: true, locales: [makeLocale({ translated: ["a"] })] }),
    });

    expect(err).toContain("next: verbatra translate (run it for real)\n");
  });
});

describe("check and diff: every pending key protected", () => {
  it("diff points at Studio when every missing or changed key is protected", async () => {
    const { err } = await runWith(["diff"], {
      diff: async () =>
        makeDiffSummary({
          hasPendingChanges: true,
          locales: [
            {
              locale: "de",
              missing: [],
              changed: ["a", "b"],
              orphaned: [],
              hasPendingChanges: true,
              protected: ["a", "b"],
            },
          ],
        }),
    });

    expect(err).not.toContain("verbatra translate");
    expect(err).toContain(
      "next: verbatra studio (every pending key is protected from machine writes, so review or edit it there)\n",
    );
  });

  it("diff still points at translate when one pending key is not protected", async () => {
    const { err } = await runWith(["diff"], {
      diff: async () =>
        makeDiffSummary({
          hasPendingChanges: true,
          locales: [
            {
              locale: "de",
              missing: ["c"],
              changed: ["a"],
              orphaned: [],
              hasPendingChanges: true,
              protected: ["a"],
            },
          ],
        }),
    });

    expect(err).toContain("next: verbatra translate (send the pending keys to your provider)\n");
  });

  it("check advises a review instead of translate when every stale key is protected", () => {
    const protectedOnly = makeCheckSummary({
      inSync: false,
      locales: [{ locale: "de", missing: 0, stale: 2, upToDate: 1, inSync: false, protected: 2 }],
    });
    const translatable = makeCheckSummary({
      inSync: false,
      locales: [{ locale: "de", missing: 1, stale: 2, upToDate: 1, inSync: false, protected: 2 }],
    });

    expect(renderCheckHuman(protectedOnly)).toContain(
      "out of sync (every stale key is protected from machine writes: review or edit it in verbatra studio)",
    );
    expect(renderCheckHuman(translatable)).toContain(
      "out of sync (run verbatra translate to update)",
    );
  });
});

describe("mcp: --json is refused without touching stdout", () => {
  it("exits 2, explains the refusal on stderr, and writes nothing to stdout", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["mcp", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).toContain(
      "verbatra: error [USAGE_ERROR] mcp does not take --json: its stdout carries only MCP protocol messages",
    );
    expect(calls.importMcp).toHaveLength(0);
  });

  it("prints exactly one error line, without commander's own unknown-option line", async () => {
    const cap = captureStreams();

    await run(["mcp", "--json"], recordingDeps().deps, cap.streams);

    const lines = cap
      .err()
      .split("\n")
      .filter((line) => line.trim() !== "");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^verbatra: error \[USAGE_ERROR\] mcp does not take --json/);
  });

  it("still reports another unknown mcp option through commander", async () => {
    const cap = captureStreams();

    const code = await run(["mcp", "--bogus"], recordingDeps().deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).toContain("error: unknown option '--bogus'");
  });

  it("keeps the envelope for another command's usage error under --json", async () => {
    const cap = captureStreams();

    const code = await run(["check", "--json", "--bogus"], recordingDeps().deps, cap.streams);

    expect(code).toBe(2);
    expect(JSON.parse(cap.out())).toMatchObject({ ok: false, code: "USAGE_ERROR" });
  });
});

describe("mcp: the signal hook is installed before the ready lines", () => {
  it("hands the session to the hook before the ready line and hint are printed", async () => {
    const cap = captureStreams();
    let errWhenHooked: string | undefined;
    let session: Session | undefined;
    const { deps } = recordingDeps({ importMcp: async () => makeMcpModule() });

    const done = run(
      ["mcp"],
      deps,
      cap.streams,
      {
        onMcpSession: (started) => {
          errWhenHooked = cap.err();
          session = started;
        },
      },
      { env: { NO_COLOR: "1" }, stdinIsTty: true, stderrIsTty: true, stdoutIsTty: true },
    );
    await flush();
    session?.requestStop();

    expect(await done).toBe(0);
    expect(errWhenHooked).toBe("");
    expect(cap.err()).toContain("verbatra MCP server");
  });
});

describe("interrupt: the stop line", () => {
  const released = { status: "released" } as const;
  const failed = { status: "failed", message: "EACCES: permission denied" } as const;
  const timedOut = { status: "timed-out", deadlineMs: 5_000 } as const;

  it("renders a human line and a JSON record after the locks were released", () => {
    expect(renderInterrupted("SIGINT", false, released)).toBe(
      "verbatra: interrupted (SIGINT), released locks",
    );
    expect(JSON.parse(renderInterrupted("SIGTERM", true, released))).toEqual({
      type: "interrupted",
      signal: "SIGTERM",
      locksReleased: true,
    });
  });

  it("says the locks were not released when the release failed", () => {
    const human = renderInterrupted("SIGINT", false, failed);

    expect(human).toContain("verbatra: interrupted (SIGINT), could not release locks");
    expect(human).toContain("EACCES: permission denied");
    expect(human).not.toContain("released locks");
    expect(JSON.parse(renderInterrupted("SIGINT", true, failed))).toEqual({
      type: "interrupted",
      signal: "SIGINT",
      locksReleased: false,
      reason: "failed",
      message: "EACCES: permission denied",
    });
  });

  it("says the release did not finish when the deadline elapsed", () => {
    expect(renderInterrupted("SIGTERM", false, timedOut)).toContain(
      "verbatra: interrupted (SIGTERM), lock release did not finish within 5s",
    );
    expect(JSON.parse(renderInterrupted("SIGTERM", true, timedOut))).toEqual({
      type: "interrupted",
      signal: "SIGTERM",
      locksReleased: false,
      reason: "timed-out",
      deadlineMs: 5_000,
    });
  });

  it.each([
    [["translate"], false],
    [["translate", "--json"], true],
    [["import", "handoff.xlsx", "--json"], true],
  ])("tells the locking hook whether %j runs under --json", async (argv, json) => {
    const modes: boolean[] = [];

    await runWith(argv, {}, { onLockingCommand: (mode) => modes.push(mode.json) });

    expect(modes).toEqual([json]);
  });
});
