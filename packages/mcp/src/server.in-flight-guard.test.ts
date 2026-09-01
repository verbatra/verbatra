import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { TranslateRequest, TranslateResult } from "@verbatra/ai-providers";
import type { SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import { baseLoadedConfig, makeProject, nodeFs } from "./test-support.js";
import type { McpServerOptions } from "./types.js";

async function connectedClient(options: McpServerOptions): Promise<Client> {
  const server = createMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function deferred<T>(): { readonly promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntil(hasArrived: () => boolean): Promise<void> {
  while (!hasArrived()) {
    await sleep(5);
  }
}

interface ToolCallResponse {
  readonly isError?: boolean;
  readonly content: readonly { readonly type: string; readonly text?: string }[];
}

function textOf(response: ToolCallResponse): string {
  const [content] = response.content;
  return content?.text ?? "";
}

describe("createMcpServer: translation.retranslateEntry's per-(locale,key) in-flight guard", () => {
  it("rejects a second overlapping call for the SAME locale and key, calling the provider only once, while a concurrent call for a DIFFERENT key proceeds unaffected", async () => {
    const dir = await makeProject({ greeting: "Hello", farewell: "Bye" }, { de: {} });
    const gate = deferred<void>();
    let providerCalls = 0;

    const client = await connectedClient({
      config: baseLoadedConfig(),
      cwd: dir,
      allowSpend: true,
      fs: nodeFs,
      createProvider: () => ({
        id: "stub",
        kind: "llm",
        supportsGlossary: true,
        translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
          providerCalls += 1;
          await gate.promise;
          return {
            values: new Map(request.entries.map((entry) => [entry.key, "Hallo"])),
            integrity: new Map(),
          };
        },
      }),
    });

    const firstCall = client.callTool({
      name: "translation.retranslateEntry",
      arguments: { locale: "de", key: "greeting" },
    }) as Promise<ToolCallResponse>;

    await waitUntil(() => providerCalls > 0);

    const sameKeyResult = (await client.callTool({
      name: "translation.retranslateEntry",
      arguments: { locale: "de", key: "greeting" },
    })) as ToolCallResponse;
    expect(sameKeyResult.isError).toBe(true);
    expect(textOf(sameKeyResult)).toContain("already in progress");
    expect(providerCalls).toBe(1);

    const differentKeyCall = client.callTool({
      name: "translation.retranslateEntry",
      arguments: { locale: "de", key: "farewell" },
    }) as Promise<ToolCallResponse>;

    gate.resolve();
    const first = await firstCall;
    expect(textOf(first)).not.toContain("already in progress");
    const different = await differentKeyCall;
    expect(textOf(different)).not.toContain("already in progress");
    expect(providerCalls).toBe(2);

    const later = (await client.callTool({
      name: "translation.retranslateEntry",
      arguments: { locale: "de", key: "greeting" },
    })) as ToolCallResponse;
    expect(textOf(later)).not.toContain("already in progress");
  });
});

function delayedWriteFs(targetPath: string, gate: Promise<void>, onWrite: () => void): SdkFs {
  return {
    ...nodeFs,
    writeFile: async (path, data) => {
      if (path === targetPath) {
        onWrite();
        await gate;
      }
      await nodeFs.writeFile(path, data);
    },
  };
}

describe("createMcpServer: translation.editEntry's per-(locale,key) in-flight guard", () => {
  it("rejects a second overlapping call for the SAME locale and key, writing to disk only once, while a concurrent call for a DIFFERENT key proceeds unaffected", async () => {
    const dir = await makeProject({ greeting: "Hello", farewell: "Bye" }, { de: {} });
    const gate = deferred<void>();
    let writeCalls = 0;
    const targetPath = join(dir, "locales", "de.json");

    const client = await connectedClient({
      config: baseLoadedConfig(),
      cwd: dir,
      fs: delayedWriteFs(targetPath, gate.promise, () => {
        writeCalls += 1;
      }),
    });

    const firstCall = client.callTool({
      name: "translation.editEntry",
      arguments: { locale: "de", key: "greeting", value: "Hallo" },
    }) as Promise<ToolCallResponse>;

    await waitUntil(() => writeCalls > 0);

    const sameKeyResult = (await client.callTool({
      name: "translation.editEntry",
      arguments: { locale: "de", key: "greeting", value: "Hallo again" },
    })) as ToolCallResponse;
    expect(sameKeyResult.isError).toBe(true);
    expect(textOf(sameKeyResult)).toContain("already in progress");
    expect(writeCalls).toBe(1);

    const differentKeyCall = client.callTool({
      name: "translation.editEntry",
      arguments: { locale: "de", key: "farewell", value: "Tschuess" },
    }) as Promise<ToolCallResponse>;

    gate.resolve();
    const first = await firstCall;
    expect(textOf(first)).not.toContain("already in progress");
    const different = await differentKeyCall;
    expect(textOf(different)).not.toContain("already in progress");
    expect(writeCalls).toBe(2);

    const later = (await client.callTool({
      name: "translation.editEntry",
      arguments: { locale: "de", key: "greeting", value: "Hallo once more" },
    })) as ToolCallResponse;
    expect(textOf(later)).not.toContain("already in progress");
  });
});
