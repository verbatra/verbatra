import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ProviderNotice,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
  Usage,
} from "@verbatra/ai-providers";
import { checkPlaceholders, type PlaceholderIntegrityResult } from "@verbatra/core";
import type { VerbatraConfig } from "./config/schema.js";
import { type BoundedBytesRead, type BoundedFileRead, defaultFs, type SdkFs } from "./fs.js";

export interface StubCall {
  readonly request: TranslateRequest;
}

export interface StubOptions {
  readonly id?: string;
  readonly kind?: "llm" | "machine-translation";
  readonly translate?: (value: string, key: string, targetLocale: string) => string;
  readonly failIntegrity?: ReadonlySet<string>;
  readonly missingValues?: ReadonlySet<string>;
  readonly notices?: readonly ProviderNotice[];
  readonly throwForLocales?: ReadonlySet<string>;
  readonly error?: Error;
  readonly usage?: Usage;
}

export interface StubProvider {
  readonly provider: TranslationProvider;
  readonly calls: StubCall[];
}

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};
const FAIL: PlaceholderIntegrityResult = {
  matches: false,
  missing: ["{x}"],
  extra: [],
  reordered: false,
};

function defaultTranslate(value: string, _key: string, locale: string): string {
  return `[${locale}] ${value}`;
}

const INTEGRITY_FAIL_MARKER = " {{__stub_integrity_fail__}}";

function foldStubEntry(
  entry: { readonly key: string; readonly value: string },
  targetLocale: string,
  translate: (value: string, key: string, locale: string) => string,
  options: StubOptions,
  values: Map<string, string>,
  integrity: Map<string, PlaceholderIntegrityResult>,
): void {
  if (options.missingValues?.has(entry.key) === true) {
    return;
  }
  const shouldFail = options.failIntegrity?.has(entry.key) === true;
  const translated = translate(entry.value, entry.key, targetLocale);
  values.set(entry.key, shouldFail ? `${translated}${INTEGRITY_FAIL_MARKER}` : translated);
  integrity.set(entry.key, shouldFail ? FAIL : PASS);
}

export function makeStubProvider(options: StubOptions = {}): StubProvider {
  const calls: StubCall[] = [];
  const translate = options.translate ?? defaultTranslate;
  const provider: TranslationProvider = {
    id: options.id ?? "stub",
    kind: options.kind ?? "llm",
    supportsGlossary: true,
    translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
      calls.push({ request });
      if (options.throwForLocales?.has(request.targetLocale) === true) {
        throw options.error ?? new Error("stub provider failure");
      }
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        foldStubEntry(entry, request.targetLocale, translate, options, values, integrity);
      }
      const result: TranslateResult = {
        values,
        integrity,
        ...(options.notices !== undefined ? { notices: options.notices } : {}),
        ...(options.usage !== undefined ? { usage: options.usage } : {}),
      };
      return result;
    },
  };
  return { provider, calls };
}

export function makeIntegrityProvider(
  produce: (value: string, key: string) => string,
): TranslationProvider {
  return {
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        const value = produce(entry.value, entry.key);
        values.set(entry.key, value);
        integrity.set(
          entry.key,
          checkPlaceholders(
            request.extractPlaceholders(entry.value),
            request.extractPlaceholders(value),
          ),
        );
      }
      return { values, integrity };
    },
  };
}

export function declaredMembers(declaration: string): readonly string[] {
  const body = /export interface VerbatraMessages \{\n([\s\S]*?)\n\}/.exec(declaration);
  if (body?.[1] === undefined) {
    throw new Error(
      "the declaration carries no multi-member VerbatraMessages interface to read members from",
    );
  }
  return body[1].split("\n");
}

export function baseConfig(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "test-model", maxTokens: 256 } },
    ...overrides,
  };
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-sdk-"));
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export function realDiskReads(): Pick<
  SdkFs,
  "fileExists" | "readFileBounded" | "readBytesBounded"
> {
  return {
    fileExists: (path: string): Promise<boolean> => defaultFs.fileExists(path),
    readFileBounded: (path: string, maxBytes: number): Promise<BoundedFileRead> =>
      defaultFs.readFileBounded(path, maxBytes),
    readBytesBounded: (path: string, maxBytes: number): Promise<BoundedBytesRead> =>
      defaultFs.readBytesBounded(path, maxBytes),
  };
}

export function makeFakeFs(overrides: Partial<SdkFs> = {}): SdkFs {
  return {
    fileExists: async (): Promise<boolean> => false,
    readFileBounded: async (): Promise<BoundedFileRead> => ({ kind: "missing" }),
    readBytesBounded: async (): Promise<BoundedBytesRead> => ({ kind: "missing" }),
    writeFile: async (): Promise<void> => {},
    writeBytes: async (): Promise<void> => {},
    createExclusive: async (): Promise<boolean> => true,
    deleteFile: async (): Promise<void> => {},
    ...overrides,
  };
}
