import { AdapterError } from "@verbatra/format-adapters";
import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { createRpcInFlightGuard, type RpcInFlightGuard } from "./in-flight-guard.js";
import { createRpcRateLimiter, type RpcRateLimiter } from "./rate-limiter.js";
import { createRpcHandlers, type HandlersRegistry, type RpcHandlerDeps } from "./rpc.js";
import { dispatchRpc } from "./rpc-gate.js";
import { baseStudioConfig } from "./test-support.js";

function deps(): RpcHandlerDeps {
  return {
    config: {
      config: baseStudioConfig(),
      source: { kind: "override" },
      glossary: { source: "none" },
    },
    projectRoot: "/project",
  };
}

function body(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

class FakeDomainError extends Error {
  readonly code: string;

  constructor(name: string, code: string, message: string) {
    super(message);
    this.name = name;
    this.code = code;
  }
}

async function parseBody(result: { body: string }): Promise<Record<string, unknown>> {
  return JSON.parse(result.body) as Record<string, unknown>;
}

describe("dispatchRpc envelope", () => {
  it("answers 400 REQUEST_INVALID for a body that is not JSON", async () => {
    const result = await dispatchRpc(Buffer.from("not json"), deps(), {});

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "REQUEST_INVALID" } });
  });

  it("answers 400 REQUEST_INVALID for JSON that is not { method, params } shaped", async () => {
    const result = await dispatchRpc(body(["not", "an", "object"]), deps(), {});

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "REQUEST_INVALID" } });
  });

  it("answers 400 REQUEST_INVALID when method is present but not a string", async () => {
    const result = await dispatchRpc(body({ method: 1, params: {} }), deps(), {});

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "REQUEST_INVALID" } });
  });

  it("answers 400 METHOD_UNKNOWN for a method not in the shared contract", async () => {
    const result = await dispatchRpc(body({ method: "not.a.method", params: {} }), deps(), {});

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
  });

  it("answers 403 SPEND_DISABLED naming --allow-spend for a spend method left unregistered", async () => {
    const handlers = createRpcHandlers({ spend: false, spendWithheld: "flag", writeToDisk: true });
    const result = await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      deps(),
      handlers,
    );

    expect(result.statusCode).toBe(403);
    expect(await parseBody(result)).toMatchObject({
      ok: false,
      error: { code: "SPEND_DISABLED", message: expect.stringContaining("--allow-spend") },
    });
  });

  it("names the provider none as the reason when the config disables machine translation", async () => {
    const humanOnly: RpcHandlerDeps = {
      ...deps(),
      config: {
        ...deps().config,
        config: baseStudioConfig({ provider: { id: "none", options: {} } }),
      },
    };
    const result = await dispatchRpc(
      body({ method: "translation.inFlight", params: {} }),
      humanOnly,
      createRpcHandlers({ spend: false, spendWithheld: "policy", writeToDisk: true }),
    );

    expect(await parseBody(result)).toMatchObject({
      error: { code: "SPEND_DISABLED", message: expect.stringContaining("provider is none") },
    });
  });

  it("answers 400 METHOD_UNKNOWN for a contract method with no registered handler", async () => {
    const result = await dispatchRpc(body({ method: "status.check", params: {} }), deps(), {});

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
  });

  it("answers 400 PARAMS_INVALID carrying only issue paths and codes, never a message or the received value", async () => {
    const result = await dispatchRpc(
      body({ method: "status.check", params: { locales: [] } }),
      deps(),
      {},
    );

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
    const error = parsed.error as { issues: readonly { path: string[]; code: string }[] };
    expect(error.issues).toEqual([{ path: ["locales"], code: "too_small" }]);
    expect(result.body).not.toContain("secret-locale-value");
  });

  it("answers 400 PARAMS_INVALID for status.diff's own separately-declared empty locales array", async () => {
    const result = await dispatchRpc(
      body({ method: "status.diff", params: { locales: [] } }),
      deps(),
      {},
    );

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "PARAMS_INVALID" } });
    const error = parsed.error as { issues: readonly { path: string[]; code: string }[] };
    expect(error.issues).toEqual([{ path: ["locales"], code: "too_small" }]);
  });

  it("answers 200 ok:true with the handler's result on success", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => ({
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "anthropic" },
        configSource: "override",
        glossary: { source: "none" },
        capabilities: { spend: false, writeToDisk: true },
        exposeAgentTools: false,
      }),
    });

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: true, result: { sourceLocale: "en" } });
  });

  it("maps a handler throw shaped like an SdkError to 200 ok:false with its code and redacted message", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => {
        throw new FakeDomainError(
          "SdkError",
          "CONFIG_NOT_FOUND",
          "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z leaked",
        );
      },
    });

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "CONFIG_NOT_FOUND" } });
    expect(result.body).not.toContain("sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z");
    expect(result.body).toContain("[REDACTED]");
  });

  it("maps a handler throw shaped like an AdapterError to 200 ok:false with its code", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => {
        throw new FakeDomainError("AdapterError", "INVALID_JSON", "the file is not valid JSON");
      },
    });

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "INVALID_JSON" } });
  });

  it("maps a real SdkError thrown by a handler to 200 ok:false with its own code and message", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => {
        throw new SdkError("CONFIG_NOT_FOUND", "No verbatra configuration found.");
      },
    });

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toEqual({
      ok: false,
      error: { code: "CONFIG_NOT_FOUND", message: "No verbatra configuration found." },
    });
  });

  it("maps a real AdapterError thrown by a handler to 200 ok:false with its own code and message", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => {
        throw new AdapterError("INVALID_JSON", "the file is not parseable JSON.");
      },
    });

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toEqual({
      ok: false,
      error: { code: "INVALID_JSON", message: "the file is not parseable JSON." },
    });
  });

  it("names a file inside the project by its project-relative path in a domain error", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => {
        throw new SdkError(
          "SOURCE_UNREADABLE",
          "The source locale file was not found at /project/locales/en.json.",
        );
      },
    });

    expect(await parseBody(result)).toEqual({
      ok: false,
      error: {
        code: "SOURCE_UNREADABLE",
        message: "The source locale file was not found at locales/en.json.",
      },
    });
  });

  it("maps any other handler throw to a constant 500 INTERNAL body with no path substring", async () => {
    const result = await dispatchRpc(body({ method: "project.snapshot", params: {} }), deps(), {
      "project.snapshot": async () => {
        throw new Error(
          "ENOENT: no such file or directory, open '/Users/someone/secret/verbatra.config.ts'",
        );
      },
    });

    expect(result.statusCode).toBe(500);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(result.body).not.toContain("/Users/someone/secret");
    expect(result.body).not.toContain("ENOENT");
  });

  it("logs the redacted cause of a 500 INTERNAL as one studio error line", async () => {
    const key = `sk-${"a".repeat(40)}`;
    const lines: string[] = [];
    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      { ...deps(), log: (line) => lines.push(line) },
      {
        "project.snapshot": async () => {
          throw new Error(`EIO: read failed\n\u001b[31mforged ${key}\u2028line`);
        },
      },
    );

    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain("EIO");
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toMatch(/^studio error: project\.snapshot failed: EIO: read failed /);
    expect(line).not.toContain(key);
    expect(line).toContain("[REDACTED]");
    expect(line).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
  });

  it("logs a thrown non-Error value as text", async () => {
    const lines: string[] = [];
    await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      { ...deps(), log: (line) => lines.push(line) },
      {
        "project.snapshot": async () => {
          throw "plain failure";
        },
      },
    );

    expect(lines).toEqual(["studio error: project.snapshot failed: plain failure"]);
  });

  it("logs nothing for a domain error, which the envelope already carries", async () => {
    const lines: string[] = [];
    await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      { ...deps(), log: (line) => lines.push(line) },
      {
        "project.snapshot": async () => {
          throw new SdkError("CONFIG_INVALID", "bad config");
        },
      },
    );

    expect(lines).toEqual([]);
  });

  it("dispatches through a real capability-built registry, not only a stubbed one", async () => {
    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      deps(),
      createRpcHandlers({ spend: false, writeToDisk: true }),
    );

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: true });
  });

  it("answers 429 METHOD_RATE_LIMITED once the limiter trips, without ever invoking the handler", async () => {
    let calls = 0;
    const limiter: RpcRateLimiter = {
      tryAcquire: () => false,
      exceedsWindow: () => false,
      retryAfterMs: () => 41_200,
    };

    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "greeting" } }),
      deps(),
      {
        "translation.retranslateEntry": async () => {
          calls += 1;
          return { accepted: true, value: "x", reviewReasons: [] };
        },
      },
      limiter,
    );

    expect(result.statusCode).toBe(429);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({
      ok: false,
      error: {
        code: "METHOD_RATE_LIMITED",
        message: "Too many calls to this method; wait before retrying.",
        retryAfterSeconds: 42,
      },
    });
    expect(result.retryAfterSeconds).toBe(42);
    expect(calls).toBe(0);
  });

  it("answers 429 METHOD_RATE_LIMITED for translation.editEntry specifically, without ever invoking its handler or reaching the sdk seam or disk", async () => {
    let calls = 0;
    const limiter: RpcRateLimiter = {
      tryAcquire: () => false,
      exceedsWindow: () => false,
      retryAfterMs: () => 0,
    };

    const result = await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "greeting", value: "Hallo" },
      }),
      deps(),
      {
        "translation.editEntry": async () => {
          calls += 1;
          return { accepted: true, value: "Hallo" };
        },
      },
      limiter,
    );

    expect(result.statusCode).toBe(429);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "METHOD_RATE_LIMITED" } });
    expect(calls).toBe(0);
  });

  it("does not rate-limit a method the limiter has no rule for", async () => {
    const limiter = createRpcRateLimiter({
      "translation.retranslateEntry": { windowMs: 1000, maxCalls: 0 },
    });

    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      deps(),
      {
        "project.snapshot": async () => ({
          sourceLocale: "en",
          targetLocales: ["de"],
          format: "i18next-json",
          files: { pattern: "locales/{locale}.json" },
          provider: { id: "anthropic" },
          configSource: "override",
          glossary: { source: "none" },
          capabilities: { spend: false, writeToDisk: true },
          exposeAgentTools: false,
        }),
      },
      limiter,
    );

    expect(result.statusCode).toBe(200);
  });

  it("checks the rate limit only after method resolution, so an unregistered method still answers METHOD_UNKNOWN", async () => {
    let acquireCalls = 0;
    const limiter: RpcRateLimiter = {
      tryAcquire: (): boolean => {
        acquireCalls += 1;
        return false;
      },
      exceedsWindow: () => false,
      retryAfterMs: () => 0,
    };

    const result = await dispatchRpc(
      body({ method: "status.check", params: {} }),
      deps(),
      {},
      limiter,
    );

    expect(result.statusCode).toBe(400);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "METHOD_UNKNOWN" } });
    expect(acquireCalls).toBe(0);
  });

  it("answers 409 ALREADY_IN_PROGRESS once the in-flight guard rejects the call, without ever invoking the handler", async () => {
    let calls = 0;
    const guard: RpcInFlightGuard = {
      tryEnter: () => false,
      leave: () => {},
      entries: () => [],
    };

    const result = await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      deps(),
      {
        "translation.translatePending": async () => {
          calls += 1;
          return { dryRun: false, locales: [], succeeded: [], partial: [], failed: [] };
        },
      },
      undefined,
      guard,
    );

    expect(result.statusCode).toBe(409);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "ALREADY_IN_PROGRESS" } });
    expect(calls).toBe(0);
  });

  it("does not guard a method the in-flight guard has no rule for", async () => {
    const guard = createRpcInFlightGuard(new Set(["translation.translatePending"]));
    guard.tryEnter("translation.translatePending");

    const result = await dispatchRpc(
      body({ method: "project.snapshot", params: {} }),
      deps(),
      {
        "project.snapshot": async () => ({
          sourceLocale: "en",
          targetLocales: ["de"],
          format: "i18next-json",
          files: { pattern: "locales/{locale}.json" },
          provider: { id: "anthropic" },
          configSource: "override",
          glossary: { source: "none" },
          capabilities: { spend: false, writeToDisk: true },
          exposeAgentTools: false,
        }),
      },
      undefined,
      guard,
    );

    expect(result.statusCode).toBe(200);
  });

  it("calls leave exactly once after the handler settles, whether it succeeds or throws", async () => {
    const enterCalls: string[] = [];
    const leaveCalls: string[] = [];
    const guard = {
      tryEnter: (method: string): boolean => {
        enterCalls.push(method);
        return true;
      },
      leave: (method: string): void => {
        leaveCalls.push(method);
      },
      entries: () => [],
    };

    await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      deps(),
      {
        "translation.translatePending": async () => ({
          dryRun: false,
          locales: [],
          succeeded: [],
          partial: [],
          failed: [],
        }),
      },
      undefined,
      guard,
    );
    await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      deps(),
      {
        "translation.translatePending": async () => {
          throw new SdkError("PROVIDER_CONSTRUCTION_FAILED", "boom");
        },
      },
      undefined,
      guard,
    );

    expect(enterCalls).toEqual(["translation.translatePending", "translation.translatePending"]);
    expect(leaveCalls).toEqual(["translation.translatePending", "translation.translatePending"]);
  });

  it("records the entries of a running single or batch retranslation on the guard, and forgets them once it settles", async () => {
    const guard = createRpcInFlightGuard(
      new Set(["translation.retranslateEntry", "translation.retranslateEntries"]),
    );
    let seenDuringSingle: readonly string[] = [];
    let seenDuringBatch: readonly string[] = [];
    await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "a" } }),
      deps(),
      {
        "translation.retranslateEntry": async () => {
          seenDuringSingle = guard.entries().map((entry) => `${entry.locale}:${entry.key}`);
          return { accepted: true, value: "A", reviewReasons: [] };
        },
      },
      undefined,
      guard,
    );
    await dispatchRpc(
      body({
        method: "translation.retranslateEntries",
        params: {
          entries: [
            { locale: "fr", key: "b" },
            { locale: "fr", key: "c" },
          ],
        },
      }),
      deps(),
      {
        "translation.retranslateEntries": async () => {
          seenDuringBatch = guard.entries().map((entry) => `${entry.locale}:${entry.key}`);
          return { results: [] };
        },
      },
      undefined,
      guard,
    );

    expect(seenDuringSingle).toEqual(["de:a"]);
    expect(seenDuringBatch).toEqual(["fr:b", "fr:c"]);
    expect(guard.entries()).toEqual([]);
  });

  it("passes a locale/key dedupe key to the guard for translation.retranslateEntry, so two different keys never collide on the same lock", async () => {
    const enterKeys: (string | undefined)[] = [];
    const guard = {
      tryEnter: (_method: string, key?: string): boolean => {
        enterKeys.push(key);
        return true;
      },
      leave: (): void => {},
      entries: () => [],
    };

    await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "greeting" } }),
      deps(),
      {
        "translation.retranslateEntry": async () => ({
          accepted: true,
          value: "Hallo",
          reviewReasons: [],
        }),
      },
      undefined,
      guard,
    );
    await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "farewell" } }),
      deps(),
      {
        "translation.retranslateEntry": async () => ({
          accepted: true,
          value: "Tschuess",
          reviewReasons: [],
        }),
      },
      undefined,
      guard,
    );

    expect(enterKeys).toHaveLength(2);
    expect(enterKeys[0]).toBeDefined();
    expect(enterKeys[0]).not.toBe(enterKeys[1]);
  });

  it("passes a locale/key dedupe key to the guard for translation.editEntry, so two different keys never collide on the same lock", async () => {
    const enterKeys: (string | undefined)[] = [];
    const guard = {
      tryEnter: (_method: string, key?: string): boolean => {
        enterKeys.push(key);
        return true;
      },
      leave: (): void => {},
      entries: () => [],
    };

    await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "greeting", value: "Hallo" },
      }),
      deps(),
      {
        "translation.editEntry": async () => ({ accepted: true, value: "Hallo" }),
      },
      undefined,
      guard,
    );
    await dispatchRpc(
      body({
        method: "translation.editEntry",
        params: { locale: "de", key: "farewell", value: "Tschuess" },
      }),
      deps(),
      {
        "translation.editEntry": async () => ({ accepted: true, value: "Tschuess" }),
      },
      undefined,
      guard,
    );

    expect(enterKeys).toHaveLength(2);
    expect(enterKeys[0]).toBeDefined();
    expect(enterKeys[0]).not.toBe(enterKeys[1]);
  });

  it("passes no dedupe key for translation.translatePending, whose params carry no locale or key", async () => {
    const enterKeys: (string | undefined)[] = [];
    const guard = {
      tryEnter: (_method: string, key?: string): boolean => {
        enterKeys.push(key);
        return true;
      },
      leave: (): void => {},
      entries: () => [],
    };

    await dispatchRpc(
      body({ method: "translation.translatePending", params: {} }),
      deps(),
      {
        "translation.translatePending": async () => ({
          dryRun: false,
          locales: [],
          succeeded: [],
          partial: [],
          failed: [],
        }),
      },
      undefined,
      guard,
    );

    expect(enterKeys).toEqual([undefined]);
  });

  it("refuses a second translation.translatePending for a different locale subset while one is in flight", async () => {
    const guard = createRpcInFlightGuard(new Set(["translation.translatePending"]));
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seenLocales: (readonly string[] | undefined)[] = [];
    const handlers: HandlersRegistry = {
      "translation.translatePending": async (params) => {
        seenLocales.push(params.locales);
        await held;
        return { dryRun: false, locales: [], succeeded: [], partial: [], failed: [] };
      },
    };

    const first = dispatchRpc(
      body({ method: "translation.translatePending", params: { locales: ["de"] } }),
      deps(),
      handlers,
      undefined,
      guard,
    );
    while (seenLocales.length === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const second = await dispatchRpc(
      body({ method: "translation.translatePending", params: { locales: ["fr"] } }),
      deps(),
      handlers,
      undefined,
      guard,
    );

    expect(second.statusCode).toBe(409);
    expect(await parseBody(second)).toMatchObject({
      ok: false,
      error: { code: "ALREADY_IN_PROGRESS" },
    });
    release();
    expect((await first).statusCode).toBe(200);
    expect(seenLocales).toEqual([["de"]]);
  });
});

