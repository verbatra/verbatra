import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdapterRegistry } from "@verbatra/format-adapters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedConfig } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { type DoctorCheck, type DoctorCheckId, type DoctorResult, doctor } from "./doctor.js";

const { providerFactoryCalls } = vi.hoisted(() => ({ providerFactoryCalls: [] as string[] }));

vi.mock("@verbatra/ai-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/ai-providers")>();
  const trap = (name: string) => (): never => {
    providerFactoryCalls.push(name);
    throw new Error(`${name} must never be called by doctor`);
  };
  return {
    ...actual,
    createAnthropicProvider: trap("createAnthropicProvider"),
    createOpenAiProvider: trap("createOpenAiProvider"),
    createGeminiProvider: trap("createGeminiProvider"),
    createDeepLProvider: trap("createDeepLProvider"),
    createOpenAiCompatibleProvider: trap("createOpenAiCompatibleProvider"),
  };
});

const KEY_CANARY = "sk-ant-canary-9f3b7c1d0e2a4b6c8d";

let projectDir: string;

async function writeConfig(config: Record<string, unknown>): Promise<void> {
  await writeFile(join(projectDir, ".verbatrarc.json"), JSON.stringify(config), "utf8");
}

function validConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "claude-test", maxTokens: 1024 } },
    ...overrides,
  };
}

async function writeSourceFile(): Promise<void> {
  await mkdir(join(projectDir, "locales"), { recursive: true });
  await writeFile(join(projectDir, "locales", "en.json"), JSON.stringify({ hi: "Hi" }), "utf8");
}

function checkFor(result: DoctorResult, id: DoctorCheckId): DoctorCheck {
  const found = result.checks.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`no doctor check with id "${id}"`);
  }
  return found;
}

function statusOf(result: DoctorResult, id: DoctorCheckId): string {
  return checkFor(result, id).status;
}

function detailOf(result: DoctorResult, id: DoctorCheckId): string {
  return checkFor(result, id).detail;
}

beforeEach(async () => {
  providerFactoryCalls.length = 0;
  projectDir = await mkdtemp(join(tmpdir(), "verbatra-doctor-"));
  vi.stubEnv("ANTHROPIC_API_KEY", KEY_CANARY);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("doctor: the config check", () => {
  it("reports the config-not-found message naming all three accepted config locations", async () => {
    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "config")).toBe("fail");
    expect(detailOf(result, "config")).toContain("verbatra.config.ts");
    expect(detailOf(result, "config")).toContain(".verbatrarc.json");
    expect(detailOf(result, "config")).toContain("'verbatra' property in package.json");
  });

  it("marks the four config-dependent checks skipped rather than failed when the config is absent", async () => {
    const result = await doctor({ cwd: projectDir });

    expect(result.checks.map((entry) => entry.status)).toEqual([
      "fail",
      "skipped",
      "skipped",
      "skipped",
      "skipped",
    ]);
  });

  it("surfaces the source-locale refinement message verbatim", async () => {
    await writeConfig(validConfig({ targetLocales: ["de", "en"] }));

    const result = await doctor({ cwd: projectDir });

    expect(detailOf(result, "config")).toContain(
      "targetLocales must not include the source locale",
    );
  });

  it("surfaces the case-insensitive duplicate refinement message verbatim", async () => {
    await writeConfig(validConfig({ targetLocales: ["de", "DE"] }));

    const result = await doctor({ cwd: projectDir });

    expect(detailOf(result, "config")).toContain(
      'targetLocales must not contain case-insensitively duplicate locales: "DE"',
    );
  });

  it("appends the environment hint to an unrecognized top-level key", async () => {
    await writeConfig(validConfig({ apiKey: "should-not-live-here" }));

    const result = await doctor({ cwd: projectDir });

    expect(detailOf(result, "config")).toContain("Unrecognized key");
    expect(detailOf(result, "config")).toContain(
      "(API keys are read from the environment, not the config)",
    );
  });

  it("surfaces the files.pattern refinement message verbatim", async () => {
    await writeConfig(validConfig({ files: { pattern: "locales/messages.json" } }));

    const result = await doctor({ cwd: projectDir });

    expect(detailOf(result, "config")).toContain("files.pattern must contain the {locale} token");
  });

  it("names the loaded config file on a pass", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(statusOf(result, "config")).toBe("pass");
    expect(detailOf(result, "config")).toContain(".verbatrarc.json");
  });

  it("reports an in-memory config source without naming a file", async () => {
    const loaded: LoadedConfig = {
      config: validConfig() as unknown as VerbatraConfig,
      source: { kind: "override" },
      glossary: { source: "none" },
    };

    const result = await doctor({ cwd: projectDir }, { loadConfig: async () => loaded });

    expect(detailOf(result, "config")).toBe("Validated the config supplied in memory.");
  });

  it("resolves locale paths against the process working directory when no cwd is given", async () => {
    const loaded: LoadedConfig = {
      config: validConfig() as unknown as VerbatraConfig,
      source: { kind: "override" },
      glossary: { source: "none" },
    };

    const result = await doctor({}, { loadConfig: async () => loaded });

    expect(detailOf(result, "source-file")).toContain(join(process.cwd(), "locales", "en.json"));
  });
});

