import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type LoadedConfig, loadConfigWithMeta, redact } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startStudioServer } from "./create-studio-server.js";
import { glossaryGetHandler } from "./methods/glossary.js";
import { dispatchRpc } from "./rpc-gate.js";
import { createSseHub, type SseClientResponse } from "./sse.js";

const KEY_ENV_VAR = "STUDIO_TEST_LOCAL_KEY";
const FAKE_KEY = "fakeStudioLocalKey42";

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

describe("studio server: a key read through a custom apiKeyEnvVar never reaches the browser", () => {
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

  it("redacts the value from glossary entries", async () => {
    const loaded = await loadCustomKeyConfig({ Leaked: FAKE_KEY });

    const result = await glossaryGetHandler({}, { config: loaded, projectRoot: "/project" });

    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    expect(result.redactedTerms).toEqual(["Leaked"]);
  });

  it("redacts the value from an rpc error message", async () => {
    const loaded = await loadCustomKeyConfig({});
    const failure = Object.assign(new Error(`failed near ${FAKE_KEY}`), {
      name: "SdkError",
      code: "CONFIG_INVALID",
    });

    const result = await dispatchRpc(
      Buffer.from(JSON.stringify({ method: "project.snapshot", params: {} })),
      { config: loaded, projectRoot: "/project" },
      {
        "project.snapshot": async () => {
          throw failure;
        },
      },
    );

    expect(result.body).not.toContain(FAKE_KEY);
    expect(result.body).toContain("[REDACTED]");
  });

  it("redacts the value from a server-sent event frame", async () => {
    await loadCustomKeyConfig({});
    const hub = createSseHub();
    const writes: string[] = [];
    const response = Object.assign(new EventEmitter(), {
      write: (chunk: string): boolean => {
        writes.push(chunk);
        return true;
      },
      end: (): void => {},
    }) as EventEmitter & SseClientResponse;
    hub.register(response);

    hub.broadcastRefresh({ reason: "source", at: FAKE_KEY });

    expect(writes.join("")).not.toContain(FAKE_KEY);
    expect(writes.join("")).toContain("[REDACTED]");
    hub.closeAll();
  });
});

describe("startStudioServer: declares the key variable of the config its loader returns", () => {
  const name = "STUDIO_START_LOCAL_KEY";
  const fakeKey = "fakeStudioStartKey42";
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

  it("scrubs the value even when the config never went through loadConfig", async () => {
    const root = await mkdtemp(join(tmpdir(), "verbatra-studio-key-env-"));
    await writeFile(join(root, "index.html"), "<html></html>");
    const loaded: LoadedConfig = {
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

    const server = await startStudioServer({
      port: 0,
      cwd: root,
      assetsRoot: pathToFileURL(`${root}/`),
      loader: async () => loaded,
    });
    try {
      expect(redact(`x ${fakeKey}`)).toBe("x [REDACTED]");
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
