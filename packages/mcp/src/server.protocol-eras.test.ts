import {
  Client,
  InMemoryTransport,
  type JSONRPCMessage,
  type Progress,
} from "@modelcontextprotocol/client";
import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { McpProjectSession, McpProjectState } from "./project-session.js";
import { serveMcpStdio } from "./server.js";
import { MCP_SERVER_INSTRUCTIONS } from "./server-instructions.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeProject,
  makeStubProvider,
  nodeFs,
  staticProject,
} from "./test-support.js";

const MODERN = "2026-07-28";

const NOT_FOUND = new SdkError("CONFIG_NOT_FOUND", "No verbatra configuration found.");

type Era = "legacy" | "modern";

interface SwitchableProject {
  readonly session: McpProjectSession;
  configure(): void;
}

function switchableProject(): SwitchableProject {
  let state: McpProjectState = { kind: "unconfigured", error: NOT_FOUND };
  return {
    session: { current: async () => state, latest: () => state },
    configure() {
      state = {
        kind: "configured",
        loaded: baseLoadedConfig({
          config: baseVerbatraConfig({ targetLocales: ["de"], maxBatchSize: 1 }),
        }),
      };
    },
  };
}

interface Session {
  readonly client: Client;
  readonly project: SwitchableProject;
  readonly listChanges: () => number;
  close(): Promise<void>;
}

async function open(era: Era): Promise<Session> {
  const dir = await makeProject({ a: "A", b: "B" }, { de: {} });
  const project = switchableProject();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveMcpStdio(
    {
      project: project.session,
      cwd: dir,
      allowSpend: true,
      fs: nodeFs,
      createProvider: () => makeStubProvider(),
    },
    serverTransport,
  );
  let changes = 0;
  const client = new Client(
    { name: `${era}-client`, version: "1.0.0" },
    {
      versionNegotiation: { mode: era === "modern" ? { pin: MODERN } : "legacy" },
      listChanged: {
        tools: {
          autoRefresh: false,
          debounceMs: 0,
          onChanged: () => {
            changes += 1;
          },
        },
      },
    },
  );
  await client.connect(clientTransport);
  return {
    client,
    project,
    listChanges: () => changes,
    close: async () => {
      await client.close();
      await handle.close();
    },
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("serveMcpStdio: both protocol eras on one factory", () => {
  it.each([
    ["legacy", "2025-11-25"],
    ["modern", MODERN],
  ] as const)("negotiates the %s era as %s", async (era, version) => {
    const session = await open(era);

    expect(session.client.getProtocolEra()).toBe(era);
    expect(session.client.getNegotiatedProtocolVersion()).toBe(version);
    expect(session.client.getInstructions()).toBe(MCP_SERVER_INSTRUCTIONS);
    expect(session.client.getServerCapabilities()?.tools?.listChanged).toBe(true);
    await session.close();
  });

  it("answers server/discover with the modern revision", async () => {
    const session = await open("modern");

    const discovered = await session.client.request({ method: "server/discover" });

    expect(discovered.supportedVersions).toEqual([MODERN]);
    expect(discovered.capabilities.tools?.listChanged).toBe(true);
    await session.close();
  });

  it.each(["legacy", "modern"] as const)(
    "lists tools, announces a changed tool list, and reports progress on the %s era",
    async (era) => {
      const session = await open(era);
      const { client } = session;

      const before = (await client.listTools()).tools.map((tool) => tool.name);
      const snapshot = await client.callTool({ name: "project.snapshot", arguments: {} });
      session.project.configure();
      await client.callTool({ name: "project.snapshot", arguments: {} });
      await waitFor(() => session.listChanges() > 0);
      const after = (await client.listTools()).tools.map((tool) => tool.name);
      const updates: Progress[] = [];
      const run = await client.callTool(
        { name: "translation.translatePending", arguments: {} },
        { onprogress: (update) => updates.push(update) },
      );

      expect(before).not.toContain("translation.translatePending");
      expect(snapshot.structuredContent).toMatchObject({ configured: false });
      expect(session.listChanges()).toBe(1);
      expect(after).toContain("translation.translatePending");
      expect(run.isError).toBeUndefined();
      expect(updates.at(-1)).toMatchObject({ progress: 2, total: 2 });
      await session.close();
    },
  );
});

interface RawSession {
  readonly received: JSONRPCMessage[];
  readonly logLines: string[];
  readonly factoryRuns: () => number;
  send(message: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": MODERN,
  "io.modelcontextprotocol/clientInfo": { name: "raw-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

async function openRaw(): Promise<RawSession> {
  const dir = await makeProject({ a: "A" }, { de: {} });
  const project = staticProject();
  let runs = 0;
  const counted: McpProjectSession = {
    current: () => project.current(),
    latest: () => {
      runs += 1;
      return project.latest();
    },
  };
  const received: JSONRPCMessage[] = [];
  const logLines: string[] = [];
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clientTransport.onmessage = (message) => {
    received.push(message);
  };
  await clientTransport.start();
  const handle = serveMcpStdio(
    { project: counted, cwd: dir, onLog: (line) => logLines.push(line) },
    serverTransport,
  );
  return {
    received,
    logLines,
    factoryRuns: () => runs,
    send: (message) => clientTransport.send({ jsonrpc: "2.0", ...message } as JSONRPCMessage),
    close: () => handle.close(),
  };
}

function answered(session: RawSession, id: number): Record<string, unknown> | undefined {
  return session.received.find(
    (message) => "id" in message && message.id === id && !("method" in message),
  ) as Record<string, unknown> | undefined;
}

describe("serveMcpStdio: connection edge cases", () => {
  it("serves a legacy initialize after a server/discover probe on a fresh instance", async () => {
    const session = await openRaw();

    await session.send({ id: 1, method: "server/discover", params: { _meta: MODERN_META } });
    await waitFor(() => answered(session, 1) !== undefined);
    await session.send({
      id: 2,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "raw-client", version: "1.0.0" },
      },
    });
    await waitFor(() => answered(session, 2) !== undefined);
    await session.send({ method: "notifications/initialized" });
    await session.send({ id: 3, method: "tools/list", params: {} });
    await waitFor(() => answered(session, 3) !== undefined);

    expect(answered(session, 1)?.result).toMatchObject({ supportedVersions: [MODERN] });
    expect(answered(session, 2)?.result).toMatchObject({ protocolVersion: "2025-11-25" });
    expect(answered(session, 3)?.result).toMatchObject({
      tools: expect.arrayContaining([expect.objectContaining({ name: "project.snapshot" })]),
    });
    expect(session.factoryRuns()).toBe(2);
    await session.close();
  });

  it("reports a connection error through onLog", async () => {
    const session = await openRaw();

    await session.send({ id: 7, result: {} });
    await waitFor(() => session.logLines.length > 0);

    expect(session.logLines).toEqual([
      expect.stringMatching(/^MCP connection error: Discarded a JSON-RPC response/),
    ]);
    await session.close();
  });
});
