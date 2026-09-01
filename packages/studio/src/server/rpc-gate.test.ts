import { AdapterError } from "@verbatra/format-adapters";
import { SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { createRpcInFlightGuard } from "./in-flight-guard.js";
import { createRpcRateLimiter } from "./rate-limiter.js";
import { createRpcHandlers, type RpcHandlerDeps } from "./rpc.js";
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
        throw new FakeDomainError("SdkError", "CONFIG_NOT_FOUND", "sk-abcd1234efgh5678 leaked");
      },
    });

    expect(result.statusCode).toBe(200);
    const parsed = await parseBody(result);
    expect(parsed).toMatchObject({ ok: false, error: { code: "CONFIG_NOT_FOUND" } });
    expect(result.body).not.toContain("sk-abcd1234efgh5678");
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
    const limiter: { tryAcquire: (method: string) => boolean } = {
      tryAcquire: () => false,
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
      },
    });
    expect(calls).toBe(0);
  });

  it("answers 429 METHOD_RATE_LIMITED for translation.editEntry specifically, without ever invoking its handler or reaching the sdk seam or disk", async () => {
    let calls = 0;
    const limiter: { tryAcquire: (method: string) => boolean } = {
      tryAcquire: () => false,
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
    const limiter = {
      tryAcquire: (): boolean => {
        acquireCalls += 1;
        return false;
      },
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
    const guard: { tryEnter: (method: string) => boolean; leave: (method: string) => void } = {
      tryEnter: () => false,
      leave: () => {},
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

  it("passes a locale/key dedupe key to the guard for translation.retranslateEntry, so two different keys never collide on the same lock", async () => {
    const enterKeys: (string | undefined)[] = [];
    const guard = {
      tryEnter: (_method: string, key?: string): boolean => {
        enterKeys.push(key);
        return true;
      },
      leave: (): void => {},
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
});
