import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import { baseLoadedConfig, baseVerbatraConfig, makeProject } from "./test-support.js";
import type { McpServerOptions } from "./types.js";

async function connectedClient(options: McpServerOptions): Promise<Client> {
  const server = createMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("createMcpServer: handshake and tools/list", () => {
  it("completes an MCP initialize handshake and returns a non-empty tool list", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    const tools = await client.listTools();

    expect(tools.tools.length).toBeGreaterThan(0);
  });

  it("returns identical tool lists in identical order across two connections to the same process", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const options: McpServerOptions = { config: baseLoadedConfig(), cwd: dir };
    const server = createMcpServer(options);

    const [transportA1, transportA2] = InMemoryTransport.createLinkedPair();
    const clientA = new Client({ name: "client-a", version: "1.0.0" });
    await server.connect(transportA1);
    await clientA.connect(transportA2);
    const first = await clientA.listTools();
    await clientA.close();

    const [transportB1, transportB2] = InMemoryTransport.createLinkedPair();
    const clientB = new Client({ name: "client-b", version: "1.0.0" });
    await server.connect(transportB1);
    await clientB.connect(transportB2);
    const second = await clientB.listTools();
    await clientB.close();

    expect(second.tools.map((tool) => tool.name)).toEqual(first.tools.map((tool) => tool.name));
    expect(second.tools).toEqual(first.tools);
  });

  it("gives every tool a JSON Schema object inputSchema", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("omits the two spend tools when the server was started without spending allowed", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({
      config: baseLoadedConfig(),
      cwd: dir,
      allowSpend: false,
    });

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).not.toContain("translation.retranslateEntry");
    expect(names).not.toContain("translation.translatePending");
  });

  it("includes the two spend tools when the server was started with spending allowed", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({
      config: baseLoadedConfig(),
      cwd: dir,
      allowSpend: true,
    });

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("translation.retranslateEntry");
    expect(names).toContain("translation.translatePending");
  });
});

describe("createMcpServer: tools/call", () => {
  it("returns a JSON-RPC error, not a result, for an unknown tool name", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    await expect(client.callTool({ name: "does.not.exist", arguments: {} })).rejects.toMatchObject({
      code: -32601,
    });
  });

  it("returns isError: true naming the offending field for invalid tool input, not a JSON-RPC error", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    const result = await client.callTool({
      name: "key.value",
      arguments: { locale: "", key: "greeting" },
    });

    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(content?.text).toContain("locale");
  });

  it("returns content and structuredContent for a successful call to a tool with an outputSchema", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    const result = await client.callTool({
      name: "key.value",
      arguments: { locale: "de", key: "greeting" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ source: "Hello", target: "Hallo" });
  });

  it("returns content with no structuredContent for a tool that declares no outputSchema", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    const result = await client.callTool({ name: "status.check", arguments: {} });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toBeDefined();
  });

  it("returns isError: true, not a JSON-RPC error, when a tool's handler throws", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

    const result = await client.callTool({
      name: "key.value",
      arguments: { locale: "de", key: "missing" },
    });

    expect(result.isError).toBe(true);
  });

  describe("secret redaction on the wire", () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = "leaked-secret-value";
    });

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it("never lets a configured provider key value reach a successful tool result", async () => {
      const dir = await makeProject(
        { greeting: "Hello" },
        {
          de: { greeting: "leaked-secret-value" },
        },
      );
      const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

      const result = await client.callTool({
        name: "key.value",
        arguments: { locale: "de", key: "greeting" },
      });

      expect(JSON.stringify(result)).not.toContain("leaked-secret-value");
    });
  });

  describe("translation content that merely resembles a secret shape", () => {
    const providerEnvVarNames = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "DEEPL_API_KEY",
      "GOOGLE_TRANSLATE_API_KEY",
      "OPENAI_COMPATIBLE_API_KEY",
    ];
    const originalValues: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const name of providerEnvVarNames) {
        originalValues[name] = process.env[name];
        delete process.env[name];
      }
    });

    afterEach(() => {
      for (const name of providerEnvVarNames) {
        const value = originalValues[name];
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });

    it("returns ordinary translation copy byte-for-byte, unmangled by redaction, even when it looks secret-shaped", async () => {
      const riskCopy = "Our risk-averse pricing plan protects your budget.";
      const skuCopy = "Reference SKU-12345678 when you contact support.";
      const stripeStyleCopy = "Example key: sk_live_51H3xampleKeyDoNotUse1234567890";
      const randomToken = "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6";
      const dir = await makeProject(
        {
          risk: riskCopy,
          sku: skuCopy,
          stripe: stripeStyleCopy,
          token: randomToken,
        },
        {
          de: {
            risk: riskCopy,
            sku: skuCopy,
            stripe: stripeStyleCopy,
            token: randomToken,
          },
        },
      );
      const client = await connectedClient({ config: baseLoadedConfig(), cwd: dir });

      for (const [key, expected] of [
        ["risk", riskCopy],
        ["sku", skuCopy],
        ["stripe", stripeStyleCopy],
        ["token", randomToken],
      ] as const) {
        const result = await client.callTool({
          name: "key.value",
          arguments: { locale: "de", key },
        });

        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toEqual({ source: expected, target: expected });
      }
    });
  });
});

describe("createMcpServer: spend-gated tool call while spending is disallowed", () => {
  it("returns a JSON-RPC error for the omitted spend tool, since it is not advertised", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({
      config: baseLoadedConfig({ config: baseVerbatraConfig() }),
      cwd: dir,
      allowSpend: false,
    });

    await expect(
      client.callTool({
        name: "translation.retranslateEntry",
        arguments: { locale: "de", key: "greeting" },
      }),
    ).rejects.toMatchObject({ code: -32601 });
  });
});
