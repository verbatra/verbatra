import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type LoadedConfig, loadConfigWithMeta, redact } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "./server.js";
import { makeProject, staticProject } from "./test-support.js";
import type { McpServerOptions } from "./types.js";

const KEY_ENV_VAR = "MCP_TEST_LOCAL_KEY";
const FAKE_KEY = "fakeLocalKeyValue42";

async function connectedClient(options: McpServerOptions): Promise<Client> {
  const server = createMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function loadCustomKeyConfig(glossary: Record<string, string>): Promise<LoadedConfig> {
  return loadConfigWithMeta({
    configOverride: {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      glossary,
      provider: {
        id: "openai-compatible",
        options: {
          baseUrl: "http://localhost:11434/v1",
          model: "m",
          maxOutputTokens: 256,
          apiKeyEnvVar: KEY_ENV_VAR,
        },
      },
    },
  });
}

describe("createMcpServer: a key read through a custom apiKeyEnvVar never reaches the wire", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY_ENV_VAR];
    process.env[KEY_ENV_VAR] = FAKE_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[KEY_ENV_VAR];
    } else {
      process.env[KEY_ENV_VAR] = saved;
    }
  });

  it("redacts the value from a successful tool result", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: FAKE_KEY } });
    const client = await connectedClient({
      project: staticProject(await loadCustomKeyConfig({})),
      cwd: dir,
    });

    const result = await client.callTool({
      name: "key.value",
      arguments: { locale: "de", key: "greeting" },
    });

    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });

  it("redacts the value from glossary entries", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const client = await connectedClient({
      project: staticProject(await loadCustomKeyConfig({ Leaked: FAKE_KEY })),
      cwd: dir,
    });

    const result = await client.callTool({ name: "glossary.get", arguments: {} });

    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(result)).toContain("Leaked");
  });

  it("redacts the value from a tool error message and its diagnostic log line", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const logs: string[] = [];
    const client = await connectedClient({
      project: staticProject(await loadCustomKeyConfig({})),
      cwd: dir,
      onLog: (line) => logs.push(line),
    });

    const result = await client.callTool({
      name: "key.value",
      arguments: { locale: "de", key: FAKE_KEY },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain(FAKE_KEY);
    expect(logs.join("\n")).toContain("[REDACTED]");
  });
});

describe("createMcpServer: declares the key variable of the config it receives", () => {
  const name = "MCP_CREATE_LOCAL_KEY";
  const fakeKey = "fakeMcpCreateKey42";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[name];
    process.env[name] = fakeKey;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved;
    }
  });

  it("scrubs the value even when the config never went through loadConfig", () => {
    const config: LoadedConfig = {
      config: {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: {
          id: "openai-compatible",
          options: {
            baseUrl: "http://localhost:11434/v1",
            model: "m",
            maxOutputTokens: 256,
            apiKeyEnvVar: name,
          },
        },
      },
      source: { kind: "override" },
      glossary: { source: "none" },
    };
    expect(redact(`x ${fakeKey}`)).toBe(`x ${fakeKey}`);

    createMcpServer({ project: staticProject(config), cwd: "/project" });

    expect(redact(`x ${fakeKey}`)).toBe("x [REDACTED]");
  });
});
