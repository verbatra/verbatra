import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { TranslateRequest, TranslateResult } from "@verbatra/ai-providers";
import type { SdkFs } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";
import { baseLoadedConfig, makeProject, nodeFs, staticProject } from "./test-support.js";
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

async function waitUntil(hasArrived: () => boolean): Promise<void> {
  await vi.waitFor(
    () => {
      expect(hasArrived()).toBe(true);
    },
    { timeout: 30_000, interval: 5 },
  );
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
      project: staticProject(baseLoadedConfig()),
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
      project: staticProject(baseLoadedConfig()),
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

describe("createMcpServer: translation.translatePending's single-run in-flight guard", () => {
  it("rejects a second overlapping run even for a different locale subset, calling the provider for the first run only", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {}, fr: {} });
    const gate = deferred<void>();
    const providerLocales: string[] = [];

    const client = await connectedClient({
      project: staticProject(
        baseLoadedConfig({
          config: { ...baseLoadedConfig().config, targetLocales: ["de", "fr"] },
        }),
      ),
      cwd: dir,
      allowSpend: true,
      fs: nodeFs,
      createProvider: () => ({
        id: "stub",
        kind: "llm",
        supportsGlossary: true,
        translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
          providerLocales.push(request.targetLocale);
          await gate.promise;
          return {
            values: new Map(request.entries.map((entry) => [entry.key, "Hallo"])),
            integrity: new Map(),
          };
        },
      }),
    });

    const firstCall = client.callTool({
      name: "translation.translatePending",
      arguments: { locales: ["de"] },
    }) as Promise<ToolCallResponse>;

    await waitUntil(() => providerLocales.length > 0);

    const otherSubset = (await client.callTool({
      name: "translation.translatePending",
      arguments: { locales: ["fr"] },
    })) as ToolCallResponse;
    expect(otherSubset.isError).toBe(true);
    expect(textOf(otherSubset)).toContain("already in progress");

    gate.resolve();
    const first = await firstCall;
    expect(first.isError).toBeUndefined();
    expect(providerLocales).toEqual(["de"]);

    const later = (await client.callTool({
      name: "translation.translatePending",
      arguments: { locales: ["fr"] },
    })) as ToolCallResponse;
    expect(later.isError).toBeUndefined();
    expect(providerLocales).toEqual(["de", "fr"]);
  });
});
