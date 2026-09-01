import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SdkError } from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectMcpServer } from "./server.js";
import { startMcpServer } from "./start-server.js";
import {
  baseLoadedConfig,
  defaultAdapterRegistry,
  makeProject,
  makeStubProvider,
  nodeFs,
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

  it("propagates a config-not-found error rather than swallowing it", async () => {
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
    const server = await connectMcpServer({ config: baseLoadedConfig(), cwd: dir }, transport);

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