describe("dispatchRpc: batch entry counts reach the rate limiter", () => {
  it("passes a batch's entry count, and 1 for a single-entry call", async () => {
    const seen: [string, number | undefined][] = [];
    const limiter: RpcRateLimiter = {
      tryAcquire: (method: string, entries?: number): boolean => {
        seen.push([method, entries]);
        return true;
      },
      exceedsWindow: () => false,
      retryAfterMs: () => 0,
    };
    const handlers: HandlersRegistry = {
      "translation.retranslateEntries": async () => ({ results: [] }),
      "translation.retranslateEntry": async () => ({
        accepted: true,
        value: "x",
        reviewReasons: [],
      }),
    };

    await dispatchRpc(
      body({
        method: "translation.retranslateEntries",
        params: {
          entries: [
            { locale: "de", key: "a" },
            { locale: "de", key: "b" },
            { locale: "de", key: "c" },
          ],
        },
      }),
      deps(),
      handlers,
      limiter,
    );
    await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "a" } }),
      deps(),
      handlers,
      limiter,
    );

    expect(seen).toEqual([
      ["translation.retranslateEntries", 3],
      ["translation.retranslateEntry", 1],
    ]);
  });

  it("refuses a batch retranslation that would overrun the single-retranslate budget", async () => {
    const limiter = createRpcRateLimiter(
      {
        "translation.retranslateEntry": { windowMs: 60_000, maxCalls: 2 },
        "translation.retranslateEntries": {
          windowMs: 60_000,
          maxCalls: 2,
          bucket: "translation.retranslateEntry",
          perEntry: true,
        },
      },
      () => 0,
    );
    let calls = 0;
    const handlers: HandlersRegistry = {
      "translation.retranslateEntries": async () => {
        calls += 1;
        return { results: [] };
      },
    };

    const result = await dispatchRpc(
      body({
        method: "translation.retranslateEntries",
        params: {
          entries: [
            { locale: "de", key: "a" },
            { locale: "de", key: "b" },
            { locale: "de", key: "c" },
          ],
        },
      }),
      deps(),
      handlers,
      limiter,
    );

    expect(result.statusCode).toBe(429);
    expect(await parseBody(result)).toMatchObject({
      ok: false,
      error: {
        code: "BATCH_TOO_LARGE",
        message:
          "This batch has more entries than this method allows in one rate-limit window; send fewer entries.",
      },
    });
    expect((await parseBody(result)).error).not.toHaveProperty("retryAfterSeconds");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(calls).toBe(0);
  });
});

