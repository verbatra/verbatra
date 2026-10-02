import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SdkError } from "@verbatra/sdk";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { connectMcpServer } from "./server.js";
import { closeOnInputEnd, startMcpServer } from "./start-server.js";
import {
  baseLoadedConfig,
  defaultAdapterRegistry,
  makeProject,
  makeStubProvider,
  makeTempDir,
  nodeFs,
  staticProject,
  writeJsonFile,
} from "./test-support.js";

async function makeConfiguredProject(): Promise<{ dir: string; configPath: string }> {
  const dir = await makeProject({ greeting: "Hello" }, { de: {} });
  const configPath = join(dir, "verbatra.config.json");
  await writeJsonFile(configPath, {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "test-model", maxTokens: 256 } },
  });
  return { dir, configPath };
}

describe("startMcpServer", () => {
  it("loads the project config and connects a stdio transport, returning a handle", async () => {
    const { dir, configPath } = await makeConfiguredProject();

    const handle = await startMcpServer({ cwd: dir, configPath });
    await handle.close();
  });

  it.each([
    ["off without allowSpend", "anthropic", false, "off"],
    ["on with allowSpend and a translating provider", "anthropic", true, "on"],
    ["provider-none with allowSpend under provider none", "none", true, "provider-none"],
  ] as const)("reports the spend state %s", async (_label, provider, allowSpend, expected) => {
    const { dir, configPath } = await makeConfiguredProject();
    if (provider === "none") {
      await writeJsonFile(configPath, {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "none" },
      });
    }

    const handle = await startMcpServer({ cwd: dir, configPath, allowSpend });
    await handle.close();

    expect(handle.spend).toBe(expected);
  });

  it.each([
    [undefined, false],
    [false, false],
    [true, true],
  ] as const)("reports valuesRedacted %s as %s", async (redactValues, expected) => {
    const { dir, configPath } = await makeConfiguredProject();

    const handle = await startMcpServer({
      cwd: dir,
      configPath,
      ...(redactValues !== undefined ? { redactValues } : {}),
    });
    await handle.close();

    expect(handle.valuesRedacted).toBe(expected);
  });

  it("redacts the quoted text of a config error it logs when values are redacted", async () => {
    const { dir, configPath } = await makeConfiguredProject();
    await writeJsonFile(configPath, {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "anthropic", options: { model: "test-model", maxTokens: 256 } },
      glossary: { version: 2, terms: [{ source: "QZXJ" }] },
    });
    const lines: string[] = [];

    const handle = await startMcpServer({
      cwd: dir,
      configPath,
      redactValues: true,
      onLog: (line) => lines.push(line),
    });
    await handle.close();

    expect(handle.configured).toBe(false);
    expect(lines.join("\n")).toContain("[redacted length=4 hash=");
    expect(lines.join("\n")).not.toContain("QZXJ");
  });

  it("closes itself and settles closed when the client closes stdin", async () => {
    const { dir, configPath } = await makeConfiguredProject();

    const handle = await startMcpServer({ cwd: dir, configPath });
    process.stdin.emit("end");

    await expect(handle.closed).resolves.toBeUndefined();
  });

  it("settles closed after an explicit close()", async () => {
    const { dir, configPath } = await makeConfiguredProject();

    const handle = await startMcpServer({ cwd: dir, configPath });
    await handle.close();

    await expect(handle.closed).resolves.toBeUndefined();
  });

  it("resolves the project from CLAUDE_PROJECT_DIR when no cwd is given", async () => {
    const { dir, configPath } = await makeConfiguredProject();
    await rename(configPath, join(dir, ".verbatrarc.json"));
    const previous = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = dir;
    try {
      const handle = await startMcpServer({});
      await handle.close();
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_PROJECT_DIR;
      } else {
        process.env.CLAUDE_PROJECT_DIR = previous;
      }
    }
  });

  it.each([
    [false, "off"],
    [true, "no-config"],
  ] as const)(
    "starts unconfigured in a directory without a config (allowSpend %s, spend %s) and logs why",
    async (allowSpend, expected) => {
      const dir = await makeTempDir();
      const lines: string[] = [];

      const handle = await startMcpServer({
        cwd: dir,
        allowSpend,
        onLog: (line) => lines.push(line),
      });
      await handle.close();

      expect(handle.configured).toBe(false);
      expect(handle.spend).toBe(expected);
      expect(lines).toEqual([
        expect.stringMatching(/^Running without a usable project config: CONFIG_NOT_FOUND: /),
      ]);
    },
  );

  it("reports configured: true when the config loads", async () => {
    const { dir, configPath } = await makeConfiguredProject();

    const handle = await startMcpServer({ cwd: dir, configPath });
    await handle.close();

    expect(handle.configured).toBe(true);
  });

  it("propagates a config-not-found error for a missing explicit configPath rather than swallowing it", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    await expect(
      startMcpServer({ cwd: dir, configPath: join(dir, "missing.json") }),
    ).rejects.toBeInstanceOf(SdkError);
  });

  it("defaults cwd to process.cwd() and forwards fs, adapterRegistry, and createProvider", async () => {
    const { dir, configPath } = await makeConfiguredProject();
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const handle = await startMcpServer({
        configPath,
        fs: nodeFs,
        adapterRegistry: defaultAdapterRegistry,
        createProvider: () => makeStubProvider(),
      });
      await handle.close();
    } finally {
      process.chdir(previous);
    }
  });

  it("routes onLog to the caller instead of stdout when a call fails", async () => {
    const { dir, configPath } = await makeConfiguredProject();
    const logLines: string[] = [];

    const handle = await startMcpServer({
      cwd: dir,
      configPath,
      onLog: (line) => logLines.push(line),
    });
    await handle.close();

    expect(logLines).toEqual([]);
  });
});

