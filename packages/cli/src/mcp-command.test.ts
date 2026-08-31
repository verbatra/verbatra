import { SdkError } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, flush, makeMcpModule, recordingDeps } from "./test-support.js";
import type { RunHooks, Session } from "./types.js";

function moduleNotFound(specifier: string, importedFrom = "/proj/index.js"): Error {
  return Object.assign(
    new Error(`Cannot find package '${specifier}' imported from ${importedFrom}`),
    { code: "ERR_MODULE_NOT_FOUND" },
  );
}

function captureMcpSession(): { hooks: RunHooks; session: () => Session | undefined } {
  let session: Session | undefined;
  return {
    hooks: {
      onMcpSession: (s) => {
        session = s;
      },
    },
    session: () => session,
  };
}

describe("run mcp: option passthrough", () => {
  it("passes --cwd and --config through as cwd and configPath, with allowSpend false by default", async () => {
    const startCalls: Array<{ cwd: string; configPath: string | undefined; allowSpend: boolean }> =
      [];
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async (options) => {
            startCalls.push({
              cwd: options.cwd ?? "",
              configPath: options.configPath,
              allowSpend: options.allowSpend ?? false,
            });
            return { close: async () => {} };
          },
        }),
    });
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(
      ["mcp", "--cwd", "/proj", "--config", "verbatra.config.ts"],
      deps,
      cap.streams,
      captured.hooks,
    );
    await flush();
    captured.session()?.requestStop();
    await donePromise;

    expect(startCalls).toEqual([
      { cwd: "/proj", configPath: "verbatra.config.ts", allowSpend: false },
    ]);
  });

  it("omits configPath entirely when --config is not given", async () => {
    const hasConfigPathKey: boolean[] = [];
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async (options) => {
            hasConfigPathKey.push(Object.hasOwn(options, "configPath"));
            return { close: async () => {} };
          },
        }),
    });
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(["mcp"], deps, cap.streams, captured.hooks);
    await flush();
    captured.session()?.requestStop();
    await donePromise;

    expect(hasConfigPathKey).toEqual([false]);
  });
});

describe("run mcp: @verbatra/mcp not installed", () => {
  it("prints the canonical install hint and exits 2 when the missing specifier is @verbatra/mcp itself", async () => {
    const { deps, calls } = recordingDeps({
      importMcp: async () => {
        throw moduleNotFound("@verbatra/mcp");
      },
    });
    const cap = captureStreams();

    const code = await run(["mcp"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain(
      "Verbatra's MCP server requires @verbatra/mcp. Install it with: pnpm add -D @verbatra/mcp",
    );
    expect(cap.out()).toBe("");
    expect(calls.importMcp).toHaveLength(1);
  });

  it("never masks a resolution failure inside @verbatra/mcp's own dependency graph as not-installed", async () => {
    const importedFrom = "/proj/node_modules/@verbatra/mcp/dist/server.js";
    const { deps } = recordingDeps({
      importMcp: async () => {
        throw moduleNotFound("@modelcontextprotocol/sdk", importedFrom);
      },
    });
    const cap = captureStreams();

    const code = await run(["mcp"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain(importedFrom);
    expect(cap.err()).not.toContain("Install it with: pnpm add -D @verbatra/mcp");
    expect(cap.err()).toContain("ERR_MODULE_NOT_FOUND");
  });

  it("never masks a non-Error throw from the dynamic import as not-installed", async () => {
    const { deps } = recordingDeps({
      importMcp: async () => {
        throw "unexpected dynamic import failure";
      },
    });
    const cap = captureStreams();

    const code = await run(["mcp"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).not.toContain("Install it with: pnpm add -D @verbatra/mcp");
    expect(cap.err()).toContain("unexpected dynamic import failure");
  });
});

describe("run mcp: config or startup failure inside @verbatra/mcp", () => {
  it("exits 2 and renders the error when startMcpServer rejects with a config error", async () => {
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async () => {
            throw new SdkError("CONFIG_NOT_FOUND", "No verbatra configuration found.");
          },
        }),
    });
    const cap = captureStreams();

    const code = await run(["mcp"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("CONFIG_NOT_FOUND");
    expect(cap.out()).toBe("");
  });
});

describe("run mcp: stdout purity", () => {
  it("never writes anything to stdout on a clean run, success or failure", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(["mcp"], deps, cap.streams, captured.hooks);
    await flush();
    captured.session()?.requestStop();
    await donePromise;

    expect(cap.out()).toBe("");
  });

  it("routes a tool-call log line to stderr, never stdout", async () => {
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async (options) => {
            options.onLog?.("tool call log line");
            return { close: async () => {} };
          },
        }),
    });
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(["mcp"], deps, cap.streams, captured.hooks);
    await flush();
    captured.session()?.requestStop();
    await donePromise;

    expect(cap.out()).toBe("");
    expect(cap.err()).toContain("tool call log line");
  });
});

