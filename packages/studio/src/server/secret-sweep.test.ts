import type { CreateProvider } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRpcRateLimiter } from "./rate-limiter.js";
import { createRpcHandlers, type RpcHandlerDeps } from "./rpc.js";
import { dispatchRpc } from "./rpc-gate.js";
import { baseStudioConfig, type FixtureProject, makeFixtureProject } from "./test-support.js";

const defaultHandlers = createRpcHandlers({ spend: false, writeToDisk: true });
const writeCapableHandlers = createRpcHandlers({ spend: true, writeToDisk: true });

const SENTINELS = {
  ANTHROPIC_API_KEY: "sentinel-anthropic-9f3ac1",
  OPENAI_API_KEY: "sentinel-openai-2b77e4",
  GEMINI_API_KEY: "sentinel-gemini-11cd90",
  DEEPL_API_KEY: "sentinel-deepl-77aa02",
  GOOGLE_TRANSLATE_API_KEY: "sentinel-google-translate-5c19f0",
} as const;

const ENV_VAR_NAMES = Object.keys(SENTINELS) as (keyof typeof SENTINELS)[];

class FakeDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SdkError";
    this.code = code;
  }
}

function body(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function depsWithSentinelConfig(): RpcHandlerDeps {
  const config = baseStudioConfig({
    sourceLocale: SENTINELS.ANTHROPIC_API_KEY,
    files: { pattern: `locales/{locale}-${SENTINELS.OPENAI_API_KEY}.json` },
  });
  return {
    config: {
      config,
      source: {
        kind: "explicit",
        filepath: `/project/${SENTINELS.OPENAI_API_KEY}/verbatra.config.ts`,
      },
      glossary: { source: "file", path: `/project/${SENTINELS.GEMINI_API_KEY}.json` },
    },
    projectRoot: "/project",
  };
}

describe("secret sweep across every registered method and error path", () => {
  const originalValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of ENV_VAR_NAMES) {
      originalValues[name] = process.env[name];
      process.env[name] = SENTINELS[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_VAR_NAMES) {
      const value = originalValues[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  function assertNoSentinel(responseBody: string): void {
    for (const sentinel of Object.values(SENTINELS)) {
      expect(responseBody).not.toContain(sentinel);
    }
  }

  it("never leaks a sentinel through the project.snapshot projection", async () => {
    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      depsWithSentinelConfig(),
      defaultHandlers,
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel through a mapped domain-error message", async () => {
    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      depsWithSentinelConfig(),
      {
        "project.snapshot": async () => {
          throw new FakeDomainError("CONFIG_INVALID", `bad config near ${SENTINELS.DEEPL_API_KEY}`);
        },
      },
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for an unimplemented contract method", async () => {
    const result = await dispatchRpc(
      body({ method: "status.check", params: {} }),
      depsWithSentinelConfig(),
      defaultHandlers,
    );

    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for an unknown method or invalid params", async () => {
    const unknown = await dispatchRpc(
      body({ method: `not.${SENTINELS.ANTHROPIC_API_KEY}`, params: {} }),
      depsWithSentinelConfig(),
      defaultHandlers,
    );
    const invalidParams = await dispatchRpc(
      body({ method: "status.check", params: { locales: [] } }),
      depsWithSentinelConfig(),
      defaultHandlers,
    );

    assertNoSentinel(unknown.body);
    assertNoSentinel(invalidParams.body);
  });

  it("never leaks a sentinel through the constant INTERNAL body for an unexpected throw", async () => {
    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      depsWithSentinelConfig(),
      {
        "project.snapshot": async () => {
          throw new Error(`unexpected failure near ${SENTINELS.ANTHROPIC_API_KEY}`);
        },
      },
    );

    expect(result.statusCode).toBe(500);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for translation.retranslateEntry's UNKNOWN_LOCALE error path", async () => {
    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "fr", key: "greeting" } }),
      depsWithSentinelConfig(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for translation.retranslateEntry's PROVIDER_CONSTRUCTION_FAILED error path", async () => {
    const throwingCreateProvider: CreateProvider = () => {
      throw new Error(`missing key near ${SENTINELS.OPENAI_API_KEY}`);
    };
    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "greeting" } }),
      { ...depsWithSentinelConfig(), createProvider: throwingCreateProvider },
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel through a tripped METHOD_RATE_LIMITED response", async () => {
    const alwaysTripped = createRpcRateLimiter({
      "translation.retranslateEntry": { windowMs: 60_000, maxCalls: 0 },
    });
    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "greeting" } }),
      depsWithSentinelConfig(),
      writeCapableHandlers,
      alwaysTripped,
    );

    expect(result.statusCode).toBe(429);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for translation.translatePending's PROVIDER_CONSTRUCTION_FAILED error path", async () => {
    const throwingCreateProvider: CreateProvider = () => {
      throw new Error(`missing key near ${SENTINELS.GEMINI_API_KEY}`);
    };
    const result = await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      { ...depsWithSentinelConfig(), createProvider: throwingCreateProvider },
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel through a tripped METHOD_RATE_LIMITED response for translation.translatePending", async () => {
    const alwaysTripped = createRpcRateLimiter({
      "translation.translatePending": { windowMs: 60_000, maxCalls: 0 },
    });
    const result = await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      depsWithSentinelConfig(),
      writeCapableHandlers,
      alwaysTripped,
    );

    expect(result.statusCode).toBe(429);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for translation.editEntry's UNKNOWN_LOCALE error path", async () => {
    const result = await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "fr", key: "greeting", value: "anything" },
      }),
      depsWithSentinelConfig(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel for key.value's UNKNOWN_LOCALE error path", async () => {
    const result = await dispatchRpc(
      body({ method: "key.value", params: { locale: "fr", key: "greeting" } }),
      depsWithSentinelConfig(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    assertNoSentinel(result.body);
  });

  it("never leaks a sentinel through a tripped METHOD_RATE_LIMITED response for translation.editEntry", async () => {
    const alwaysTripped = createRpcRateLimiter({
      "translation.editEntry": { windowMs: 60_000, maxCalls: 0 },
    });
    const result = await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "greeting", value: "anything" },
      }),
      depsWithSentinelConfig(),
      writeCapableHandlers,
      alwaysTripped,
    );

    expect(result.statusCode).toBe(429);
    assertNoSentinel(result.body);
  });
});

