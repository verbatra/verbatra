import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROVIDER_ENV, ProviderError } from "@verbatra/ai-providers";
import { AdapterError } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProvider, type ProviderConfig } from "./config/provider-config.js";
import { apiKeyHint, errorHint, sdkErrorHint } from "./error-hints.js";
import { SdkError, type SdkErrorCode } from "./errors.js";
import { selectProvider } from "./selection/select-provider.js";

function unionMembers(relativePath: string, typeName: string): readonly string[] {
  const source = readFileSync(resolve(import.meta.dirname, relativePath), "utf8");
  const union = new RegExp(`export type ${typeName} =([\\s\\S]*?);`).exec(source)?.[1];
  if (union === undefined) {
    throw new Error(`${typeName} could not be located in ${relativePath}`);
  }
  return [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1] ?? "");
}

const SDK_CODES = unionMembers("errors.ts", "SdkErrorCode") as readonly SdkErrorCode[];
const PROVIDER_CODES = unionMembers("../../ai-providers/src/errors.ts", "ProviderErrorCode");
const ADAPTER_CODES = unionMembers("../../format-adapters/src/errors.ts", "AdapterErrorCode");

const KEY_SENTINEL = "sk-hint-sentinel-7b1e9d3f5a2c4e6b8d0f";
const CUSTOM_ENV_VAR = "ACME_TRANSLATE_TOKEN";

afterEach(() => {
  vi.unstubAllEnvs();
});

