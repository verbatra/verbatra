import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WatchController, WatchInput, WatchRunResult } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { run } from "./run.js";
import {
  MCP_DOCS_URL,
  MCP_TERMINAL_HINT,
  mcpReadyLine,
  mcpStoppedLine,
  projectLabel,
  studioAgentToolsLine,
  studioSpendLine,
} from "./session-banners.js";
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

const INTERACTIVE: TerminalFacts = { env: { NO_COLOR: "1" }, stdinIsTty: true, stderrIsTty: true };
const PIPED: TerminalFacts = { env: {}, stdinIsTty: false, stderrIsTty: false };

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

describe("projectLabel", () => {
  const base = resolve("/work/app");

  it("sees through a symlinked base, as macOS temp directories are", () => {
    const real = mkdtempSync(join(tmpdir(), "verbatra-label-"));
    mkdirSync(join(real, "web"));
    const link = `${real}-link`;
    symlinkSync(real, link);

    expect(projectLabel(join(link, "web"), real)).toBe("web");
    expect(projectLabel(link, real)).toBe(".");
  });

  it("falls back to the given paths when they do not exist", () => {
    expect(projectLabel(join(base, "missing"), base)).toBe("missing");
  });

  it.each([
    ["the base itself", base, "."],
    ["a directory inside it", join(base, "packages", "web"), join("packages", "web")],
    ["a directory outside it", resolve("/elsewhere/app"), resolve("/elsewhere/app")],
  ])("labels %s", (_label, cwd, expected) => {
    expect(projectLabel(cwd, base)).toBe(expected);
  });
});

describe("banner wording", () => {
  it("names the project and the spend state in the ready line", () => {
    expect(mcpReadyLine("apps/web", true)).toBe(
      "verbatra MCP server running on stdio (project apps/web, spend tools on)",
    );
  });

  it("says why the server stopped", () => {
    expect(mcpStoppedLine("ended")).toBe("verbatra MCP server stopped (client closed stdin)");
    expect(mcpStoppedLine("requested")).toBe("verbatra MCP server stopped (interrupted)");
  });

  it("explains how to launch and inspect the server, in ASCII only", () => {
    const hint = MCP_TERMINAL_HINT.join("\n");
    expect(hint).toContain(MCP_DOCS_URL);
    expect(hint).toContain("npx @modelcontextprotocol/inspector npx verbatra mcp");
    expect(hint).toContain("Ctrl-C");
    expect(hint).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it("points at the flag that turns each Studio capability on", () => {
    expect(studioSpendLine(false)).toContain("--allow-spend");
    expect(studioSpendLine(true)).toContain("spend tools on");
    expect(studioAgentToolsLine(false)).toContain("--expose-agent-tools");
    expect(studioAgentToolsLine(true)).toContain("agent tools on");
  });
});

describe("verbatra mcp: ready, hint and stopped lines on stderr", () => {
  function startMcp(argv: readonly string[], facts: TerminalFacts, closed = deferred()) {
    const close = vi.fn(async () => {});
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async () => makeMcpHandle({ close, closed: closed.promise }),
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
    expect(cap.err()).toBe(`${mcpReadyLine(".", false)}\n${mcpStoppedLine("ended")}\n`);
    expect(cap.out()).toBe("");
  });

  it("adds the launch hint when stdin is a terminal, and reports an interrupted stop", async () => {
    const { cap, captured, done } = startMcp(["--allow-spend"], INTERACTIVE);
    await flush();
    captured.session().requestStop();

    expect(await done).toBe(0);
    expect(cap.err()).toBe(
      [mcpReadyLine(".", true), ...MCP_TERMINAL_HINT, mcpStoppedLine("requested"), ""].join("\n"),
    );
    expect(cap.out()).toBe("");
  });

  it("labels a --cwd project relative to the working directory", async () => {
    const { cap, captured, done } = startMcp(["--cwd", join(process.cwd(), "sub")], PIPED);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain(mcpReadyLine("sub", false));
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
    const { deps } = recordingDeps({
      importStudio: async () =>
        makeStudioModule({
          startStudioServer: async (options) => {
            options.output?.("verbatra studio listening at http://127.0.0.1:5849/?token=abc");
            options.output?.("GET / 200");
            lines.push("started");
            return { url: "http://127.0.0.1:5849/", port: 5849, close: async () => {} };
          },
        }),
    });
    const cap = captureStreams();
    const captured = sessionHooks();
    const done = run(["studio", ...argv], deps, cap.streams, captured.hooks, facts);
    return { cap, captured, done };
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

  it("forwards Studio's own output to stderr under --verbose, never to stdout", async () => {
    const { cap, captured, done } = startStudio(["--verbose"], PIPED);
    await flush();
    captured.session().requestStop();
    await done;

    expect(cap.err()).toContain("GET / 200\n");
    expect(cap.err()).toContain("verbatra studio listening at");
    expect(cap.out()).not.toContain("GET / 200");
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
