import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { JSONRPCMessage, Progress } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeProject,
  makeStubProvider,
  nodeFs,
  staticProject,
} from "./test-support.js";
import type { McpServerOptions } from "./types.js";

const TRANSLATE_PENDING = { name: "translation.translatePending", arguments: {} };

async function spendOptions(logLines: string[] = []): Promise<McpServerOptions> {
  const dir = await makeProject({ a: "A", b: "B" }, { de: {}, fr: {} });
  return {
    project: staticProject(
      baseLoadedConfig({
        config: baseVerbatraConfig({ targetLocales: ["de", "fr"], maxBatchSize: 1 }),
      }),
    ),
    cwd: dir,
    allowSpend: true,
    fs: nodeFs,
    createProvider: () => makeStubProvider(),
    onLog: (line) => logLines.push(line),
  };
}

function isProgressNotification(message: JSONRPCMessage): boolean {
  return "method" in message && message.method === "notifications/progress";
}

async function connect(
  options: McpServerOptions,
  failProgressSends = false,
): Promise<{ readonly client: Client; readonly progressFrames: JSONRPCMessage[] }> {
  const server = createMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const progressFrames: JSONRPCMessage[] = [];
  const send = serverTransport.send.bind(serverTransport);
  serverTransport.send = async (message, sendOptions) => {
    if (isProgressNotification(message)) {
      progressFrames.push(message);
      if (failProgressSends) {
        throw new Error("broken pipe");
      }
    }
    return send(message, sendOptions);
  };
  const client = new Client({ name: "progress-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, progressFrames };
}

describe("createMcpServer: progress notifications for translation.translatePending", () => {
  it("sends increasing progress that ends at the total when the call carries a progress token", async () => {
    const { client } = await connect(await spendOptions());
    const updates: Progress[] = [];

    const result = await client.callTool(TRANSLATE_PENDING, undefined, {
      onprogress: (update) => updates.push(update),
    });

    expect(result.isError).toBeUndefined();
    expect(updates.length).toBeGreaterThan(0);
    const progressValues = updates.map((update) => update.progress);
    expect(progressValues).toEqual([...progressValues].sort((a, b) => a - b));
    expect(new Set(progressValues).size).toBe(progressValues.length);
    const last = updates.at(-1);
    expect(last).toMatchObject({ progress: 4, total: 4 });
    expect(last?.message).toMatch(/^fr: batch 2\/2$/);
  });

  it("sends no progress notification when the call carries no progress token", async () => {
    const { client, progressFrames } = await connect(await spendOptions());

    const result = await client.callTool(TRANSLATE_PENDING);

    expect(result.isError).toBeUndefined();
    expect(progressFrames).toEqual([]);
  });

  it("returns the same result when every progress notification fails to send", async () => {
    const logLines: string[] = [];
    const { client, progressFrames } = await connect(await spendOptions(logLines), true);

    const result = await client.callTool(TRANSLATE_PENDING, undefined, {
      onprogress: () => undefined,
    });

    expect(progressFrames.length).toBeGreaterThan(0);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      succeeded: ["de", "fr"],
      failed: [],
    });
    expect(logLines.some((line) => line.startsWith("Sending a progress notification failed"))).toBe(
      true,
    );
  });
});
