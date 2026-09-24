import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  makeConsumer,
  pollUntil,
  type Subprocess,
  spawnVerbatra,
  writeJsonIn,
} from "../src/harness.js";

function jsonRpcLine(message: Record<string, unknown>): string {
  return `${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`;
}

const INITIALIZE_REQUEST = jsonRpcLine({
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "verbatra-e2e", version: "0.0.0" },
  },
});

const INITIALIZED_NOTIFICATION = jsonRpcLine({ method: "notifications/initialized" });

const EDIT_ENTRY_REQUEST = jsonRpcLine({
  id: 2,
  method: "tools/call",
  params: {
    name: "translation.editEntry",
    arguments: { locale: "de", key: "greeting", value: "Hallo Welt" },
  },
});

async function scaffoldProject(dir: string): Promise<void> {
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello" });
  await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo" });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
  });
}

async function lockFilesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.filter((name) => name.endsWith(".lock"));
}

interface Session {
  readonly result: Awaited<Subprocess>;
  readonly stdout: string;
}

async function exchangeThenCloseStdin(
  server: Subprocess,
  steps: readonly (readonly [request: string, awaitedId: number | undefined])[],
): Promise<Session> {
  let stdout = "";
  server.stdout?.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  try {
    for (const [request, awaitedId] of steps) {
      server.stdin?.write(request);
      if (awaitedId !== undefined) {
        await pollUntil(() => stdout.includes(`"id":${awaitedId}`), {
          timeoutMs: 60_000,
          intervalMs: 100,
        });
      }
    }
  } finally {
    server.stdin?.end();
  }
  return { result: await server, stdout };
}

function responseTo(stdout: string, id: number): Record<string, unknown> | undefined {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((message) => message.id === id);
}

describe("mcp (no key)", () => {
  let consumer: Consumer;
  let dir: string;

  beforeAll(async () => {
    consumer = await makeConsumer({ withMcp: true });
    dir = join(consumer.dir, "mcp-project");
    await scaffoldProject(dir);
  }, 180_000);

  it("verbatra mcp exits 0 without an unsettled-await warning when the client closes stdin", async () => {
    const { result } = await exchangeThenCloseStdin(
      spawnVerbatra(consumer, ["mcp", "--cwd", dir]),
      [[INITIALIZE_REQUEST, 1]],
    );

    expect(result.signal).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/unsettled top-level await/i);
    expect(await lockFilesUnder(dir)).toEqual([]);
  }, 120_000);

  it("verbatra mcp releases the locale lock of an edit once the client closes stdin", async () => {
    const { result, stdout } = await exchangeThenCloseStdin(
      spawnVerbatra(consumer, ["mcp", "--cwd", dir]),
      [
        [INITIALIZE_REQUEST, 1],
        [INITIALIZED_NOTIFICATION, undefined],
        [EDIT_ENTRY_REQUEST, 2],
      ],
    );

    expect(responseTo(stdout, 2)).toMatchObject({
      result: { structuredContent: { accepted: true, value: "Hallo Welt" } },
    });
    expect(JSON.parse(await readFile(join(dir, "locales/de.json"), "utf8"))).toEqual({
      greeting: "Hallo Welt",
    });
    expect(result.signal).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(await lockFilesUnder(dir)).toEqual([]);
  }, 120_000);

  it("verbatra-mcp exits 0 when the client closes stdin", async () => {
    const standalone = {
      ...consumer,
      bin: join(consumer.dir, "node_modules", ".bin", "verbatra-mcp"),
    };
    const { result } = await exchangeThenCloseStdin(spawnVerbatra(standalone, ["--cwd", dir]), [
      [INITIALIZE_REQUEST, 1],
    ]);

    expect(result.signal).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/unsettled top-level await/i);
    expect(await lockFilesUnder(dir)).toEqual([]);
  }, 120_000);
});