describe("doctor: explicit --config paths", () => {
  it("throws CONFIG_NOT_FOUND when an explicit config path does not exist", async () => {
    await expect(doctor({ cwd: projectDir, configPath: "nope.json" })).rejects.toMatchObject({
      code: "CONFIG_NOT_FOUND",
    });
    await expect(doctor({ cwd: projectDir, configPath: "nope.json" })).rejects.toBeInstanceOf(
      SdkError,
    );
  });

  it("reports an explicit config that exists but is invalid as a failed check, not a throw", async () => {
    await writeFile(
      join(projectDir, "custom.json"),
      JSON.stringify(validConfig({ targetLocales: ["de", "en"] })),
      "utf8",
    );

    const result = await doctor({ cwd: projectDir, configPath: "custom.json" });

    expect(result.ok).toBe(false);
    expect(detailOf(result, "config")).toContain(
      "targetLocales must not include the source locale",
    );
  });

  it("loads a valid explicit config path", async () => {
    await writeFile(join(projectDir, "custom.json"), JSON.stringify(validConfig()), "utf8");
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir, configPath: "custom.json" });

    expect(result.ok).toBe(true);
    expect(detailOf(result, "config")).toContain("custom.json");
  });
});

describe("doctor: the adapter and provider checks", () => {
  it("passes when the configured format resolves to an adapter", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(statusOf(result, "format-adapter")).toBe("pass");
    expect(detailOf(result, "format-adapter")).toContain("i18next-json");
  });

  it("fails with the supported-format list when the registry has no adapter for the format", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "format-adapter")).toBe("fail");
    expect(detailOf(result, "format-adapter")).toContain("No adapter is registered for format");
    expect(detailOf(result, "format-adapter")).toContain("Supported formats:");
  });

  it("passes when the configured provider ID resolves to a factory", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(statusOf(result, "provider")).toBe("pass");
    expect(detailOf(result, "provider")).toContain("anthropic");
  });

  it("fails when a config carries a provider ID the factory table does not know", async () => {
    const loaded: LoadedConfig = {
      config: validConfig({
        provider: { id: "mistral", options: {} },
      }) as unknown as VerbatraConfig,
      source: { kind: "search", filepath: join(projectDir, ".verbatrarc.json") },
      glossary: { source: "none" },
    };

    const result = await doctor({ cwd: projectDir }, { loadConfig: async () => loaded });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "provider")).toBe("fail");
    expect(detailOf(result, "provider")).toContain(
      'No factory is registered for provider "mistral"',
    );
    expect(detailOf(result, "provider")).toContain("anthropic, openai, gemini, deepl");
  });
});

