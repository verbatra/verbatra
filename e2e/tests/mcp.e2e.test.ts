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

const INITIALIZE_REQUEST = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "verbatra-e2e", version: "0.0.0" },
  },
})}\n`;

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

async function initializeThenCloseStdin(server: Subprocess): Promise<Awaited<Subprocess>> {
  let stdout = "";
  server.stdout?.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  server.stdin?.write(INITIALIZE_REQUEST);
  try {
    await pollUntil(() => stdout.includes('"id":1'), { timeoutMs: 60_000, intervalMs: 100 });
  } finally {
    server.stdin?.end();
  }
  return server;
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
    const result = await initializeThenCloseStdin(spawnVerbatra(consumer, ["mcp", "--cwd", dir]));

    expect(result.signal).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/unsettled top-level await/i);
  }, 120_000);

  it("verbatra-mcp exits 0 when the client closes stdin", async () => {
    const standalone = {
      ...consumer,
      bin: join(consumer.dir, "node_modules", ".bin", "verbatra-mcp"),
    };
    const result = await initializeThenCloseStdin(spawnVerbatra(standalone, ["--cwd", dir]));

    expect(result.signal).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/unsettled top-level await/i);
  }, 120_000);
});
