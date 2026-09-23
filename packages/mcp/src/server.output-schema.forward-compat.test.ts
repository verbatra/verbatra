import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";
import { baseLoadedConfig, makeProject } from "./test-support.js";

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/sdk")>();
  return {
    ...actual,
    lockState: async () => ({
      exists: true,
      version: 1,
      addedByANewerSdk: "top level",
      locales: [
        {
          locale: "de",
          keyCount: 1,
          missing: 0,
          stale: 0,
          upToDate: 1,
          addedByANewerSdk: { nested: true },
        },
      ],
    }),
  };
});

describe("createMcpServer: forward-compatible output schemas", () => {
  it("delivers a result with fields the outputSchema does not name, and the SDK client accepts it", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const server = createMcpServer({ config: baseLoadedConfig(), cwd: dir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await client.listTools();

    const result = await client.callTool({ name: "lock.state", arguments: {} });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      exists: true,
      addedByANewerSdk: "top level",
      locales: [{ locale: "de", addedByANewerSdk: { nested: true } }],
    });
  });
});
