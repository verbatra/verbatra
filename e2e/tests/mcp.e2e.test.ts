import { access, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  makeConsumer,
  pollUntil,
  type Subprocess,
  spawnVerbatra,
  writeJsonIn,
} from "../src/harness.js";
import { type StalledEndpoint, startStalledEndpoint } from "../src/stalled-endpoint.js";

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

const TRANSLATE_PENDING_REQUEST = jsonRpcLine({
  id: 2,
  method: "tools/call",
  params: { name: "translation.translatePending", arguments: {} },
});

function toolCall(id: number, name: string, args: Record<string, unknown> = {}): string {
  return jsonRpcLine({ id, method: "tools/call", params: { name, arguments: args } });
}

interface ToolResponse {
  readonly result?: {
    readonly isError?: boolean;
    readonly structuredContent?: Record<string, unknown>;
    readonly content?: readonly { readonly text: string }[];
  };
}

function toolResponse(stdout: string, id: number): ToolResponse {
  return (responseTo(stdout, id) ?? {}) as ToolResponse;
}

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

async function scaffoldStalledProject(dir: string, baseUrl: string): Promise<void> {
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello" });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: {
      id: "openai-compatible",
      options: { baseUrl, model: "e2e-stalled", maxOutputTokens: 256, requestTimeoutMs: 600_000 },
    },
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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
  beforeClose: () => Promise<unknown> = async () => undefined,
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
    await beforeClose();
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
  async function exchangeAfterConfig(projectDir: string): Promise<Session> {
    const server = spawnVerbatra(consumer, ["mcp", "--cwd", projectDir]);
    let stdout = "";
    server.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    try {
      server.stdin?.write(INITIALIZE_REQUEST);
      await pollUntil(() => stdout.includes('"id":1'), { timeoutMs: 60_000, intervalMs: 100 });
      server.stdin?.write(INITIALIZED_NOTIFICATION);
      await scaffoldProject(projectDir);
      server.stdin?.write(toolCall(2, "project.snapshot"));
      server.stdin?.write(toolCall(3, "status.check"));
      await pollUntil(() => stdout.includes('"id":3'), { timeoutMs: 60_000, intervalMs: 100 });
    } finally {
      server.stdin?.end();
    }
    return { result: await server, stdout };
  }

  let consumer: Consumer;
  let dir: string;
  let endpoint: StalledEndpoint;

  beforeAll(async () => {
    consumer = await makeConsumer({ withMcp: true });
    dir = join(consumer.dir, "mcp-project");
    await scaffoldProject(dir);
    endpoint = await startStalledEndpoint();
  }, 180_000);

  afterAll(async () => {
    await endpoint.close();
  });

  it("verbatra mcp exits 0 without an unsettled-await warning when the client closes stdin", async () => {
    const { result } = await exchangeThenCloseStdin(
      spawnVerbatra(consumer, ["mcp", "--cwd", dir]),
      [[INITIALIZE_REQUEST, 1]],
    );

    expect(result.signal).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/unsettled top-level await/i);
    expect(result.stderr).toContain(
      "verbatra MCP server running on stdio (project mcp-project, spend tools off)\n",
    );
    expect(result.stderr).toContain("verbatra MCP server stopped (client closed stdin)");
    expect(result.stderr).not.toContain("Ctrl-C");
    expect(await lockFilesUnder(dir)).toEqual([]);
  }, 120_000);

  it("verbatra mcp writes a keyless editEntry, leaves no locale lock, and exits 0 when the client closes stdin", async () => {
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

  it("verbatra mcp releases a locale lock held by an in-flight translatePending when the client closes stdin", async () => {
    const stalledDir = join(consumer.dir, "mcp-held-lock");
    await scaffoldStalledProject(stalledDir, endpoint.baseUrl);
    const requestsBefore = endpoint.requestsReceived();
    const server = spawnVerbatra(consumer, ["mcp", "--cwd", stalledDir, "--allow-spend"]);

    try {
      const { result, stdout } = await exchangeThenCloseStdin(
        server,
        [
          [INITIALIZE_REQUEST, 1],
          [INITIALIZED_NOTIFICATION, undefined],
          [TRANSLATE_PENDING_REQUEST, undefined],
        ],
        () =>
          pollUntil(
            async () =>
              endpoint.requestsReceived() > requestsBefore &&
              (await exists(join(stalledDir, ".verbatra-local/locks/de.lock"))),
            { timeoutMs: 60_000, intervalMs: 50 },
          ),
      );

      expect(responseTo(stdout, 2)).toBeUndefined();
      expect(result.stderr).toContain(
        "verbatra MCP server running on stdio (project mcp-held-lock, spend tools on)\n",
      );
      expect(result.signal).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(await lockFilesUnder(stalledDir)).toEqual([]);
    } finally {
      server.kill("SIGKILL");
    }
  }, 120_000);

  it.each(["SIGINT", "SIGTERM"] as const)(
    "verbatra-mcp stops promptly on %s during an in-flight translatePending and leaves no locale lock",
    async (signal) => {
      const stalledDir = join(consumer.dir, `mcp-standalone-${signal.toLowerCase()}`);
      await scaffoldStalledProject(stalledDir, endpoint.baseUrl);
      const requestsBefore = endpoint.requestsReceived();
      const standalone = {
        ...consumer,
        bin: join(consumer.dir, "node_modules", ".bin", "verbatra-mcp"),
      };
      const server = spawnVerbatra(standalone, ["--cwd", stalledDir, "--allow-spend"]);
      let stdout = "";
      server.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += String(chunk);
      });

      try {
        server.stdin?.write(INITIALIZE_REQUEST);
        await pollUntil(() => stdout.includes('"id":1'), { timeoutMs: 60_000, intervalMs: 100 });
        server.stdin?.write(INITIALIZED_NOTIFICATION);
        server.stdin?.write(TRANSLATE_PENDING_REQUEST);
        await pollUntil(
          async () =>
            endpoint.requestsReceived() > requestsBefore &&
            (await exists(join(stalledDir, ".verbatra-local/locks/de.lock"))),
          { timeoutMs: 60_000, intervalMs: 50 },
        );

        const signalledAt = Date.now();
        server.kill(signal);
        const result = await server;
        const elapsedMs = Date.now() - signalledAt;

        expect(result.signal).toBeUndefined();
        expect(result.exitCode).toBe(0);
        expect(elapsedMs).toBeLessThan(10_000);
        expect(result.stderr).toContain("verbatra MCP server stopped");
        expect(await lockFilesUnder(stalledDir)).toEqual([]);
      } finally {
        server.kill("SIGKILL");
      }
    },
    120_000,
  );

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
    expect(result.stderr).toContain(
      "verbatra MCP server running on stdio (project mcp-project, spend tools off)\n",
    );
    expect(result.stderr).toContain("verbatra MCP server stopped (client closed stdin)");
    expect(await lockFilesUnder(dir)).toEqual([]);
  }, 120_000);

  it("verbatra mcp starts in an empty directory, guides through project.doctor, and loads a config written later without a restart", async () => {
    const emptyDir = join(consumer.dir, "mcp-unconfigured");
    await mkdir(emptyDir, { recursive: true });

    const { result, stdout } = await exchangeThenCloseStdin(
      spawnVerbatra(consumer, ["mcp", "--cwd", emptyDir]),
      [
        [INITIALIZE_REQUEST, 1],
        [INITIALIZED_NOTIFICATION, undefined],
        [toolCall(2, "project.snapshot"), 2],
        [toolCall(3, "project.doctor"), 3],
        [toolCall(4, "status.check"), 4],
      ],
    );
    const configured = await exchangeAfterConfig(emptyDir);

    expect(toolResponse(stdout, 2).result?.structuredContent).toMatchObject({
      configured: false,
      configProblem: { code: "CONFIG_NOT_FOUND" },
      nextStep: expect.stringContaining("project.doctor"),
    });
    const doctorChecks = toolResponse(stdout, 3).result?.structuredContent?.checks as
      | readonly Record<string, unknown>[]
      | undefined;
    expect(doctorChecks?.[0]).toMatchObject({
      id: "config",
      status: "fail",
      fix: expect.stringContaining("verbatra init"),
    });
    const refusal = toolResponse(stdout, 4).result;
    expect(refusal?.isError).toBe(true);
    expect(refusal?.content?.[0]?.text).toMatch(/^CONFIG_NOT_FOUND: [\s\S]*\nNext step: /);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(
      "verbatra MCP server running on stdio (project mcp-unconfigured, spend tools off)\n",
    );
    expect(result.stderr).toContain("Running without a usable project config: CONFIG_NOT_FOUND");
    expect(result.stderr).toContain("npx verbatra init");

    expect(toolResponse(configured.stdout, 2).result?.structuredContent).toMatchObject({
      configured: true,
      targetLocales: ["de"],
    });
    expect(toolResponse(configured.stdout, 3).result?.isError).toBeUndefined();
    expect(configured.result.stderr).toContain("Loaded the project config from .verbatrarc.json");
  }, 120_000);

  it("verbatra-mcp starts in an empty directory and answers project.snapshot and project.doctor", async () => {
    const emptyDir = join(consumer.dir, "mcp-standalone-unconfigured");
    await mkdir(emptyDir, { recursive: true });
    const standalone = {
      ...consumer,
      bin: join(consumer.dir, "node_modules", ".bin", "verbatra-mcp"),
    };

    const { result, stdout } = await exchangeThenCloseStdin(
      spawnVerbatra(standalone, ["--cwd", emptyDir]),
      [
        [INITIALIZE_REQUEST, 1],
        [INITIALIZED_NOTIFICATION, undefined],
        [toolCall(2, "project.snapshot"), 2],
        [toolCall(3, "project.doctor"), 3],
      ],
    );

    expect(toolResponse(stdout, 2).result?.structuredContent).toMatchObject({ configured: false });
    expect(toolResponse(stdout, 3).result?.structuredContent).toMatchObject({ ok: false });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("npx verbatra init");
  }, 120_000);

  describe("verbatra-mcp argument parsing", () => {
    function standaloneBin(): Consumer {
      return { ...consumer, bin: join(consumer.dir, "node_modules", ".bin", "verbatra-mcp") };
    }

    async function settleWithStdinOpen(args: string[]) {
      const server = spawnVerbatra(standaloneBin(), args, { cwd: dir });
      const timeout = new Promise<"timed out">((resolve) => {
        setTimeout(() => resolve("timed out"), 30_000).unref();
      });
      const outcome = await Promise.race([server, timeout]);
      if (outcome === "timed out") {
        server.kill("SIGKILL");
        throw new Error(`verbatra-mcp ${args.join(" ")} did not exit within 30s with stdin open`);
      }
      return outcome;
    }

    it("--help prints the usage and exits 0 without waiting on stdin", async () => {
      const result = await settleWithStdinOpen(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: verbatra-mcp [options]");
      expect(result.stdout).toContain("--allow-spend");
      expect(result.stderr).toBe("");
    }, 60_000);

    it("--version prints the installed @verbatra/mcp version and exits 0", async () => {
      const manifest = JSON.parse(
        await readFile(
          join(consumer.dir, "node_modules", "@verbatra", "mcp", "package.json"),
          "utf8",
        ),
      ) as { version: string };

      const result = await settleWithStdinOpen(["--version"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(manifest.version);
    }, 60_000);

    it.each([
      ["--allowspend", "unknown option '--allowspend' (did you mean --allow-spend?)"],
      ["--json", "verbatra-mcp does not take --json"],
    ])(
      "refuses %s with a usage error on stderr and exit 2",
      async (flag, message) => {
        const result = await settleWithStdinOpen([flag]);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(`verbatra-mcp: error [USAGE_ERROR] ${message}`);
      },
      60_000,
    );
  });
});