describe("doctor: the API key check", () => {
  it("passes when the provider's environment variable is set", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(statusOf(result, "api-key")).toBe("pass");
    expect(detailOf(result, "api-key")).toBe("ANTHROPIC_API_KEY is set.");
  });

  it("fails naming the variable when it is unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "api-key")).toBe("fail");
    expect(detailOf(result, "api-key")).toBe(
      "The ANTHROPIC_API_KEY environment variable is not set.",
    );
  });

  it("treats an empty variable as unset, matching what the provider does", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(statusOf(result, "api-key")).toBe("fail");
  });

  it("names the right variable for each hosted provider", async () => {
    const cases = [
      ["openai", "OPENAI_API_KEY", { model: "gpt-test", maxOutputTokens: 1024 }],
      ["gemini", "GEMINI_API_KEY", { model: "gemini-test", maxOutputTokens: 1024 }],
      ["deepl", "DEEPL_API_KEY", {}],
      ["google-translate", "GOOGLE_TRANSLATE_API_KEY", {}],
    ] as const;

    for (const [id, envVar, options] of cases) {
      vi.stubEnv(envVar, undefined);
      await writeConfig(validConfig({ provider: { id, options } }));

      const result = await doctor({ cwd: projectDir });

      expect(detailOf(result, "api-key")).toBe(`The ${envVar} environment variable is not set.`);
    }
  });

  it("does not fail openai-compatible with no key variable set, since it falls back to a placeholder", async () => {
    vi.stubEnv("OPENAI_COMPATIBLE_API_KEY", undefined);
    await writeConfig(
      validConfig({
        provider: {
          id: "openai-compatible",
          options: {
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "llama-test",
            maxOutputTokens: 1024,
          },
        },
      }),
    );

    const result = await doctor({ cwd: projectDir });

    expect(statusOf(result, "api-key")).toBe("pass");
    expect(detailOf(result, "api-key")).toContain("OPENAI_COMPATIBLE_API_KEY");
  });

  it("fails openai-compatible when its own named variable is unset", async () => {
    vi.stubEnv("MY_LOCAL_LLM_KEY", undefined);
    await writeConfig(
      validConfig({
        provider: {
          id: "openai-compatible",
          options: {
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "llama-test",
            maxOutputTokens: 1024,
            apiKeyEnvVar: "MY_LOCAL_LLM_KEY",
          },
        },
      }),
    );

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(detailOf(result, "api-key")).toBe(
      "The MY_LOCAL_LLM_KEY environment variable is not set.",
    );
  });

  it("passes openai-compatible when its own named variable is set", async () => {
    vi.stubEnv("MY_LOCAL_LLM_KEY", "local-secret-value");
    await writeConfig(
      validConfig({
        provider: {
          id: "openai-compatible",
          options: {
            baseUrl: "http://127.0.0.1:11434/v1",
            model: "llama-test",
            maxOutputTokens: 1024,
            apiKeyEnvVar: "MY_LOCAL_LLM_KEY",
          },
        },
      }),
    );

    const result = await doctor({ cwd: projectDir });

    expect(detailOf(result, "api-key")).toBe("MY_LOCAL_LLM_KEY is set.");
  });
});