describe("dispatchRpc: the order of the in-flight guard and the rate limiter", () => {
  it("does not charge the rate limiter for a call the in-flight guard refuses", async () => {
    let charged = 0;
    const limiter: RpcRateLimiter = {
      tryAcquire: () => {
        charged += 1;
        return true;
      },
      exceedsWindow: () => false,
      retryAfterMs: () => 0,
    };
    const guard: RpcInFlightGuard = { tryEnter: () => false, leave: () => {}, entries: () => [] };

    const result = await dispatchRpc(
      body({ method: "translation.retranslateEntry", params: { locale: "de", key: "a" } }),
      deps(),
      {
        "translation.retranslateEntry": async () => ({
          accepted: true,
          value: "x",
          reviewReasons: [],
        }),
      },
      limiter,
      guard,
    );

    expect(result.statusCode).toBe(409);
    expect(charged).toBe(0);
  });

  it("frees the in-flight slot of a call the rate limiter refuses", async () => {
    const guard = createRpcInFlightGuard(new Set(["translation.retranslateEntry"]));
    let allow = false;
    const limiter: RpcRateLimiter = {
      tryAcquire: () => allow,
      exceedsWindow: () => false,
      retryAfterMs: () => 0,
    };
    const handlers: HandlersRegistry = {
      "translation.retranslateEntry": async () => ({
        accepted: true,
        value: "x",
        reviewReasons: [],
      }),
    };
    const call = () =>
      dispatchRpc(
        body({ method: "translation.retranslateEntry", params: { locale: "de", key: "a" } }),
        deps(),
        handlers,
        limiter,
        guard,
      );

    expect((await call()).statusCode).toBe(429);
    allow = true;
    expect((await call()).statusCode).toBe(200);
  });

  it("counts a batch entry named twice only once", async () => {
    const seen: (number | undefined)[] = [];
    const limiter: RpcRateLimiter = {
      tryAcquire: (_method, entries) => {
        seen.push(entries);
        return true;
      },
      exceedsWindow: () => false,
      retryAfterMs: () => 0,
    };

    await dispatchRpc(
      body({
        method: "translation.retranslateEntries",
        params: {
          entries: [
            { locale: "de", key: "a" },
            { locale: "de", key: "a" },
            { locale: "fr", key: "a" },
          ],
        },
      }),
      deps(),
      { "translation.retranslateEntries": async () => ({ results: [] }) },
      limiter,
    );

    expect(seen).toEqual([2]);
  });
});

