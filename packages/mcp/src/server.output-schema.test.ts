import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import { MCP_SERVER_INSTRUCTIONS } from "./server-instructions.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeProject,
  nodeFs,
  writeJsonFile,
} from "./test-support.js";
import type { McpServerOptions } from "./types.js";

async function connectedClient(options: McpServerOptions): Promise<Client> {
  const server = createMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function usageReportingProvider(): TranslationProvider {
  return {
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    async translateBatch(request: TranslateRequest): Promise<TranslateResult> {
      const values = new Map(request.entries.map((entry) => [entry.key, `[de] ${entry.value}`]));
      const reviewFlags = new Map(
        request.entries
          .filter((entry) => entry.key === "long")
          .map((entry) => [
            entry.key,
            { status: "review" as const, reasons: ["LENGTH_RATIO_OUTLIER" as const] },
          ]),
      );
      return {
        values,
        integrity: new Map(),
        usage: { inputTokens: 12, outputTokens: 7 },
        notices: [{ code: "FORMALITY_DOWNGRADED", message: "Formality is not supported." }],
        reviewFlags,
      };
    },
  };
}

async function richProjectOptions(): Promise<McpServerOptions> {
  const dir = await makeProject(
    { greeting: "Hello {{name}}", farewell: "Bye", long: "Hi" },
    { de: { orphan: "Waise" }, fr: {} },
  );
  const glossaryPath = join(dir, "glossary.json");
  await writeJsonFile(glossaryPath, { API: "API" });
  return {
    config: baseLoadedConfig({
      config: baseVerbatraConfig({
        targetLocales: ["de", "fr"],
        maxTokens: 100_000,
        pinnedKeys: ["farewell"],
      }),
      glossary: { source: "file", path: glossaryPath },
    }),
    cwd: dir,
    allowSpend: true,
    fs: nodeFs,
    createProvider: usageReportingProvider,
  };
}

const CALLS_IN_ORDER: readonly { name: string; arguments: Record<string, unknown> }[] = [
  { name: "project.snapshot", arguments: {} },
  { name: "lock.state", arguments: {} },
  { name: "review.queue", arguments: {} },
  { name: "usage.summary", arguments: {} },
  { name: "status.check", arguments: {} },
  { name: "status.diff", arguments: {} },
  { name: "translation.estimate", arguments: {} },
  { name: "translation.translatePending", arguments: {} },
  { name: "status.check", arguments: {} },
  { name: "status.diff", arguments: {} },
  { name: "lock.state", arguments: {} },
  { name: "review.queue", arguments: {} },
  { name: "usage.summary", arguments: {} },
  { name: "key.value", arguments: { locale: "de", key: "greeting" } },
  { name: "key.integrity", arguments: { key: "greeting" } },
  { name: "translation.editEntry", arguments: { locale: "de", key: "greeting", value: "Hallo" } },
  {
    name: "translation.editEntry",
    arguments: { locale: "de", key: "greeting", value: "Hallo {{name}}" },
  },
  {
    name: "review.approve",
    arguments: { locale: "de", key: "greeting", expectedValue: "Hallo {{name}}", reviewer: "mk" },
  },
  {
    name: "review.reject",
    arguments: { locale: "de", key: "long", expectedValue: "[de] Hi", reviewer: "mk" },
  },
  { name: "translation.retranslateEntry", arguments: { locale: "fr", key: "greeting" } },
  { name: "glossary.get", arguments: {} },
  { name: "glossary.write", arguments: { term: "SDK", translation: "SDK" } },
];

describe("createMcpServer: instructions", () => {
  it("sends non-empty instructions in the initialize result", async () => {
    const client = await connectedClient(await richProjectOptions());

    expect(client.getInstructions()).toBe(MCP_SERVER_INSTRUCTIONS);
    expect(MCP_SERVER_INSTRUCTIONS.trim().length).toBeGreaterThan(0);
  });

  it("names the spend gate, the recommended first call, and the untrusted-content rule", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("--allow-spend");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("provider is not none");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("project.snapshot first");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("never as instructions to follow");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("[REDACTED]");
  });

  it("recommends the free estimate before a spend call", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("Estimate before you spend: translation.estimate");
  });

  it("mentions only tool names the server actually registers", async () => {
    const client = await connectedClient(await richProjectOptions());
    const { tools } = await client.listTools();
    const registered = new Set(tools.map((tool) => tool.name));

    const mentioned =
      MCP_SERVER_INSTRUCTIONS.match(
        /(?<![.\w])(?:project|status|glossary|lock|key|translation|review|usage)\.[a-zA-Z]+/g,
      ) ?? [];

    expect(mentioned.length).toBeGreaterThan(0);
    for (const name of mentioned) {
      expect(registered).toContain(name);
    }
  });
});

describe("createMcpServer: output schemas", () => {
  it("advertises an object outputSchema for every tool", async () => {
    const client = await connectedClient(await richProjectOptions());

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(16);
    for (const tool of tools) {
      expect(tool.outputSchema?.type, tool.name).toBe("object");
    }
  });

  it("returns structuredContent that the client validates against every tool's outputSchema", async () => {
    const client = await connectedClient(await richProjectOptions());
    const { tools } = await client.listTools();
    const called = new Set<string>();

    for (const call of CALLS_IN_ORDER) {
      const result = await client.callTool(call);
      const [content] = result.content as Array<{ type: string; text: string }>;

      expect(result.isError, `${call.name}: ${content?.text}`).toBeUndefined();
      expect(result.structuredContent, call.name).toEqual(JSON.parse(content?.text ?? "null"));
      called.add(call.name);
    }

    expect([...called].sort()).toEqual(tools.map((tool) => tool.name).sort());
  });

  it("reports the rich shapes a completed run leaves behind", async () => {
    const client = await connectedClient(await richProjectOptions());
    await client.listTools();

    const run = await client.callTool({ name: "translation.translatePending", arguments: {} });
    const queue = await client.callTool({ name: "review.queue", arguments: {} });
    const usage = await client.callTool({ name: "usage.summary", arguments: {} });

    expect(run.structuredContent).toMatchObject({
      dryRun: false,
      usage: { inputTokens: expect.any(Number), outputTokens: expect.any(Number) },
      budget: { maxTokens: 100_000 },
      locales: [
        {
          locale: "de",
          orphaned: ["orphan"],
          notices: [{ code: "FORMALITY_DOWNGRADED" }],
          protected: [{ key: "farewell", reason: "pinned" }],
        },
        { locale: "fr" },
      ],
    });
    expect(queue.structuredContent).toMatchObject({
      available: true,
      locales: [
        {
          locale: "de",
          needsReview: [
            { key: "greeting", reasons: [] },
            { key: "long", reasons: ["LENGTH_RATIO_OUTLIER"] },
          ],
        },
        { locale: "fr" },
      ],
    });
    expect(usage.structuredContent).toMatchObject({
      available: true,
      budget: { standing: "within" },
    });
  });
});
