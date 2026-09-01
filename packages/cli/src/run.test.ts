import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type LockWaitEvent,
  type ProgressEvent,
  SdkError,
  type WatchController,
} from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run, runTranslate } from "./run.js";
import {
  captureStreams,
  flush,
  makeCheckSummary,
  makeConfig,
  makeLocale,
  makeSummary,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";
import type { CliDeps, Session } from "./types.js";

describe("run translate: SDK delegation and rendering", () => {
  it("calls the SDK translate() with the resolved config and renders the summary human-readably", async () => {
    const cfg = makeConfig();
    const summary = makeSummary({
      locales: [makeLocale({ translated: ["a"] })],
      succeeded: ["de"],
    });
    const { deps, calls } = recordingDeps({
      loadConfig: async () => cfg,
      translate: async () => summary,
    });
    const cap = captureStreams();

    const code = await run(["translate"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.translate).toHaveLength(1);
    expect(calls.translate[0]).toMatchObject({ config: cfg, cwd: process.cwd() });
    expect(typeof calls.translate[0]?.onLockWait).toBe("function");
    expect(calls.translate[0]).not.toHaveProperty("lockAcquireTimeoutMs");
    expect(cap.out()).toContain("de: 1 translated");
    expect(cap.err()).toBe("");
  });

  it("--config passes configPath to loadConfig and --cwd feeds both loadConfig and translate", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["translate", "--config", "ci.json", "--cwd", "/proj"], deps, cap.streams);

    expect(calls.loadConfig[0]).toEqual({ cwd: "/proj", configPath: "ci.json" });
    expect(calls.translate[0]?.cwd).toBe("/proj");
  });

  it("without --config, loadConfig is called without configPath (search applies)", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["translate"], deps, cap.streams);

    expect(calls.loadConfig[0]).toEqual({ cwd: process.cwd() });
    expect(calls.loadConfig[0]).not.toHaveProperty("configPath");
  });

  it("--dry-run passes dryRun:true and does a single translate call", async () => {
    const { deps, calls } = recordingDeps({
      translate: async (input) => makeSummary({ dryRun: input.dryRun === true }),
    });
    const cap = captureStreams();

    const code = await run(["translate", "--dry-run"], deps, cap.streams);

    expect(calls.translate).toHaveLength(1);
    expect(calls.translate[0]?.dryRun).toBe(true);
    expect(cap.out()).toContain("dry run");
    expect(code).toBe(0);
  });

  it("--json emits one success envelope on stdout, nothing else; stderr stays empty", async () => {
    const summary = makeSummary({ succeeded: ["de"] });
    const { deps } = recordingDeps({ translate: async () => summary });
    const cap = captureStreams();

    const code = await run(["translate", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "translate",
      result: summary,
    });
    expect(cap.err()).toBe("");
  });

  it("--prune passes prune:true to the SDK translate call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["translate", "--prune"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.translate[0]?.prune).toBe(true);
  });

  it("without --prune, no prune field is sent (off by default)", async () => {
    const { deps, calls } = recordingDeps();
    await run(["translate"], deps, captureStreams().streams);
    expect(calls.translate[0]).not.toHaveProperty("prune");
  });

  it("renders the pruned count in the human summary and the pruned keys under --json", async () => {
    const summary = makeSummary({
      locales: [makeLocale({ orphaned: ["x", "y"], pruned: ["x", "y"] })],
      succeeded: ["de"],
    });
    const { deps } = recordingDeps({ translate: async () => summary });

    const human = captureStreams();
    await run(["translate", "--prune"], deps, human.streams);
    expect(human.out()).toContain("2 pruned");
    expect(human.out()).toContain("2 orphaned");

    const json = captureStreams();
    await run(["translate", "--prune", "--json"], deps, json.streams);
    const parsed = parseEnvelope(json.out()).result as typeof summary;
    expect(parsed.locales[0]?.pruned).toEqual(["x", "y"]);
  });

  it("--json includes usage, budget, and budgetWithheld verbatim from the RunSummary", async () => {
    const summary = makeSummary({
      locales: [
        makeLocale({
          usage: { inputTokens: 100, outputTokens: 50 },
          budgetWithheld: ["a.title"],
        }),
      ],
      succeeded: ["de"],
      usage: { inputTokens: 100, outputTokens: 50 },
      budget: {
        maxTokens: 1000,
        behavior: "stop",
        supported: true,
        tokensUsed: 100,
        exceeded: false,
      },
    });
    const { deps } = recordingDeps({ translate: async () => summary });
    const cap = captureStreams();

    const code = await run(["translate", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    expect(parseEnvelope(cap.out()).result).toEqual(summary);
  });
});