function constructionFailure(config: ProviderConfig): SdkError {
  try {
    selectProvider(config, buildProvider);
  } catch (error) {
    if (error instanceof SdkError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the provider construction to fail");
}

function expectSentence(hint: string | undefined): void {
  expect(hint).toMatch(/^[A-Z].*\.$/);
}

describe("errorHint: every known code has a hint", () => {
  it("reads non-trivial code unions, so the loops below cannot pass vacuously", () => {
    expect(SDK_CODES.length).toBeGreaterThanOrEqual(40);
    expect(SDK_CODES).toContain("CONFIG_NOT_FOUND");
    expect(PROVIDER_CODES).toContain("MISSING_API_KEY");
    expect(ADAPTER_CODES).toContain("INVALID_JSON");
  });

  it.each(SDK_CODES)("gives the SdkError code %s a one-sentence hint", (code) => {
    const hint = errorHint(new SdkError(code, "message"));

    expectSentence(hint);
    expect(sdkErrorHint(code)).toBe(hint);
  });

  it.each(PROVIDER_CODES)("gives the ProviderError code %s a one-sentence hint", (code) => {
    expectSentence(errorHint({ code }));
  });

  it.each(ADAPTER_CODES)("gives the AdapterError code %s a one-sentence hint", (code) => {
    expectSentence(errorHint({ code }));
  });
});

describe("errorHint: how the error is read", () => {
  it("matches a plain coded object the same as the error it came from", () => {
    const error = new AdapterError("INVALID_YAML", "bad");

    expect(errorHint({ code: error.code, message: error.message })).toBe(errorHint(error));
  });

  it("has no hint for an unknown code, an uncoded error, or a non-object", () => {
    expect(errorHint({ code: "WATCH_RUN_FAILED" })).toBeUndefined();
    expect(errorHint({ code: "toString" })).toBeUndefined();
    expect(errorHint({ code: 42 })).toBeUndefined();
    expect(errorHint(new Error("plain"))).toBeUndefined();
    expect(errorHint("CONFIG_INVALID")).toBeUndefined();
    expect(errorHint(null)).toBeUndefined();
  });

  it("names the exact variable for a missing key", () => {
    const error = new ProviderError("MISSING_API_KEY", "unset", { envVar: "GEMINI_API_KEY" });

    expect(errorHint(error)).toBe(apiKeyHint("GEMINI_API_KEY"));
    expect(errorHint(error)).toContain("Set GEMINI_API_KEY");
  });

  it("falls back to the generic key hint when the missing key names no variable", () => {
    expect(errorHint(new ProviderError("MISSING_API_KEY", "unset"))).toBe(
      errorHint({ code: "MISSING_API_KEY" }),
    );
  });

  it("takes the wrapped provider error's hint for a failed construction", () => {
    const cause = new ProviderError("AUTH_FAILED", "denied");
    const wrapped = new SdkError("PROVIDER_CONSTRUCTION_FAILED", "failed", { cause });

    expect(errorHint(wrapped)).toBe(errorHint(cause));
  });

  it("keeps the construction hint when the cause carries no known code", () => {
    const wrapped = new SdkError("PROVIDER_CONSTRUCTION_FAILED", "failed", {
      cause: new Error("custom factory broke"),
    });

    expect(errorHint(wrapped)).toBe(sdkErrorHint("PROVIDER_CONSTRUCTION_FAILED"));
  });
});

describe("errorHint: a config that fails to load", () => {
  function loadFailure(cause?: unknown): SdkError {
    return new SdkError("CONFIG_INVALID", "Failed to load the verbatra configuration.", {
      cause,
    });
  }

  it.each([
    "MODULE_NOT_FOUND",
    "ERR_MODULE_NOT_FOUND",
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
    "ERR_UNSUPPORTED_DIR_IMPORT",
  ])("points at the unresolved import when the cause is %s", (code) => {
    const hint = errorHint(loadFailure(Object.assign(new Error("not found"), { code })));

    expectSentence(hint);
    expect(hint).toContain("the config file imports");
    expect(hint).not.toBe(sdkErrorHint("CONFIG_INVALID"));
  });

  it("keeps the config-field hint for any other cause, or none", () => {
    const other = Object.assign(new Error("denied"), { code: "EACCES" });

    expect(errorHint(loadFailure(other))).toBe(sdkErrorHint("CONFIG_INVALID"));
    expect(errorHint(loadFailure())).toBe(sdkErrorHint("CONFIG_INVALID"));
  });
});

describe("errorHint: a hint never contains a key value", () => {
  it("names the variable of a real missing-key failure, never a value of another set key", () => {
    for (const name of Object.values(PROVIDER_ENV)) {
      vi.stubEnv(name, KEY_SENTINEL);
    }
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);

    const error = constructionFailure({
      id: "anthropic",
      options: { model: "claude-test", maxTokens: 1024 },
    });

    expect(errorHint(error)).toBe(apiKeyHint("ANTHROPIC_API_KEY"));
    expect(errorHint(error)).not.toContain(KEY_SENTINEL);
  });

  it("names a custom variable through a failed provider construction", () => {
    vi.stubEnv("OPENAI_API_KEY", KEY_SENTINEL);
    vi.stubEnv("OPENAI_COMPATIBLE_API_KEY", KEY_SENTINEL);
    vi.stubEnv(CUSTOM_ENV_VAR, undefined);

    const thrown = constructionFailure({
      id: "openai-compatible",
      options: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "local-model",
        maxOutputTokens: 256,
        apiKeyEnvVar: CUSTOM_ENV_VAR,
      },
    });

    const hint = errorHint(thrown);
    expect(hint).toBe(apiKeyHint(CUSTOM_ENV_VAR));
    expect(`${hint} ${(thrown as Error).message}`).not.toContain(KEY_SENTINEL);
  });

  it("carries no key value for any code while every key variable holds the sentinel", () => {
    for (const name of [...Object.values(PROVIDER_ENV), CUSTOM_ENV_VAR]) {
      vi.stubEnv(name, KEY_SENTINEL);
    }
    const hints = [...SDK_CODES, ...PROVIDER_CODES, ...ADAPTER_CODES].map((code) =>
      errorHint({ code, message: KEY_SENTINEL }),
    );

    expect(hints.join("\n")).not.toContain(KEY_SENTINEL);
  });
});
