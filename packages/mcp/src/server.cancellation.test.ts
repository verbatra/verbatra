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

async function cancelledRun() {
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

  const controller = new AbortController();
  const call = client.callTool(
    { name: "translation.translatePending", arguments: {} },
    { signal: controller.signal, onprogress: () => undefined },
  );
  await vi.waitFor(() => expect(gated.signals).toHaveLength(2), { timeout: 30_000, interval: 5 });
  controller.abort("the user clicked Stop");
  await expect(call).rejects.toThrow();
  await vi.waitFor(
    () => expect(logLines.some((line) => line.startsWith(CANCELLED_LOG))).toBe(true),
    { timeout: 30_000, interval: 5 },
  );
  return { dir, client, gated, frames };
}

describe("createMcpServer: cancelling translation.translatePending", () => {
  it("aborts the provider request, releases the locks, records the run, and sends nothing after the cancellation", async () => {
    const { dir, gated, frames } = await cancelledRun();

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
  });

  it("runs the next call once the cancelled one released the in-flight guard", async () => {
    const { client } = await cancelledRun();

    const next = await client.callTool({ name: "translation.translatePending", arguments: {} });

    expect(next.isError).toBeUndefined();
    expect(next.structuredContent).toMatchObject({ succeeded: ["de"], failed: [] });
    expect(next.structuredContent).not.toHaveProperty("cancelled");
  });
});
