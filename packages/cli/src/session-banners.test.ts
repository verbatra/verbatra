import { join } from "node:path";
import {
  type McpSpendState,
  mcpReadyLine,
  mcpStoppedLine,
  mcpTerminalHint,
  mcpUnconfiguredHint,
} from "@verbatra/mcp";
import type { WatchController, WatchInput, WatchRunResult } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { run } from "./run.js";
import { studioAgentToolsLine, studioSpendLine } from "./session-banners.js";
import type { TerminalFacts } from "./terminal-mode.js";
import {
  captureStreams,
  flush,
  makeMcpHandle,
  makeMcpModule,
  makeStudioModule,
  makeSummary,
  recordingDeps,
} from "./test-support.js";
import type { RunHooks, Session } from "./types.js";

const INTERACTIVE: TerminalFacts = {
  env: { NO_COLOR: "1" },
  stdinIsTty: true,
  stderrIsTty: true,
  stdoutIsTty: true,
};
const PIPED: TerminalFacts = {
  env: {},
  stdinIsTty: false,
  stderrIsTty: false,
  stdoutIsTty: false,
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolveFn) => {
    resolvePromise = resolveFn;
  });
  return { promise, resolve: resolvePromise };
}

function sessionHooks(): { hooks: RunHooks; session: () => Session } {
  let captured: Session | undefined;
  const assign = (s: Session): void => {
    captured = s;
  };
  return {
    hooks: { onMcpSession: assign, onStudioSession: assign, onWatchSession: assign },
    session: () => {
      if (captured === undefined) {
        throw new Error("no session was started");
      }
      return captured;
    },
  };
}

describe("banner wording", () => {
  it("points at the flag that turns each Studio capability on", () => {
    expect(studioSpendLine(false)).toContain("--allow-spend");
    expect(studioSpendLine(true)).toContain("spend tools on");
    expect(studioSpendLine(true, false)).toBe("spend tools off (provider none)");
    expect(studioSpendLine(false, false)).toContain("pass --allow-spend");
    expect(studioAgentToolsLine(false)).toContain("--expose-agent-tools");
    expect(studioAgentToolsLine(true)).toContain("agent tools on");
  });
});