describe("stdio transport: stdout purity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes only newline-free, JSON-parseable MCP messages to stdout across a session including a failing call, and never touches the real process.stdout", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    await mkdir(dir, { recursive: true });

    const realStdoutWrites: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        realStdoutWrites.push(chunk.toString());
        return true;
      });

    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();

    const transport = new StdioServerTransport(clientToServer, serverToClient);
    const server = await connectMcpServer(
      { project: staticProject(baseLoadedConfig()), cwd: dir },
      transport,
    );

    const chunks: Buffer[] = [];
    const expectedResponseIds = new Set([1, 2, 3, 4]);
    const seenResponseIds = new Set<number>();
    let resolveAllResponsesSeen = (): void => {};
    const allResponsesSeen = new Promise<void>((resolve) => {
      resolveAllResponsesSeen = resolve;
    });
    serverToClient.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      for (const line of raw.split("\n").filter((entry) => entry.length > 0)) {
        const message = JSON.parse(line) as { id?: number };
        if (message.id !== undefined) {
          seenResponseIds.add(message.id);
        }
      }
      if ([...expectedResponseIds].every((id) => seenResponseIds.has(id))) {
        resolveAllResponsesSeen();
      }
    });

    function sendRequest(id: number, method: string, params: unknown): void {
      clientToServer.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    }

    sendRequest(1, "initialize", {
      protocolVersion: "2026-07-28",
      capabilities: {},
      clientInfo: { name: "purity-test", version: "1.0.0" },
    });
    clientToServer.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    sendRequest(2, "tools/list", {});
    sendRequest(3, "tools/call", { name: "key.value", arguments: { locale: "", key: "greeting" } });
    sendRequest(4, "tools/call", {
      name: "translation.editEntry",
      arguments: { locale: "de", key: "greeting", value: "Hallo" },
    });

    await allResponsesSeen;
    await server.close();
    stdoutSpy.mockRestore();

    expect(realStdoutWrites).toEqual([]);

    const raw = Buffer.concat(chunks).toString("utf8");
    const lines = raw.split("\n").filter((line) => line.length > 0);

    expect(lines.length).toBeGreaterThanOrEqual(4);
    for (const line of lines) {
      expect(line.includes("\n")).toBe(false);
      expect(() => JSON.parse(line)).not.toThrow();
      const message = JSON.parse(line) as { jsonrpc: string };
      expect(message.jsonrpc).toBe("2.0");
    }
  });
});

describe("closeOnInputEnd", () => {
  interface FakeServer {
    close: Mock<() => Promise<void>>;
    onclose?: (() => void) | undefined;
  }

  function fakeServer(): FakeServer {
    const server: FakeServer = {
      close: vi.fn(async () => {
        server.onclose?.();
      }),
    };
    return server;
  }

  it.each(["end", "close"])("closes the server once when the input emits %s", async (event) => {
    const input = new PassThrough();
    const server = fakeServer();

    const closed = closeOnInputEnd(input, server);
    input.emit(event);
    await closed;
    input.emit("end");
    input.emit("close");

    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("chains an onclose handler that was already set", async () => {
    const input = new PassThrough();
    const server = fakeServer();
    const previous = vi.fn();
    server.onclose = previous;

    const closed = closeOnInputEnd(input, server);
    await server.close();
    await closed;

    expect(previous).toHaveBeenCalledTimes(1);
    expect(input.listenerCount("end")).toBe(0);
    expect(input.listenerCount("close")).toBe(0);
  });

  it.each([
    [new Error("transport broke"), "transport broke"],
    ["plain failure", "plain failure"],
  ])(
    "settles closed and reports through onLog when closing after stdin ended rejects (%s)",
    async (failure, expected) => {
      const input = new PassThrough();
      const server: FakeServer = { close: vi.fn(async () => Promise.reject(failure)) };
      const lines: string[] = [];

      const closed = closeOnInputEnd(input, server, (line) => lines.push(line));
      input.emit("end");
      input.emit("close");

      await expect(closed).resolves.toBeUndefined();
      expect(server.close).toHaveBeenCalledTimes(1);
      expect(lines).toEqual([`Closing the server after stdin ended failed: ${expected}`]);
    },
  );

  it("settles closed without an onLog when closing after stdin ended rejects", async () => {
    const input = new PassThrough();
    const server: FakeServer = { close: vi.fn(async () => Promise.reject(new Error("broke"))) };

    const closed = closeOnInputEnd(input, server);
    input.emit("close");

    await expect(closed).resolves.toBeUndefined();
  });
});
