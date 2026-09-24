import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { type LockWaitEvent, type ProgressEvent, SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import type { TerminalFacts } from "./terminal-mode.js";
import {
  captureStreams,
  makeConfig,
  makeLocale,
  makeSummary,
  recordingDeps,
} from "./test-support.js";

const ESC = "\x1b[";

const COLOR_TTY: TerminalFacts = {
  env: { FORCE_COLOR: "1" },
  stdinIsTty: true,
  stderrIsTty: true,
};

const events: readonly ProgressEvent[] = [
  { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 1 },
  { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 1 },
  { type: "locale-finished", locale: "de", translated: 1, localeIndex: 0, totalLocales: 1 },
  { type: "run-finished", localesCompleted: 1 },
];

const lockWait: LockWaitEvent = {
  lockPath: "/p/.verbatra-local/locks/de.lock",
  elapsedMs: 5000,
};

function projectWithOldGitignore(): string {
  const dir = mkdtempSync(join(tmpdir(), "verbatra-cli-flags-"));
  writeFileSync(join(dir, ".gitignore"), ".env\n");
  return dir;
}

function eventfulDeps() {
  return recordingDeps({
    translate: async (input) => {
      input.onLockWait?.(lockWait);
      for (const event of events) {
        input.onProgress?.(event);
      }
      return makeSummary({
        succeeded: ["de"],
        locales: [makeLocale({ translated: ["a"], protected: [{ key: "b", reason: "human" }] })],
      });
    },
  });
}

describe("run: -q/--quiet", () => {
  it.each([
    [["translate", "--quiet"]],
    [["translate", "-q"]],
    [["-q", "translate"]],
    [["--quiet", "translate"]],
  ])(
    "%j drops progress lines and notices, keeps the result, warnings and hints on stderr",
    async (argv) => {
      const dir = projectWithOldGitignore();
      const cap = captureStreams();

      const code = await run([...argv, "--cwd", dir], eventfulDeps().deps, cap.streams);

      expect(code).toBe(0);
      expect(cap.out()).toContain("de: 1 translated");
      expect(cap.err()).not.toContain("translating de");
      expect(cap.err()).not.toContain("run finished");
      expect(cap.err()).not.toContain(".gitignore");
      expect(cap.err()).toContain("waiting for the write lock");
      expect(cap.err()).toContain("1 protected key was left for a person to review");
    },
  );

  it("still prints errors", async () => {
    const { deps } = recordingDeps({
      loadConfig: () => Promise.reject(new SdkError("CONFIG_INVALID", "bad config")),
    });
    const cap = captureStreams();

    expect(await run(["check", "--quiet"], deps, cap.streams)).toBe(2);
    expect(cap.err()).toBe("verbatra: error [CONFIG_INVALID] bad config\n");
  });
});

describe("run: --json stays byte-identical under every terminal setting", () => {
  it.each([
    ["a color terminal", COLOR_TTY, []],
    ["--quiet", undefined, ["--quiet"]],
    ["--no-color", COLOR_TTY, ["--no-color"]],
  ] as const)("with %s", async (_label, facts, flags) => {
    const baseline = captureStreams();
    await run(["translate", "--json"], eventfulDeps().deps, baseline.streams);

    const varied = captureStreams();
    await run(["translate", "--json", ...flags], eventfulDeps().deps, varied.streams, {}, facts);

    expect(varied.out()).toBe(baseline.out());
    expect(varied.err()).toBe(baseline.err());
    expect(varied.err()).not.toContain(ESC);
  });
});

describe("run: plain human output is unchanged by the terminal layer", () => {
  it("writes today's progress lines, with no ANSI escape, when stderr is not a terminal", async () => {
    const cap = captureStreams();

    await run(
      ["translate"],
      eventfulDeps().deps,
      cap.streams,
      {},
      {
        env: {},
        stdinIsTty: false,
        stderrIsTty: false,
      },
    );

    expect(cap.err()).toContain(
      "verbatra: translating de\nverbatra: de batch 1/1\nverbatra: de done, 1 translated\nverbatra: run finished, 1 locale processed\n",
    );
    expect(cap.err()).not.toContain(ESC);
    expect(cap.out()).not.toContain(ESC);
  });
});

describe("run: color", () => {
  const failingDeps = () =>
    recordingDeps({
      loadConfig: () => Promise.reject(new SdkError("CONFIG_INVALID", "bad config")),
    }).deps;

  it("colors the error label on a color terminal and leaves the message plain", async () => {
    const cap = captureStreams();

    await run(["check"], failingDeps(), cap.streams, {}, COLOR_TTY);

    expect(cap.err()).toBe(`verbatra: ${ESC}31merror${ESC}39m [CONFIG_INVALID] bad config\n`);
  });

  it.each([
    [["check", "--no-color"], COLOR_TTY],
    [["--no-color", "check"], COLOR_TTY],
    [["check"], { ...COLOR_TTY, env: { FORCE_COLOR: "1", VERBATRA_NO_COLOR: "1" } }],
  ] as const)("%j turns color off", async (argv, facts) => {
    const cap = captureStreams();

    await run([...argv], failingDeps(), cap.streams, {}, facts);

    expect(cap.err()).toBe("verbatra: error [CONFIG_INVALID] bad config\n");
  });

  it("never colors stdout, even on a color terminal", async () => {
    const cap = captureStreams();

    await run(["translate"], eventfulDeps().deps, cap.streams, {}, COLOR_TTY);

    expect(cap.out()).not.toContain(ESC);
    expect(stripVTControlCharacters(cap.err())).toContain("verbatra: translating de");
  });
});

describe("run: the global flags appear in --help", () => {
  it("documents -q/--quiet and --no-color", async () => {
    const cap = captureStreams();

    expect(await run(["--help"], recordingDeps().deps, cap.streams)).toBe(0);
    expect(cap.out()).toContain("-q, --quiet");
    expect(cap.out()).toContain("--no-color");
  });

  it("keeps a config-less check working with the flags on", async () => {
    const { deps } = recordingDeps({ loadConfig: async () => makeConfig() });

    expect(await run(["check", "-q", "--no-color"], deps, captureStreams().streams)).toBe(0);
  });
});
