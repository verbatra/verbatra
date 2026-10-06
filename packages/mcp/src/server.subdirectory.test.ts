import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { openProjectSession } from "./project-session.js";
import { createMcpServer } from "./server.js";
import { baseVerbatraConfig, makeProject, writeJsonFile } from "./test-support.js";

interface Connected {
  readonly client: Client;
  readonly root: string;
  readonly nested: string;
}

const DECOY = { decoy: "Decoy" };

async function connectFromSubdirectory(): Promise<Connected> {
  const root = await makeProject(
    { greeting: "Hello", farewell: "Bye" },
    { de: { greeting: "Hallo" } },
  );
  await mkdir(join(root, ".git"), { recursive: true });
  await writeJsonFile(
    join(root, ".verbatrarc.json"),
    baseVerbatraConfig({ provider: { id: "none", options: {} } }),
  );
  const nested = join(root, "src", "components");
  await mkdir(join(nested, "locales"), { recursive: true });
  await writeJsonFile(join(nested, "locales", "en.json"), DECOY);
  await writeJsonFile(join(nested, "locales", "de.json"), DECOY);
  const project = await openProjectSession({ cwd: nested });
  const server = createMcpServer({ project, cwd: nested, allowSpend: false });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, root, nested };
}

describe("a server started in a subdirectory of the project", () => {
  it("reports the config relative to the directory the search found it in", async () => {
    const { client } = await connectFromSubdirectory();

    const result = await client.callTool({ name: "project.snapshot", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      configured: true,
      configSource: ".verbatrarc.json",
    });
  });

  it("reads the locale files next to the config", async () => {
    const { client } = await connectFromSubdirectory();

    const result = await client.callTool({ name: "status.check", arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      locales: [{ locale: "de", missing: 1, upToDate: 1 }],
    });
  });

  it("writes an edited value into the project's locale file, never into the subdirectory", async () => {
    const { client, root, nested } = await connectFromSubdirectory();

    const result = await client.callTool({
      name: "translation.editEntry",
      arguments: { locale: "de", key: "farewell", value: "Tschuess" },
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.parse(await readFile(join(root, "locales", "de.json"), "utf8"))).toMatchObject({
      farewell: "Tschuess",
    });
    expect(JSON.parse(await readFile(join(nested, "locales", "de.json"), "utf8"))).toEqual(DECOY);
  });
});