describe("doctor: the source locale file check", () => {
  it("completes on a valid config whose locale files do not exist, failing only the source check", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(result.checks).toHaveLength(5);
    expect(statusOf(result, "config")).toBe("pass");
    expect(statusOf(result, "format-adapter")).toBe("pass");
    expect(statusOf(result, "provider")).toBe("pass");
    expect(statusOf(result, "api-key")).toBe("pass");
    expect(statusOf(result, "source-file")).toBe("fail");
    expect(detailOf(result, "source-file")).toContain("en.json");
  });

  it("does not fail on a missing target locale file", async () => {
    await writeConfig(validConfig({ targetLocales: ["de", "fr"] }));
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(statusOf(result, "source-file")).toBe("pass");
  });

  it("reports a locale-layout problem on the source-file check instead of throwing", async () => {
    const loaded: LoadedConfig = {
      config: validConfig({
        files: { pattern: "locales/messages-{locale}.json", localeStyle: "android" },
      }) as unknown as VerbatraConfig,
      source: { kind: "search", filepath: join(projectDir, ".verbatrarc.json") },
      glossary: { source: "none" },
    };

    const result = await doctor({ cwd: projectDir }, { loadConfig: async () => loaded });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "source-file")).toBe("fail");
    expect(detailOf(result, "source-file")).toContain("locale style");
  });

  it("fails when a directory sits where the source locale file should be", async () => {
    await writeConfig(validConfig());
    await mkdir(join(projectDir, "locales", "en.json"), { recursive: true });

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "source-file")).toBe("fail");
    expect(detailOf(result, "source-file")).toContain(join(projectDir, "locales", "en.json"));
    expect(detailOf(result, "source-file")).toContain("not a regular file");
  });

  it("fails when the source locale file is empty", async () => {
    await writeConfig(validConfig());
    await mkdir(join(projectDir, "locales"), { recursive: true });
    await writeFile(join(projectDir, "locales", "en.json"), "", "utf8");

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "source-file")).toBe("fail");
    expect(detailOf(result, "source-file")).toContain(join(projectDir, "locales", "en.json"));
  });

  it("fails when the source locale file is not valid JSON", async () => {
    await writeConfig(validConfig());
    await mkdir(join(projectDir, "locales"), { recursive: true });
    await writeFile(join(projectDir, "locales", "en.json"), "{ broken", "utf8");

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(statusOf(result, "source-file")).toBe("fail");
    expect(detailOf(result, "source-file")).toContain("not valid JSON");
  });

  it("reports the key count it read, singular for one key and plural for more", async () => {
    await writeConfig(validConfig());
    await writeSourceFile();

    const one = await doctor({ cwd: projectDir });

    expect(detailOf(one, "source-file")).toContain("(1 translatable key)");

    await writeFile(
      join(projectDir, "locales", "en.json"),
      JSON.stringify({ hi: "Hi", bye: "Bye" }),
      "utf8",
    );

    const two = await doctor({ cwd: projectDir });

    expect(detailOf(two, "source-file")).toContain("(2 translatable keys)");
  });

  it("falls back to an existence check when the format has no adapter to parse with", async () => {
    await writeConfig(validConfig());
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    expect(statusOf(result, "source-file")).toBe("pass");
    expect(detailOf(result, "source-file")).toContain("were not checked");
  });

  it("reads and parses the source file through the injected file-system port", async () => {
    await writeConfig(validConfig());
    const probed: string[] = [];
    const read: string[] = [];

    const result = await doctor(
      { cwd: projectDir },
      {
        fs: {
          fileExists: async (path) => {
            probed.push(path);
            return true;
          },
          readFileBounded: async (path) => {
            read.push(path);
            return { kind: "ok", content: JSON.stringify({ hi: "Hi" }) };
          },
          readBytesBounded: async () => ({ kind: "missing" }),
          writeFile: async () => {},
          writeBytes: async () => {},
          createExclusive: async () => true,
          deleteFile: async () => {},
        },
      },
    );

    expect(statusOf(result, "source-file")).toBe("pass");
    expect(probed).toEqual([join(projectDir, "locales", "en.json")]);
    expect(read).toEqual([join(projectDir, "locales", "en.json")]);
  });

  it("never touches real disk for the parse when a file-system port is supplied", async () => {
    await writeConfig(validConfig());

    const result = await doctor(
      { cwd: projectDir },
      {
        fs: {
          fileExists: async () => true,
          readFileBounded: async () => ({ kind: "ok", content: "{ broken" }),
          readBytesBounded: async () => ({ kind: "missing" }),
          writeFile: async () => {},
          writeBytes: async () => {},
          createExclusive: async () => true,
          deleteFile: async () => {},
        },
      },
    );

    expect(statusOf(result, "source-file")).toBe("fail");
    expect(detailOf(result, "source-file")).toContain("not valid JSON");
  });
});

describe("doctor: it reports every independent problem and spends nothing", () => {
  it("reports a missing key and a missing source file in the same run", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(
      result.checks.filter((entry) => entry.status === "fail").map((entry) => entry.id),
    ).toEqual(["api-key", "source-file"]);
    expect(statusOf(result, "config")).toBe("pass");
    expect(statusOf(result, "provider")).toBe("pass");
  });

  it("reports three independent problems at once: adapter, key, and source file", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    expect(
      result.checks.filter((entry) => entry.status === "fail").map((entry) => entry.id),
    ).toEqual(["format-adapter", "api-key", "source-file"]);
  });

  it("never constructs a provider, so no provider factory is invoked", async () => {
    await writeConfig(validConfig());
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(providerFactoryCalls).toEqual([]);
  });

  it("never lets an API key value reach the result, even as a fragment", async () => {
    await writeConfig(validConfig());
    await writeSourceFile();

    const serialized = JSON.stringify(await doctor({ cwd: projectDir }));

    expect(serialized).not.toContain(KEY_CANARY);
    expect(serialized).not.toContain("canary");
    expect(serialized).not.toContain(KEY_CANARY.slice(0, 8));
    expect(serialized).toContain("ANTHROPIC_API_KEY");
  });

  it("exposes a fully valid project as ok with every check passing", async () => {
    await writeConfig(validConfig());
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(result.checks.every((entry) => entry.status === "pass")).toBe(true);
    expect(result.checks.map((entry) => entry.id)).toEqual([
      "config",
      "format-adapter",
      "provider",
      "api-key",
      "source-file",
    ]);
  });
});