describe("secret sweep: translation.retranslateEntry against a real fixture project", () => {
  let project: FixtureProject;

  beforeEach(async () => {
    project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "Hello {{name}}" });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  function fixtureDeps(createProvider: CreateProvider): RpcHandlerDeps {
    return {
      config: {
        config: project.config,
        source: { kind: "override" },
        glossary: { source: "none" },
      },
      projectRoot: project.root,
      createProvider,
    };
  }

  const SENTINEL_VALUE = "sentinel-fixture-provider-4c8e21";

  function assertNoSentinelValue(responseBody: string): void {
    expect(responseBody).not.toContain(SENTINEL_VALUE);
  }

  it("never leaks a planted sentinel through the success path (the accepted translation itself is excluded by design)", async () => {
    const provider: CreateProvider = () => ({
      id: "stub",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async (request) => ({
        values: new Map(request.entries.map((entry) => [entry.key, "Hallo {{name}}"])),
        integrity: new Map(),
      }),
    });

    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "greeting" } }),
      fixtureDeps(provider),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { ok: boolean; result?: { accepted: boolean } };
    expect(parsed).toMatchObject({ ok: true, result: { accepted: true, value: "Hallo {{name}}" } });
    assertNoSentinelValue(result.body);
  });

  it("never leaks a planted sentinel through the rejection path (a genuine placeholder mismatch)", async () => {
    const provider: CreateProvider = () => ({
      id: "stub",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async () => ({
        values: new Map([["greeting", "Hallo"]]),
        integrity: new Map(),
      }),
    });

    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "greeting" } }),
      fixtureDeps(provider),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      ok: boolean;
      result?: { accepted: boolean; reason?: string };
    };
    expect(parsed).toMatchObject({ ok: true, result: { accepted: false, reason: "placeholder" } });
    assertNoSentinelValue(result.body);
  });

  it("never leaks a planted sentinel through the UNKNOWN_KEY error path", async () => {
    const provider: CreateProvider = () => ({
      id: "stub",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async () => ({
        values: new Map([["greeting", `Hallo ${SENTINEL_VALUE}`]]),
        integrity: new Map(),
      }),
    });

    const result = await dispatchRpc(
      body({
        method: "translation.retranslateEntry",
        params: { locale: "de", key: "missing-key" },
      }),
      fixtureDeps(provider),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { ok: boolean; error?: { code: string } };
    expect(parsed).toMatchObject({ ok: false, error: { code: "UNKNOWN_KEY" } });
    assertNoSentinelValue(result.body);
  });
});

