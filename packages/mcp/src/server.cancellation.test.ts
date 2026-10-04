import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport, type JSONRPCMessage } from "@modelcontextprotocol/client";
import type { TranslateRequest, TranslationProvider } from "@verbatra/ai-providers";
import { runStatus } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "./server.js";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeProject,
  makeStubProvider,
  nodeFs,
  staticProject,
} from "./test-support.js";

const CANCELLED_LOG = 'Tool "translation.translatePending" cancelled by the client';
const CLOSED_LOG =
  'Tool "translation.translatePending" stopped because the client closed the connection';

interface GatedProvider {
  readonly provider: TranslationProvider;
  readonly signals: AbortSignal[];
}

function gatedProvider(): GatedProvider {
  const answering = makeStubProvider();
  const signals: AbortSignal[] = [];
  const provider: TranslationProvider = {
    ...answering,
    translateBatch: (request: TranslateRequest) => {
      const signal = request.signal;
      if (signal !== undefined) {
        signals.push(signal);
      }
      if (signals.length === 1) {
        return answering.translateBatch(request);
      }
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  };
  return { provider, signals };
}

function frameName(message: JSONRPCMessage): string {
  if ("method" in message) {
    return message.method;
  }
  return "result" in message ? "result" : "error";
}

async function heldLocks(dir: string): Promise<string[]> {
  try {
    return (await readdir(join(dir, ".verbatra-local", "locks"))).filter((name) =>
      name.endsWith(".lock"),
    );
  } catch {
    return [];
  }
}

type McpServer = ReturnType<typeof createMcpServer>;

async function connectClient(
  server: McpServer,
  frames: string[],
): Promise<{ readonly client: Client; readonly clientTransport: InMemoryTransport }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const send = serverTransport.send.bind(serverTransport);
  serverTransport.send = async (message, sendOptions) => {
    frames.push(`out:${frameName(message)}`);
    return send(message, sendOptions);
  };
  await server.connect(serverTransport);
  const receive = serverTransport.onmessage;
  serverTransport.onmessage = (message, extra) => {
    frames.push(`in:${frameName(message)}`);
    receive?.(message, extra);
  };
  const client = new Client({ name: "cancel-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, clientTransport };
}

async function heldRun() {
  const dir = await makeProject({ a: "Alpha", b: "Beta", c: "Gamma" }, { de: {} });
  const gated = gatedProvider();
  const providers = [gated.provider, makeStubProvider()];
  const logLines: string[] = [];
  const frames: string[] = [];
  const server = createMcpServer({
    project: staticProject(
      baseLoadedConfig({
        config: baseVerbatraConfig({ targetLocales: ["de"], maxBatchSize: 1 }),
      }),
    ),
    cwd: dir,
    allowSpend: true,
    fs: nodeFs,
    createProvider: () => providers.shift() ?? makeStubProvider(),
    onLog: (line) => logLines.push(line),
  });
  const { client, clientTransport } = await connectClient(server, frames);
  const controller = new AbortController();
  const call = client.callTool(
    { name: "translation.translatePending", arguments: {} },
    { signal: controller.signal, onprogress: () => undefined },
  );
  call.catch(() => undefined);
  await vi.waitFor(() => expect(gated.signals).toHaveLength(2), { timeout: 30_000, interval: 5 });
  const locksWhileHeld = await heldLocks(dir);
  async function logged(prefix: string): Promise<void> {
    await vi.waitFor(() => expect(logLines.some((line) => line.startsWith(prefix))).toBe(true), {
      timeout: 30_000,
      interval: 5,
    });
  }
  return {
    dir,
    server,
    client,
    clientTransport,
    controller,
    call,
    gated,
    frames,
    logLines,
    locksWhileHeld,
    logged,
  };
}

async function cancelledRun() {
  const run = await heldRun();
  run.controller.abort("the user clicked Stop");
  await expect(run.call).rejects.toThrow();
  await run.logged(CANCELLED_LOG);
  return run;
}

describe("createMcpServer: cancelling translation.translatePending", () => {
  it("aborts the provider request, releases the locks, records the run, and sends nothing after the cancellation", async () => {
    const { dir, gated, frames, locksWhileHeld, logLines } = await cancelledRun();

    expect(locksWhileHeld).not.toEqual([]);
    expect(gated.signals[1]?.aborted).toBe(true);
    expect(await heldLocks(dir)).toEqual([]);
    const status = await runStatus({ cwd: dir });
    expect(status).toMatchObject({
      available: true,
      locales: [{ locale: "de", status: "partial" }],
    });
    const cancelledAt = frames.indexOf("in:notifications/cancelled");
    expect(cancelledAt).toBeGreaterThan(-1);
    expect(frames.slice(cancelledAt + 1).filter((frame) => frame.startsWith("out:"))).toEqual([]);
    expect(logLines.some((line) => line.startsWith(CLOSED_LOG))).toBe(false);
  });

  it("runs the next call once the cancelled one released the in-flight guard", async () => {
    const { client } = await cancelledRun();

    const next = await client.callTool({ name: "translation.translatePending", arguments: {} });

    expect(next.isError).toBeUndefined();
    expect(next.structuredContent).toMatchObject({ succeeded: ["de"], failed: [] });
    expect(next.structuredContent).not.toHaveProperty("cancelled");
  });
});

describe("createMcpServer: the connection closing during translation.translatePending", () => {
  it("aborts the provider request, releases the locks and the in-flight guard, and logs the closed connection", async () => {
    const run = await heldRun();

    await run.clientTransport.close();
    await expect(run.call).rejects.toThrow();
    await run.logged(CLOSED_LOG);

    expect(run.locksWhileHeld).not.toEqual([]);
    expect(run.gated.signals[1]?.aborted).toBe(true);
    expect(await heldLocks(run.dir)).toEqual([]);
    expect(run.logLines.some((line) => line.startsWith(CANCELLED_LOG))).toBe(false);
    const { client } = await connectClient(run.server, []);
    const next = await client.callTool({ name: "translation.translatePending", arguments: {} });
    expect(next.isError).toBeUndefined();
    expect(next.structuredContent).toMatchObject({ succeeded: ["de"], failed: [] });
  });
});