describe("verbatra mcp: ready, hint and stopped lines on stderr", () => {
  function startMcp(
    argv: readonly string[],
    facts: TerminalFacts,
    closed = deferred(),
    spend: McpSpendState = argv.includes("--allow-spend") ? "on" : "off",
  ) {
    const close = vi.fn(async () => {});
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async () => makeMcpHandle({ close, closed: closed.promise, spend }),
        }),
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["mcp", ...argv], deps, cap.streams, captured.hooks, facts);
    return { cap, captured, done, closed };
  }

  it("prints one ready line and no hint when a client launches it, and never writes stdout", async () => {
    const { cap, done, closed } = startMcp([], PIPED);
    await flush();
    closed.resolve();

    expect(await done).toBe(0);
    expect(cap.err()).toBe(`${mcpReadyLine(".", "off")}\n${mcpStoppedLine("stdin-closed")}\n`);
    expect(cap.out()).toBe("");
  });

  it("adds the launch hint when stdin is a terminal, and reports an interrupted stop", async () => {
    const { cap, captured, done } = startMcp(["--allow-spend"], INTERACTIVE);
    await flush();
    captured.session().requestStop();

    expect(await done).toBe(0);
    expect(cap.err()).toBe(
      [
        mcpReadyLine(".", "on"),
        ...mcpTerminalHint(["verbatra", "mcp"]),
        mcpStoppedLine("signal"),
        "",
      ].join("\n"),
    );
    expect(cap.out()).toBe("");
  });

  it("says spend tools are off because of provider none when the server withholds them", async () => {
    const { cap, captured, done } = startMcp(["--allow-spend"], PIPED, deferred(), "provider-none");
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain("(project ., spend tools off (provider none))");
  });

  it("adds the unconfigured hint after the ready line when the server started without a config", async () => {
    const close = vi.fn(async () => {});
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async () =>
            makeMcpHandle({ close, spend: "no-config", configured: false }),
        }),
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["mcp", "--allow-spend"], deps, cap.streams, captured.hooks, PIPED);
    await flush();
    captured.session().requestStop();

    expect(await done).toBe(0);
    expect(cap.err()).toBe(
      [mcpReadyLine(".", "no-config"), ...mcpUnconfiguredHint(), mcpStoppedLine("signal"), ""].join(
        "\n",
      ),
    );
    expect(cap.out()).toBe("");
  });

  it("labels a --cwd project relative to the working directory", async () => {
    const { cap, captured, done } = startMcp(["--cwd", join(process.cwd(), "sub")], PIPED);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain(mcpReadyLine("sub", "off"));
  });

  it("tells the client-config and inspector commands for the CLI subcommand", async () => {
    const { cap, captured, done } = startMcp([], INTERACTIVE);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain('command "npx", args ["verbatra", "mcp"]');
    expect(cap.err()).toContain("npx @modelcontextprotocol/inspector npx verbatra mcp");
  });

  it("falls back to a plain ready line when an older @verbatra/mcp has no banner builders", async () => {
    const close = vi.fn(async () => {});
    const { deps } = recordingDeps({
      importMcp: async () => ({ startMcpServer: async () => makeMcpHandle({ close }) }),
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["mcp"], deps, cap.streams, captured.hooks, INTERACTIVE);
    await flush();
    captured.session().requestStop();

    expect(await done).toBe(0);
    expect(cap.err()).toBe("verbatra MCP server running on stdio\n");
    expect(cap.out()).toBe("");
  });

  it("stays silent under --quiet", async () => {
    const { cap, captured, done } = startMcp(["--quiet"], INTERACTIVE);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toBe("");
  });
});