describe("secret sweep: translation.editEntry and key.value against a real fixture project", () => {
  const ELSEWHERE_SENTINEL = "sentinel-elsewhere-key-8a21fd";
  let project: FixtureProject;

  beforeEach(async () => {
    project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "Hello {{name}}", secret: ELSEWHERE_SENTINEL },
    );
  });

  afterEach(async () => {
    await project.cleanup();
  });

  function fixtureDeps(): RpcHandlerDeps {
    return {
      config: {
        config: project.config,
        source: { kind: "override" },
        glossary: { source: "none" },
      },
      projectRoot: project.root,
    };
  }

  function assertNoElsewhereSentinel(responseBody: string): void {
    expect(responseBody).not.toContain(ELSEWHERE_SENTINEL);
  }

  it("never leaks the elsewhere sentinel through translation.editEntry's acceptance path", async () => {
    const result = await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "greeting", value: "Hallo {{name}}" },
      }),
      fixtureDeps(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { ok: boolean; result?: { accepted: boolean } };
    expect(parsed).toMatchObject({ ok: true, result: { accepted: true, value: "Hallo {{name}}" } });
    assertNoElsewhereSentinel(result.body);
  });

  it("never leaks the elsewhere sentinel through translation.editEntry's rejection path", async () => {
    const result = await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "greeting", value: "Hallo" },
      }),
      fixtureDeps(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      ok: boolean;
      result?: { accepted: boolean; reason?: string };
    };
    expect(parsed).toMatchObject({ ok: true, result: { accepted: false, reason: "placeholder" } });
    assertNoElsewhereSentinel(result.body);
  });

  it("never leaks the elsewhere sentinel through translation.editEntry's UNKNOWN_KEY error path", async () => {
    const result = await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "missing-key", value: "anything" },
      }),
      fixtureDeps(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { ok: boolean; error?: { code: string } };
    expect(parsed).toMatchObject({ ok: false, error: { code: "UNKNOWN_KEY" } });
    assertNoElsewhereSentinel(result.body);
  });

  it("key.value's result carries only the requested key's own prose, never the elsewhere sentinel", async () => {
    const result = await dispatchRpc(
      body({ method: "key.value", params: { locale: "de", key: "greeting" } }),
      fixtureDeps(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { ok: boolean; result?: { source: string } };
    expect(parsed).toMatchObject({ ok: true, result: { source: "Hello {{name}}" } });
    assertNoElsewhereSentinel(result.body);
  });

  it("key.value's UNKNOWN_KEY error path never leaks the elsewhere sentinel", async () => {
    const result = await dispatchRpc(
      body({ method: "key.value", params: { locale: "de", key: "missing-key" } }),
      fixtureDeps(),
      writeCapableHandlers,
    );

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { ok: boolean; error?: { code: string } };
    expect(parsed).toMatchObject({ ok: false, error: { code: "UNKNOWN_KEY" } });
    assertNoElsewhereSentinel(result.body);
  });
});
