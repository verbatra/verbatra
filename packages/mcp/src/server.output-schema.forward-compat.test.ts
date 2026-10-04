import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";
import { baseLoadedConfig, makeProject, staticProject } from "./test-support.js";

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/sdk")>();
  return {
    ...actual,
    editEntry: async (...args: Parameters<typeof actual.editEntry>) => {
      const written = await actual.editEntry(...args);
      return { ...written, accepted: "yes" };
    },
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

async function connectedClient(dir: string): Promise<Client> {
  const server = createMcpServer({ project: staticProject(baseLoadedConfig()), cwd: dir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  await client.listTools();
  return client;
}

describe("createMcpServer: forward-compatible output schemas", () => {
  it("delivers a result with fields the outputSchema does not name, and the SDK client accepts it", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const client = await connectedClient(dir);

    const result = await client.callTool({ name: "lock.state", arguments: {} });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      exists: true,
      addedByANewerSdk: "top level",
      locales: [{ locale: "de", addedByANewerSdk: { nested: true } }],
    });
  });

  it("tells the agent not to retry a writing tool whose result broke its schema, since the write already happened", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const client = await connectedClient(dir);

    const result = await client.callTool({
      name: "translation.editEntry",
      arguments: { locale: "de", key: "greeting", value: "Servus" },
    });

    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(content?.text).toContain(
      'OUTPUT_SCHEMA_MISMATCH: the result of "translation.editEntry"',
    );
    expect(content?.text).toContain("its changes were applied; do not retry it");
    const onDisk = JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8")) as Record<
      string,
      string
    >;
    expect(onDisk.greeting).toBe("Servus");
  });
});
