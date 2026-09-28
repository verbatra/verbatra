import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { AdapterRegistry } from "@verbatra/format-adapters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedConfig } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorHint } from "../error-hints.js";
import { defaultFs } from "../fs.js";
import { type DoctorCheck, type DoctorCheckId, type DoctorResult, doctor } from "./doctor.js";

const KEY_CANARY = "sk-ant-fix-canary-4d2e8a0c6b1f3e5a7c";

let projectDir: string;

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

async function writeConfig(config: Record<string, unknown>): Promise<void> {
  await writeFile(join(projectDir, ".verbatrarc.json"), JSON.stringify(config), "utf8");
}

async function writeProjectFile(relativePath: string, content: string): Promise<void> {
  const path = join(projectDir, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function writeSourceFile(content = JSON.stringify({ hi: "Hi" })): Promise<void> {
  await writeProjectFile("locales/en.json", content);
}

function checkFor(result: DoctorResult, id: DoctorCheckId): DoctorCheck {
  const found = result.checks.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`no doctor check with id "${id}"`);
  }
  return found;
}

function fixOf(result: DoctorResult, id: DoctorCheckId): string | undefined {
  return checkFor(result, id).fix;
}

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "verbatra-doctor-fix-"));
  vi.stubEnv("ANTHROPIC_API_KEY", KEY_CANARY);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("doctor: fix appears only on a failed check", () => {
  it("leaves every check of a clean project without a fix property", async () => {
    await writeConfig(validConfig());
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(result.checks.filter((entry) => "fix" in entry)).toEqual([]);
  });

  it("gives every failed check a fix and no skipped check one", async () => {
    const result = await doctor({ cwd: projectDir });

    for (const entry of result.checks) {
      expect(entry.fix !== undefined).toBe(entry.status === "fail");
    }
  });
});

describe("doctor: the fix of each failing check", () => {
  it("suggests creating a config when none is found", async () => {
    const result = await doctor({ cwd: projectDir });

    expect(fixOf(result, "config")).toBe(errorHint({ code: "CONFIG_NOT_FOUND" }));
    expect(fixOf(result, "config")).toContain("verbatra init");
  });

  it("suggests fixing the config when it fails validation", async () => {
    await writeConfig(validConfig({ targetLocales: ["de", "en"] }));

    const result = await doctor({ cwd: projectDir });

    expect(fixOf(result, "config")).toBe(errorHint({ code: "CONFIG_INVALID" }));
  });

  it("falls back to the check's own fix when a config loader throws an uncoded error", async () => {
    const result = await doctor(
      { cwd: projectDir },
      { loadConfig: () => Promise.reject(new Error("disk on fire")) },
    );

    expect(fixOf(result, "config")).toContain("verbatra init");
  });

  it("names the unresolvable format's hint", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    expect(fixOf(result, "format-adapter")).toBe(errorHint({ code: "UNKNOWN_FORMAT" }));
    expect(fixOf(result, "source-file")).toContain("Create the source locale file");
  });

  it("lists the supported providers for an unknown provider ID", async () => {
    const loaded: LoadedConfig = {
      config: validConfig({
        provider: { id: "mistral", options: {} },
      }) as unknown as VerbatraConfig,
      source: { kind: "search", filepath: join(projectDir, ".verbatrarc.json") },
      glossary: { source: "none" },
    };

    const result = await doctor({ cwd: projectDir }, { loadConfig: async () => loaded });

    expect(fixOf(result, "provider")).toContain("anthropic, openai, gemini, deepl");
  });

  it("names the exact variable to set for a built-in provider", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    await writeConfig(validConfig());
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir });

    expect(fixOf(result, "api-key")).toBe(
      "Set ANTHROPIC_API_KEY in the environment or in a .env file in the project directory.",
    );
  });

  it("names the variable an openai-compatible config chose", async () => {
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

    expect(fixOf(result, "api-key")).toContain("Set MY_LOCAL_LLM_KEY");
  });

  it("suggests permitting the host when the network policy refuses it", async () => {
    await writeConfig(validConfig({ network: { policy: "local-only" } }));
    await writeSourceFile();

    const result = await doctor({ cwd: projectDir });

    expect(checkFor(result, "network-policy").status).toBe("fail");
    expect(fixOf(result, "network-policy")).toContain("network.allowedHosts");
  });

  it("uses the source error's hint for a missing and for a malformed source file", async () => {
    await writeConfig(validConfig());

    const missing = await doctor({ cwd: projectDir });
    await writeSourceFile("{ not json");
    const malformed = await doctor({ cwd: projectDir });

    expect(fixOf(missing, "source-file")).toBe(errorHint({ code: "SOURCE_UNREADABLE" }));
    expect(fixOf(malformed, "source-file")).toBe(errorHint({ code: "SOURCE_INVALID" }));
  });
});

describe("doctor with literals: the fix", () => {
  it("suggests adding an extract block when none is configured", async () => {
    await writeConfig(validConfig());

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(fixOf(result, "untranslated-literals")).toBe(
      errorHint({ code: "EXTRACT_NOT_CONFIGURED" }),
    );
  });

  it("suggests wrapping or suppressing the literals a scan found", async () => {
    await writeConfig(validConfig({ extract: { framework: "i18next", roots: ["src"] } }));
    await writeProjectFile("src/app.tsx", "export const A = () => <p>Hello there, friend</p>;");

    const result = await doctor({ cwd: projectDir, literals: true });

    expect(checkFor(result, "untranslated-literals").status).toBe("fail");
    expect(fixOf(result, "untranslated-literals")).toContain("verbatra-ignore-next-line");
  });

  it("uses the scan error's hint when the file system cannot list directories", async () => {
    await writeConfig(validConfig({ extract: { framework: "i18next", roots: ["src"] } }));
    const { readDirectory: _omitted, ...fs } = defaultFs;

    const result = await doctor({ cwd: projectDir, literals: true }, { fs });

    expect(fixOf(result, "untranslated-literals")).toBe(
      errorHint({ code: "EXTRACT_FS_UNSUPPORTED" }),
    );
  });
});

describe("doctor: a fix never carries a key value", () => {
  it("keeps every configured key value out of the serialized result", async () => {
    for (const name of Object.values(PROVIDER_ENV)) {
      vi.stubEnv(name, KEY_CANARY);
    }
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    await writeConfig(validConfig({ network: { policy: "local-only" } }));

    const result = await doctor({ cwd: projectDir }, { adapterRegistry: new AdapterRegistry() });

    const fixes = result.checks.flatMap((entry) => (entry.fix === undefined ? [] : [entry.fix]));
    expect(fixes.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(result)).not.toContain(KEY_CANARY);
  });
});