describe("run translate: lock-wait progress and --lock-timeout", () => {
  const waitEvent: LockWaitEvent = {
    lockPath: "/proj/.verbatra-local/locks/de.lock",
    elapsedMs: 2_000,
    holder: { pid: 4321, acquiredAt: "2026-07-18T00:00:00.000Z" },
  };

  it("renders the human waiting line to stderr, naming the path, holder pid, and delete hint", async () => {
    const { deps } = recordingDeps({
      translate: async (input) => {
        input.onLockWait?.(waitEvent);
        return makeSummary({ succeeded: ["de"] });
      },
    });
    const cap = captureStreams();

    const code = await run(["translate"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.err()).toContain("waiting for the write lock");
    expect(cap.err()).toContain("/proj/.verbatra-local/locks/de.lock");
    expect(cap.err()).toContain("pid 4321");
    expect(cap.err()).toContain("can be deleted");
    expect(cap.out()).not.toContain("waiting for the write lock");
  });

  it("under --json, keeps stdout to the one envelope and emits the wait event as JSON on stderr", async () => {
    const summary = makeSummary({ succeeded: ["de"] });
    const { deps } = recordingDeps({
      translate: async (input) => {
        input.onLockWait?.(waitEvent);
        return summary;
      },
    });
    const cap = captureStreams();

    const code = await run(["translate", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    expect(parseEnvelope(cap.out()).result).toEqual(summary);
    expect(JSON.parse(cap.err().trim())).toMatchObject({
      type: "lock-wait",
      lockPath: waitEvent.lockPath,
      holder: { pid: 4321 },
    });
  });

  it("--lock-timeout passes the timeout to the SDK as milliseconds", async () => {
    const { deps, calls } = recordingDeps();

    const code = await run(["translate", "--lock-timeout", "45"], deps, captureStreams().streams);

    expect(code).toBe(0);
    expect(calls.translate[0]?.lockAcquireTimeoutMs).toBe(45_000);
  });

  it("a non-numeric --lock-timeout is a usage error (exit 2), stdout stays clean", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["translate", "--lock-timeout", "abc"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("INVALID_LOCK_TIMEOUT");
    expect(cap.out()).toBe("");
  });

  it("a zero or negative --lock-timeout is a usage error (exit 2)", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["translate", "--lock-timeout", "0"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("INVALID_LOCK_TIMEOUT");
  });

  it("a --lock-timeout above the maximum is a usage error (exit 2), no SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["translate", "--lock-timeout", "3601"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("INVALID_LOCK_TIMEOUT");
    expect(calls.translate).toHaveLength(0);
  });
});

describe("run translate: --concurrency", () => {
  it("passes a valid --concurrency to the SDK translate() as a number", async () => {
    const { deps, calls } = recordingDeps();

    const code = await run(["translate", "--concurrency", "4"], deps, captureStreams().streams);

    expect(code).toBe(0);
    expect(calls.translate[0]?.concurrency).toBe(4);
  });

  it("omitting --concurrency leaves it unset (the SDK applies its serial default of 1)", async () => {
    const { deps, calls } = recordingDeps();

    await run(["translate"], deps, captureStreams().streams);

    expect(calls.translate[0]).not.toHaveProperty("concurrency");
  });

  it.each(["abc", "0", "-2", "2.5", "3ms", "101"])(
    "rejects an invalid --concurrency %s as a usage error: exit 2, structured stderr, no SDK call",
    async (value) => {
      const { deps, calls } = recordingDeps();
      const cap = captureStreams();

      const code = await run(["translate", "--concurrency", value], deps, cap.streams);

      expect(code).toBe(2);
      expect(cap.err()).toContain("[INVALID_CONCURRENCY]");
      expect(cap.out()).toBe("");
      expect(calls.translate).toHaveLength(0);
    },
  );

  it("a watch startup concurrency refusal exits 2 with the structured error", async () => {
    const { deps } = recordingDeps({
      watch: () =>
        Promise.reject(
          new SdkError("CONCURRENCY_BUDGET_CONFLICT", "budget and concurrency cannot combine"),
        ),
    });
    const cap = captureStreams();

    const code = await run(["watch", "--concurrency", "2"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).toContain("[CONCURRENCY_BUDGET_CONFLICT]");
  });
});

describe("run translate/watch: --no-cache", () => {
  it("passes cache: false to the SDK translate() when --no-cache is set", async () => {
    const { deps, calls } = recordingDeps();

    const code = await run(["translate", "--no-cache"], deps, captureStreams().streams);

    expect(code).toBe(0);
    expect(calls.translate[0]?.cache).toBe(false);
  });

  it("omitting --no-cache leaves cache unset so the SDK default (on) applies", async () => {
    const { deps, calls } = recordingDeps();

    await run(["translate"], deps, captureStreams().streams);

    expect(calls.translate[0]).not.toHaveProperty("cache");
  });

  it("passes cache: false through to every watch run when --no-cache is set", async () => {
    let resolveStop: (() => void) | undefined;
    const { deps, calls } = recordingDeps({
      watch: () =>
        Promise.resolve({
          stop: () =>
            new Promise<void>((resolve) => {
              resolveStop = resolve;
            }),
        } satisfies WatchController),
    });

    let session: Session | undefined;
    const done = run(["watch", "--no-cache"], deps, captureStreams().streams, {
      onWatchSession: (s) => {
        session = s;
      },
    });
    await flush();
    session?.requestStop();
    resolveStop?.();

    expect(await done).toBe(0);
    expect(calls.watch[0]?.cache).toBe(false);
  });
});

describe("run translate: progress reporting", () => {
  const events: readonly ProgressEvent[] = [
    { type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 2 },
    { type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 2 },
    { type: "locale-finished", locale: "de", translated: 3, localeIndex: 0, totalLocales: 2 },
    { type: "run-finished", localesCompleted: 2 },
  ];

  it("passes an onProgress function to the SDK translate call", async () => {
    const { deps, calls } = recordingDeps();
    await run(["translate"], deps, captureStreams().streams);
    expect(typeof calls.translate[0]?.onProgress).toBe("function");
  });

  it("renders human progress lines to stderr, keeping stdout to the summary", async () => {
    const summary = makeSummary({ succeeded: ["de"] });
    const { deps } = recordingDeps({
      translate: async (input) => {
        for (const event of events) {
          input.onProgress?.(event);
        }
        return summary;
      },
    });
    const cap = captureStreams();

    const code = await run(["translate"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.err()).toContain("translating de");
    expect(cap.err()).toContain("de batch 1/2");
    expect(cap.err()).toContain("de done, 3 translated");
    expect(cap.err()).toContain("run finished, 2 locales processed");
    expect(cap.out()).not.toContain("translating de");
  });

  it("under --json, emits one JSON record per event on stderr and keeps stdout the one envelope", async () => {
    const summary = makeSummary({ succeeded: ["de"] });
    const { deps } = recordingDeps({
      translate: async (input) => {
        for (const event of events) {
          input.onProgress?.(event);
        }
        return summary;
      },
    });
    const cap = captureStreams();

    const code = await run(["translate", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    expect(parseEnvelope(cap.out()).result).toEqual(summary);
    const lines = cap.err().trim().split("\n");
    expect(lines).toHaveLength(events.length);
    expect(lines.map((line) => JSON.parse(line))).toEqual(events);
  });

  it("stdout is byte-identical whether or not progress events fire (human and --json)", async () => {
    const summary = makeSummary({ succeeded: ["de"] });
    const withEvents = recordingDeps({
      translate: async (input) => {
        for (const event of events) {
          input.onProgress?.(event);
        }
        return summary;
      },
    });
    const withoutEvents = recordingDeps({ translate: async () => summary });

    const humanWith = captureStreams();
    const humanWithout = captureStreams();
    await run(["translate"], withEvents.deps, humanWith.streams);
    await run(["translate"], withoutEvents.deps, humanWithout.streams);
    expect(humanWith.out()).toBe(humanWithout.out());

    const jsonWith = captureStreams();
    const jsonWithout = captureStreams();
    await run(["translate", "--json"], withEvents.deps, jsonWith.streams);
    await run(["translate", "--json"], withoutEvents.deps, jsonWithout.streams);
    expect(jsonWith.out()).toBe(jsonWithout.out());
  });
});

describe("run translate: exit codes", () => {
  it("all locales clean -> 0", async () => {
    const { deps } = recordingDeps({ translate: async () => makeSummary({ succeeded: ["de"] }) });
    expect(await run(["translate"], deps, captureStreams().streams)).toBe(0);
  });

  it("a per-locale failure -> 1", async () => {
    const summary = makeSummary({
      locales: [makeLocale({ status: "failed", error: { code: "LOCALE_FAILED", message: "x" } })],
      failed: ["de"],
    });
    const { deps } = recordingDeps({ translate: async () => summary });
    expect(await run(["translate"], deps, captureStreams().streams)).toBe(1);
  });

  it("an all-withheld locale (status failed, no error) -> 1", async () => {
    const summary = makeSummary({
      locales: [makeLocale({ status: "failed", providerFailures: ["greeting"] })],
      failed: ["de"],
    });
    const { deps } = recordingDeps({ translate: async () => summary });
    expect(await run(["translate"], deps, captureStreams().streams)).toBe(1);
  });

  it("a partial locale (wrote some, withheld some) -> 1", async () => {
    const summary = makeSummary({
      locales: [
        makeLocale({ status: "partial", translated: ["greeting"], providerFailures: ["farewell"] }),
      ],
      partial: ["de"],
    });
    const { deps } = recordingDeps({ translate: async () => summary });
    expect(await run(["translate"], deps, captureStreams().streams)).toBe(1);
  });

  it("a partial locale with no failed locale still exits 1, so a half-done run cannot pass CI", async () => {
    const summary = makeSummary({
      locales: [
        makeLocale({ status: "partial", translated: ["greeting"], providerFailures: ["farewell"] }),
      ],
      succeeded: [],
      partial: ["de"],
      failed: [],
    });
    const { deps } = recordingDeps({ translate: async () => summary });
    expect(await run(["translate"], deps, captureStreams().streams)).toBe(1);
  });

  it("a whole-run SdkError -> 2, structured error on stderr, stdout empty", async () => {
    const { deps } = recordingDeps({
      translate: async () => {
        throw new SdkError("SOURCE_UNREADABLE", "no source");
      },
    });
    const cap = captureStreams();

    const code = await run(["translate"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[SOURCE_UNREADABLE] no source");
    expect(cap.out()).toBe("");
  });

  it("under --json a whole-run error emits one error envelope on stdout and still exits 2", async () => {
    const { deps } = recordingDeps({
      loadConfig: async () => {
        throw new SdkError("CONFIG_INVALID", "bad config");
      },
    });
    const cap = captureStreams();

    const code = await run(["translate", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out().split("\n").filter(Boolean)).toHaveLength(1);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: false,
      version: JSON_ENVELOPE_VERSION,
      command: "translate",
      code: "CONFIG_INVALID",
      message: "bad config",
    });
  });

  it("under --json the stderr line is byte-identical to the non-json run's", async () => {
    const failing = (): { deps: CliDeps } =>
      recordingDeps({
        loadConfig: async () => {
          throw new SdkError("CONFIG_INVALID", "bad config");
        },
      });

    const human = captureStreams();
    expect(await run(["translate"], failing().deps, human.streams)).toBe(2);
    const json = captureStreams();
    expect(await run(["translate", "--json"], failing().deps, json.streams)).toBe(2);

    expect(human.err()).toBe("verbatra: error [CONFIG_INVALID] bad config\n");
    expect(json.err()).toBe(human.err());
    expect(human.out()).toBe("");
  });

  it("a usage error caught while parsing options produces the same envelope shape", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--json", "--locales", ""], deps, cap.streams);

    expect(code).toBe(2);
    const parsed = parseEnvelope(cap.out());
    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("check");
    expect(parsed.code).toBe("INVALID_LOCALES");
    expect(parsed.version).toBe(JSON_ENVELOPE_VERSION);
    expect(cap.err()).toContain("verbatra: error [INVALID_LOCALES]");
  });

  it("names the failing command in the envelope for every command that takes --json", async () => {
    const failing = (): { deps: CliDeps } =>
      recordingDeps({
        loadConfig: async () => {
          throw new SdkError("CONFIG_NOT_FOUND", "no config");
        },
      });
    const argvByCommand: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["translate", ["translate", "--json"]],
      ["watch", ["watch", "--json"]],
      ["export", ["export", "--json"]],
      ["import", ["import", "wb.xlsx", "--json"]],
      ["check", ["check", "--json"]],
      ["diff", ["diff", "--json"]],
    ];

    for (const [command, argv] of argvByCommand) {
      const cap = captureStreams();
      expect(await run(argv, failing().deps, cap.streams)).toBe(2);
      expect(parseEnvelope(cap.out())).toMatchObject({
        ok: false,
        command,
        code: "CONFIG_NOT_FOUND",
      });
    }
  });

  it("writes nothing to stdout on failure without --json", async () => {
    const { deps } = recordingDeps({
      loadConfig: async () => {
        throw new SdkError("CONFIG_INVALID", "bad config");
      },
    });
    const cap = captureStreams();

    expect(await run(["check"], deps, cap.streams)).toBe(2);
    expect(cap.out()).toBe("");
  });

  it("emits no envelope when --json is present but the raw options are malformed", async () => {
    const cap = captureStreams();
    const { deps } = recordingDeps();

    const code = await runTranslate({ json: "yes" }, deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).toContain("verbatra: error [CLI_ERROR]");
  });
});

describe("run: shared whole-run error helper (withWholeRunErrors)", () => {
  it("passes a successful body return through unchanged (export always 0, stderr clean)", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["export"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).not.toBe("");
    expect(cap.err()).toBe("");
  });

  it("passes a data-driven 1 from a non-throwing body through without turning it into 2", async () => {
    const { deps } = recordingDeps({ check: async () => makeCheckSummary({ inSync: false }) });
    const cap = captureStreams();

    const code = await run(["check"], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.err()).toBe("");
  });

  it("maps a whole-run SdkError thrown by loadConfig to 2 with clean stdout (export)", async () => {
    const { deps } = recordingDeps({
      loadConfig: async () => {
        throw new SdkError("CONFIG_INVALID", "bad config");
      },
    });
    const cap = captureStreams();

    const code = await run(["export"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).toContain("[CONFIG_INVALID] bad config");
  });

  it("maps a SdkError thrown inside the body (the SDK call) to 2 (check)", async () => {
    const { deps } = recordingDeps({
      check: async () => {
        throw new SdkError("SOURCE_UNREADABLE", "no source");
      },
    });
    const cap = captureStreams();

    const code = await run(["check"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).toContain("[SOURCE_UNREADABLE] no source");
  });
});

describe("run: usage errors, help, version", () => {
  it("an unknown command -> 2", async () => {
    const { deps } = recordingDeps();
    expect(await run(["bogus"], deps, captureStreams().streams)).toBe(2);
  });

  it("an unknown flag -> 2", async () => {
    const { deps } = recordingDeps();
    expect(await run(["translate", "--nope"], deps, captureStreams().streams)).toBe(2);
  });

  it("writes nothing to stdout for a usage error without --json", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run(["check", "--nope"], deps, cap.streams)).toBe(2);
    expect(cap.out()).toBe("");
  });

  it("--help and --version exit 0, and --version reports the package version", async () => {
    const { deps } = recordingDeps();
    expect(await run(["--help"], deps, captureStreams().streams)).toBe(0);

    const cap = captureStreams();
    expect(await run(["--version"], deps, cap.streams)).toBe(0);
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const manifest = JSON.parse(raw) as { version: string };
    expect(cap.out().trim()).toBe(manifest.version);
  });
});

describe("run: a non-CommanderError escaping a command handler is re-thrown", () => {
  it("propagates a plain error thrown from a run hook instead of mapping it to an exit code", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();
    const hookError = new Error("hook exploded");

    await expect(
      run(["watch"], deps, cap.streams, {
        onWatchSession: () => {
          throw hookError;
        },
      }),
    ).rejects.toBe(hookError);
  });
});

describe("run: .env loading is wired before the SDK flow", () => {
  let dir: string;
  let savedEnv: NodeJS.ProcessEnv;
  const TKEY = "VERBATRA_RUNTEST_T";
  const WKEY = "VERBATRA_RUNTEST_W";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verbatra-run-env-"));
    savedEnv = { ...process.env };
    delete process.env[TKEY];
    delete process.env[WKEY];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("translate tops up an existing .gitignore in the --cwd directory", async () => {
    writeFileSync(join(dir, ".gitignore"), ".env\n.env.local\n.verbatra-local/\n");
    const { deps } = recordingDeps();

    await run(["translate", "--cwd", dir], deps, captureStreams().streams);

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain("verbatra.cache.json");
  });

  it("import tops up an existing .gitignore in the --cwd directory", async () => {
    writeFileSync(join(dir, ".gitignore"), ".env\n");
    const { deps } = recordingDeps();

    await run(["import", "book.xlsx", "--cwd", dir], deps, captureStreams().streams);

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain("verbatra.cache.json");
  });

  it("translate --dry-run leaves an existing .gitignore untouched", async () => {
    const before = ".env\n";
    writeFileSync(join(dir, ".gitignore"), before);
    const { deps } = recordingDeps();

    await run(["translate", "--dry-run", "--cwd", dir], deps, captureStreams().streams);

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(before);
  });

  it("import --dry-run leaves an existing .gitignore untouched", async () => {
    const before = ".env\n";
    writeFileSync(join(dir, ".gitignore"), before);
    const { deps } = recordingDeps();

    await run(["import", "book.xlsx", "--dry-run", "--cwd", dir], deps, captureStreams().streams);

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(before);
  });

  it("import --dry-run leaves .gitignore untouched when the workbook cannot be read", async () => {
    const before = ".env\n";
    writeFileSync(join(dir, ".gitignore"), before);
    const { deps } = recordingDeps({
      importWorkbook: async () => {
        throw new Error("workbook is unreadable");
      },
    });

    const code = await run(
      ["import", "book.xlsx", "--dry-run", "--cwd", dir],
      deps,
      captureStreams().streams,
    );

    expect(code).not.toBe(0);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(before);
  });

  it("translate creates no .gitignore when the project has none", async () => {
    const { deps } = recordingDeps();

    const code = await run(["translate", "--cwd", dir], deps, captureStreams().streams);

    expect(code).toBe(0);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("keeps stdout to the one envelope under --json while topping up .gitignore", async () => {
    writeFileSync(join(dir, ".gitignore"), ".env\n");
    const summary = makeSummary({ succeeded: ["de"] });
    const { deps } = recordingDeps({ translate: async () => summary });
    const cap = captureStreams();

    await run(["translate", "--json", "--cwd", dir], deps, cap.streams);

    expect(parseEnvelope(cap.out()).result).toEqual(summary);
  });

  it("translate loads .env from the --cwd directory before calling the SDK", async () => {
    writeFileSync(join(dir, ".env"), `${TKEY}=valT\n`);
    let seen: string | undefined;
    const { deps } = recordingDeps({
      translate: async () => {
        seen = process.env[TKEY];
        return makeSummary({ succeeded: ["de"] });
      },
    });

    const code = await run(["translate", "--cwd", dir], deps, captureStreams().streams);

    expect(code).toBe(0);
    expect(seen).toBe("valT");
  });

  it("watch loads .env from the --cwd directory before calling the SDK", async () => {
    writeFileSync(join(dir, ".env"), `${WKEY}=valW\n`);
    let seen: string | undefined;
    let resolveStop: (() => void) | undefined;
    const { deps } = recordingDeps({
      watch: () => {
        seen = process.env[WKEY];
        return Promise.resolve({
          stop: () =>
            new Promise<void>((resolve) => {
              resolveStop = resolve;
            }),
        } satisfies WatchController);
      },
    });

    let session: Session | undefined;
    const done = run(["watch", "--cwd", dir], deps, captureStreams().streams, {
      onWatchSession: (s) => {
        session = s;
      },
    });
    await flush();
    session?.requestStop();
    resolveStop?.();

    expect(await done).toBe(0);
    expect(seen).toBe("valW");
  });

  it("translate: a non-ENOENT .env read error (EISDIR) exits 2 with a structured error, no unhandled throw", async () => {
    mkdirSync(join(dir, ".env"));
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["translate", "--cwd", dir], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).not.toBe("");
    expect(calls.loadConfig).toHaveLength(0);
  });

  it("watch: a non-ENOENT .env read error (EISDIR) exits 2 with a structured error, no unhandled throw", async () => {
    mkdirSync(join(dir, ".env"));
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["watch", "--cwd", dir], deps, cap.streams, {
      onWatchSession: () => {},
    });

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).not.toBe("");
    expect(calls.loadConfig).toHaveLength(0);
  });
});

describe("run translate: rawOpts is zod-validated inside the error scaffold", () => {
  it("a malformed rawOpts renders a structured error and exits 2, never throws", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await runTranslate({ cwd: 123 }, deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.out()).toBe("");
    expect(cap.err()).not.toBe("");
    expect(calls.loadConfig).toHaveLength(0);
  });
});

describe("run: init command", () => {
  it("dispatches init and scaffolds files non-interactively", async () => {
    const dir = mkdtempSync(join(tmpdir(), "verbatra-init-run-"));
    try {
      const { deps } = recordingDeps();
      const code = await run(
        ["init", "--yes", "--provider", "deepl", "--cwd", dir],
        deps,
        captureStreams().streams,
      );
      expect(code).toBe(0);
      expect(existsSync(join(dir, "verbatra.config.ts"))).toBe(true);
      expect(existsSync(join(dir, ".env.example"))).toBe(true);
      expect(existsSync(join(dir, ".gitignore"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("run: the --json error envelope for a commander usage error", () => {
  it("emits one error envelope naming the resolved command for an unknown option", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--json", "--nope"], deps, cap.streams);

    expect(code).toBe(2);
    const envelope = parseEnvelope(cap.out());
    expect(envelope).toMatchObject({
      ok: false,
      version: JSON_ENVELOPE_VERSION,
      command: "check",
      code: "USAGE_ERROR",
    });
    expect(envelope.message).toContain("--nope");
  });

  it("emits one error envelope for a missing required argument", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["import", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: "import",
      code: "USAGE_ERROR",
    });
  });

  it("reports command null when the failure happened before a command was resolved", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["frobnicate", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: false,
      command: null,
      code: "USAGE_ERROR",
    });
  });

  it("writes exactly one line, and stdout stays parseable as a single envelope", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["diff", "--json", "--nope"], deps, cap.streams);

    expect(cap.out().trimEnd().split("\n")).toHaveLength(1);
    expect(cap.out().endsWith("\n")).toBe(true);
  });

  it("still exits 0 with no envelope for --help, which is not a failure", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run(["--help", "--json"], deps, cap.streams)).toBe(0);
    expect(cap.out()).not.toContain('"ok":false');
  });
});