describe("run mcp: success path and shutdown", () => {
  it("a clean single interrupt stops the server and exits 0", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(["mcp"], deps, cap.streams, captured.hooks);
    await flush();
    captured.session()?.requestStop();
    const code = await donePromise;

    expect(code).toBe(0);
  });

  it("a second requestStop while the first is closing forces exit 130", async () => {
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async () => ({ close: () => new Promise(() => {}) }),
        }),
    });
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(["mcp"], deps, cap.streams, captured.hooks);
    await flush();
    const session = captured.session();
    session?.requestStop();
    session?.requestStop();
    const code = await donePromise;

    expect(code).toBe(130);
  });

  it("exits 1 and renders the error when closing the server itself fails", async () => {
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async () => ({
            close: async () => {
              throw Object.assign(new Error("close failed"), { code: "CLOSE_FAILED" });
            },
          }),
        }),
    });
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run(["mcp"], deps, cap.streams, captured.hooks);
    await flush();
    captured.session()?.requestStop();
    const code = await donePromise;

    expect(code).toBe(1);
    expect(cap.err()).toContain("CLOSE_FAILED");
  });
});

describe("run mcp: --allow-spend capability resolution", () => {
  const ENV_VAR = "VERBATRA_MCP_ALLOW_SPEND";
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = original;
    }
  });

  async function captureResolvedAllowSpend(argv: readonly string[]): Promise<boolean | undefined> {
    let resolved: boolean | undefined;
    const { deps } = recordingDeps({
      importMcp: async () =>
        makeMcpModule({
          startMcpServer: async (options) => {
            resolved = options.allowSpend;
            return { close: async () => {} };
          },
        }),
    });
    const cap = captureStreams();
    const captured = captureMcpSession();

    const donePromise = run([...argv], deps, cap.streams, captured.hooks);
    await flush();
    captured.session()?.requestStop();
    await donePromise;

    return resolved;
  }

  it("defaults allowSpend to false", async () => {
    expect(await captureResolvedAllowSpend(["mcp"])).toBe(false);
  });

  it("sets allowSpend true from the CLI flag alone", async () => {
    expect(await captureResolvedAllowSpend(["mcp", "--allow-spend"])).toBe(true);
  });

  it("falls back to the environment variable when the CLI flag is absent", async () => {
    process.env[ENV_VAR] = "true";
    expect(await captureResolvedAllowSpend(["mcp"])).toBe(true);
  });

  it("treats an unrecognized or falsy environment value as off", async () => {
    process.env[ENV_VAR] = "0";
    expect(await captureResolvedAllowSpend(["mcp"])).toBe(false);
  });

  it("the CLI flag wins when both the flag and the environment variable are given", async () => {
    process.env[ENV_VAR] = "false";
    expect(await captureResolvedAllowSpend(["mcp", "--allow-spend"])).toBe(true);
  });
});

describe("run mcp: usage errors", () => {
  it("rejects an unknown flag, exiting 2 before importing @verbatra/mcp", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["mcp", "--bogus"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.importMcp).toHaveLength(0);
  });
});

describe("run mcp: help text", () => {
  it("describes the stdio MCP server", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["mcp", "--help"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("Start a stdio MCP server");
  });
});