describe("dispatchRpc: a single retranslation against a running batch", () => {
  it("answers 409 for a key the running batch holds, and lets another key through", async () => {
    const guard = createRpcInFlightGuard(
      new Set(["translation.retranslateEntry", "translation.retranslateEntries"]),
      Date.now,
      new Set(["translation.retranslateEntry", "translation.retranslateEntries"]),
    );
    let finishBatch: () => void = () => undefined;
    const batchRunning = new Promise<void>((res) => {
      finishBatch = res;
    });
    let singles = 0;
    const handlers: HandlersRegistry = {
      "translation.retranslateEntries": async () => {
        await batchRunning;
        return { results: [] };
      },
      "translation.retranslateEntry": async () => {
        singles += 1;
        return { accepted: true, value: "x", reviewReasons: [] };
      },
    };
    const single = (key: string) =>
      dispatchRpc(
        body({ method: "translation.retranslateEntry", params: { locale: "de", key } }),
        deps(),
        handlers,
        undefined,
        guard,
      );

    const batch = dispatchRpc(
      body({
        method: "translation.retranslateEntries",
        params: { entries: [{ locale: "de", key: "a" }] },
      }),
      deps(),
      handlers,
      undefined,
      guard,
    );
    const clash = await single("a");
    const other = await single("b");
    finishBatch();
    await batch;

    expect(clash.statusCode).toBe(409);
    expect(await parseBody(clash)).toMatchObject({ error: { code: "ALREADY_IN_PROGRESS" } });
    expect(other.statusCode).toBe(200);
    expect(singles).toBe(1);
    expect((await single("a")).statusCode).toBe(200);
  });
});