describe("verbatra studio: capability, Ctrl-C and stopped lines on stderr", () => {
  function startStudio(argv: readonly string[], facts: TerminalFacts) {
    const lines: string[] = [];
    const tokens: string[] = [];
    const { deps } = recordingDeps({
      importStudio: async () =>
        makeStudioModule({
          startStudioServer: async (options) => {
            options.output?.(
              `verbatra studio listening at http://127.0.0.1:5849/?token=${options.token}`,
            );
            options.output?.("GET / 200");
            options.output?.(`GET /?token=${options.token} 303`);
            tokens.push(options.token ?? "");
            lines.push("started");
            return { url: "http://127.0.0.1:5849/", port: 5849, close: async () => {} };
          },
        }),
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["studio", ...argv], deps, cap.streams, captured.hooks, facts);
    return { cap, captured, done, tokens };
  }

  it("keeps the stdout URL line and reports both capabilities off with their flags", async () => {
    const { cap, captured, done } = startStudio([], PIPED);
    await flush();
    captured.session().requestStop();

    expect(await done).toBe(0);
    expect(cap.out()).toMatch(
      /^Verbatra Studio running at http:\/\/127\.0\.0\.1:5849\/\?token=[0-9a-f]{64}\n$/,
    );
    expect(cap.err()).toBe(
      [
        `verbatra: ${studioSpendLine(false)}`,
        `verbatra: ${studioAgentToolsLine(false)}`,
        "verbatra: Studio stopped",
        "",
      ].join("\n"),
    );
  });

  it("reports enabled capabilities and the Ctrl-C hint on a terminal", async () => {
    const { cap, captured, done } = startStudio(
      ["--allow-spend", "--expose-agent-tools"],
      INTERACTIVE,
    );
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain(`verbatra: ${studioSpendLine(true)}\n`);
    expect(cap.err()).toContain(`verbatra: ${studioAgentToolsLine(true)}\n`);
    expect(cap.err()).toContain("verbatra: press Ctrl-C to stop\n");
  });

  it("forwards only Studio's request log to stderr under --verbose, never to stdout", async () => {
    const { cap, captured, done } = startStudio(["--verbose"], PIPED);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain("GET / 200\n");
    expect(cap.err()).toContain("GET /?token=[REDACTED] 303\n");
    expect(cap.err()).not.toContain("verbatra studio listening at");
    expect(cap.out()).not.toContain("GET / 200");
  });

  it("never writes the session token to stderr under --verbose", async () => {
    const { cap, captured, done, tokens } = startStudio(["--verbose"], INTERACTIVE);
    await flush();
    captured.session().requestStop();
    await done;

    const [token] = tokens;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(cap.out()).toContain(`?token=${token}`);
    expect(cap.err()).not.toContain(token);
  });

  it("keeps only the stdout URL line under --quiet", async () => {
    const { cap, captured, done } = startStudio(["--quiet", "--verbose"], INTERACTIVE);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toBe("");
    expect(cap.out()).toContain("Verbatra Studio running at");
  });
});

describe("verbatra watch: Ctrl-C, idle and stopped lines", () => {
  function startWatch(argv: readonly string[], facts: TerminalFacts) {
    let onRun: ((result: WatchRunResult) => void) | undefined;
    const { deps } = recordingDeps({
      watch: async (input: WatchInput): Promise<WatchController> => {
        onRun = input.onRun;
        input.onReady?.();
        return { stop: async () => {} };
      },
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["watch", ...argv], deps, cap.streams, captured.hooks, facts);
    return { cap, captured, done, fire: (result: WatchRunResult) => onRun?.(result) };
  }

  it("says it is waiting after every run, successful or not, and stopped at the end", async () => {
    const { cap, captured, done, fire } = startWatch([], INTERACTIVE);
    await flush();
    fire({ status: "succeeded", summary: makeSummary({ succeeded: ["de"] }) });
    fire({ status: "failed", error: { code: "SOURCE_INVALID", message: "bad" } });
    captured.session().requestStop();

    expect(await done).toBe(0);
    expect(cap.err()).toBe(
      [
        "verbatra: watching en (locales/{locale}.json); running initial translation",
        "verbatra: press Ctrl-C to stop",
        "verbatra: waiting for changes...",
        "verbatra: error [SOURCE_INVALID] bad",
        "verbatra: waiting for changes...",
        "verbatra: stopping, finishing current run...",
        "verbatra: stopped",
        "",
      ].join("\n"),
    );
  });

  it("announces the session before a failing initial run reports its error", async () => {
    const { deps } = recordingDeps({
      watch: async (input: WatchInput): Promise<WatchController> => {
        input.onReady?.();
        input.onRun({
          status: "failed",
          error: {
            code: "PROVIDER_CONSTRUCTION_FAILED",
            message: "no provider",
            causeCode: "MISSING_API_KEY",
          },
        });
        return { stop: async () => {} };
      },
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["watch"], deps, cap.streams, captured.hooks, PIPED);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toBe(
      [
        "verbatra: watching en (locales/{locale}.json); running initial translation",
        "verbatra: error [PROVIDER_CONSTRUCTION_FAILED] no provider (cause: MISSING_API_KEY)",
        "verbatra: waiting for changes...",
        "verbatra: stopping, finishing current run...",
        "verbatra: stopped",
        "",
      ].join("\n"),
    );
  });

  it("skips the Ctrl-C hint when stdin is not a terminal", async () => {
    const { cap, captured, done } = startWatch([], PIPED);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).not.toContain("Ctrl-C");
    expect(cap.err()).toContain("verbatra: stopped\n");
  });

  it("adds none of the new lines under --json, keeping stderr as before", async () => {
    const { cap, captured, done, fire } = startWatch(["--json"], INTERACTIVE);
    await flush();
    fire({ status: "succeeded", summary: makeSummary({ succeeded: ["de"] }) });
    captured.session().requestStop();
    await done;

    expect(cap.err()).toBe(
      "verbatra: watching en (locales/{locale}.json); running initial translation\n" +
        "verbatra: stopping, finishing current run...\n",
    );
  });
});
