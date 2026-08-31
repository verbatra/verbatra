import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import type { LoadedConfig, SdkFs, VerbatraConfig } from "@verbatra/sdk";
import type { McpToolContext } from "./types.js";

export const defaultAdapterRegistry = createDefaultRegistry() as unknown as NonNullable<
  McpToolContext["adapterRegistry"]
>;

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export const nodeFs: SdkFs = {
  fileExists: pathExists,
  async readFileBounded(path, maxBytes) {
    let buf: Buffer;
    try {
      buf = await readFile(path);
    } catch {
      return { kind: "missing" };
    }
    if (buf.byteLength > maxBytes) {
      return { kind: "too-large" };
    }
    return { kind: "ok", content: buf.toString("utf8") };
  },
  async readBytesBounded(path, maxBytes) {
    let buf: Buffer;
    try {
      buf = await readFile(path);
    } catch {
      return { kind: "missing" };
    }
    if (buf.byteLength > maxBytes) {
      return { kind: "too-large" };
    }
    return { kind: "ok", bytes: new Uint8Array(buf) };
  },
  async writeFile(path, data) {
    await writeFile(path, data, "utf8");
  },
  async writeBytes(path, data) {
    await writeFile(path, data);
  },
  async createExclusive(path, data) {
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, data, { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw error;
    }
  },
  async deleteFile(path) {
    await rm(path, { force: true });
  },
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
};

export function baseVerbatraConfig(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "test-model", maxTokens: 256 } },
    ...overrides,
  };
}

export function baseLoadedConfig(overrides: Partial<LoadedConfig> = {}): LoadedConfig {
  return {
    config: baseVerbatraConfig(),
    source: { kind: "override" },
    glossary: { source: "none" },
    ...overrides,
  };
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-mcp-"));
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function makeProject(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined> = {},
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
    }
  }
  return dir;
}

export interface FsCallCounts {
  readonly fileExists: number;
  readonly readFileBounded: number;
}

export interface TrackedFs {
  readonly fs: SdkFs;
  readonly counts: FsCallCounts;
}

export function trackFsCalls(base: SdkFs = nodeFs): TrackedFs {
  const counts: { fileExists: number; readFileBounded: number } = {
    fileExists: 0,
    readFileBounded: 0,
  };
  const fs: SdkFs = {
    ...base,
    async fileExists(path) {
      counts.fileExists += 1;
      return base.fileExists(path);
    },
    async readFileBounded(path, maxBytes) {
      counts.readFileBounded += 1;
      return base.readFileBounded(path, maxBytes);
    },
  };
  return { fs, counts };
}

export interface TrackedAdapterRegistry {
  readonly adapterRegistry: NonNullable<McpToolContext["adapterRegistry"]>;
  readonly counts: { resolveCalls: number };
}

export function trackAdapterRegistryCalls(
  base: NonNullable<McpToolContext["adapterRegistry"]> = defaultAdapterRegistry,
): TrackedAdapterRegistry {
  const counts = { resolveCalls: 0 };
  const adapterRegistry = {
    resolve(filePath: string, options?: Parameters<typeof base.resolve>[1]) {
      counts.resolveCalls += 1;
      return base.resolve(filePath, options);
    },
  } as unknown as NonNullable<McpToolContext["adapterRegistry"]>;
  return { adapterRegistry, counts };
}

export function makeContext(overrides: Partial<McpToolContext> = {}): McpToolContext {
  return {
    config: baseLoadedConfig(),
    cwd: process.cwd(),
    ...overrides,
  };
}

export interface StubProviderOptions {
  readonly translate?: (value: string, key: string, targetLocale: string) => string;
  readonly error?: Error;
}

export function makeStubProvider(options: StubProviderOptions = {}): TranslationProvider {
  const translate = options.translate ?? ((value, _key, locale) => `[${locale}] ${value}`);
  return {
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    async translateBatch(request: TranslateRequest): Promise<TranslateResult> {
      if (options.error !== undefined) {
        throw options.error;
      }
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        values.set(entry.key, translate(entry.value, entry.key, request.targetLocale));
        integrity.set(entry.key, { matches: true, missing: [], extra: [], reordered: false });
      }
      return { values, integrity, notices: [] };
    },
  };
}
