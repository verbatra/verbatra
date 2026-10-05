import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type {
  LocaleGlossary,
  ProviderNotice,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
  Usage,
} from "@verbatra/ai-providers";
import { checkPlaceholders, type PlaceholderIntegrityResult } from "@verbatra/core";
import { type GlossaryInput, glossaryForLocale } from "./config/glossary.js";
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

function withExclusiveFiles(fs: SdkFs): SdkFs {
  const created = new Map<string, string>();
  return {
    ...fs,
    readFileBounded: async (path, maxBytes): Promise<BoundedFileRead> => {
      const content = created.get(path);
      return content !== undefined ? { kind: "ok", content } : fs.readFileBounded(path, maxBytes);
    },
    createExclusive: async (path, data): Promise<boolean> => {
      if (created.has(path)) {
        return false;
      }
      created.set(path, data);
      return true;
    },
    deleteFile: async (path): Promise<void> => {
      created.delete(path);
      await fs.deleteFile(path);
    },
  };
}

export function makeFakeFs(overrides: Partial<SdkFs> = {}): SdkFs {
  const fs: SdkFs = {
    fileExists: async (): Promise<boolean> => false,
    readFileBounded: async (): Promise<BoundedFileRead> => ({ kind: "missing" }),
    readBytesBounded: async (): Promise<BoundedBytesRead> => ({ kind: "missing" }),
    writeFile: async (): Promise<void> => {},
    writeBytes: async (): Promise<void> => {},
    createExclusive: async (): Promise<boolean> => true,
    deleteFile: async (): Promise<void> => {},
    ...overrides,
  };
  return overrides.createExclusive === undefined ? withExclusiveFiles(fs) : fs;
}

export function localeGlossaryOf(glossary: GlossaryInput, locale = "de"): LocaleGlossary {
  const resolved = glossaryForLocale(glossary, locale);
  if (resolved === undefined) {
    throw new Error(`the glossary has nothing for ${locale}`);
  }
  return resolved;
}

export interface MemoryFile {
  content: string;
  mtime: number;
}

export interface MemoryLockFsHooks {
  readonly beforeRename?: (from: string, to: string) => Promise<void> | void;
  readonly afterRename?: (from: string, to: string) => Promise<void> | void;
}

export interface MemoryLockFs {
  readonly fs: SdkFs;
  readonly files: Map<string, MemoryFile>;
  readonly renames: [string, string][];
  readonly deleted: string[];
  readonly touched: string[];
  put(path: string, content: string, mtime?: number): void;
  content(path: string): string | undefined;
}

function missingFile(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`no such file: ${path}`), { code: "ENOENT" });
}

export function memoryLockFs(
  hooks: MemoryLockFsHooks = {},
  overrides: Partial<SdkFs> = {},
): MemoryLockFs {
  const files = new Map<string, MemoryFile>();
  const renames: [string, string][] = [];
  const deleted: string[] = [];
  const touched: string[] = [];
  const put = (path: string, content: string, mtime = Date.now()): void => {
    files.set(path, { content, mtime });
  };
  const fs: SdkFs = {
    fileExists: async (path) => files.has(path),
    readFileBounded: async (path): Promise<BoundedFileRead> => {
      const file = files.get(path);
      return file === undefined ? { kind: "missing" } : { kind: "ok", content: file.content };
    },
    readBytesBounded: async (): Promise<BoundedBytesRead> => ({ kind: "missing" }),
    writeFile: async (path, data) => {
      put(path, data);
    },
    writeBytes: async () => {},
    createExclusive: async (path, data) => {
      if (files.has(path)) {
        return false;
      }
      put(path, data);
      return true;
    },
    deleteFile: async (path) => {
      deleted.push(path);
      files.delete(path);
    },
    rename: async (from, to) => {
      await hooks.beforeRename?.(from, to);
      const file = files.get(from);
      if (file === undefined) {
        throw missingFile(from);
      }
      files.delete(from);
      files.set(to, file);
      renames.push([from, to]);
      await hooks.afterRename?.(from, to);
    },
    touch: async (path) => {
      const file = files.get(path);
      if (file === undefined) {
        throw missingFile(path);
      }
      file.mtime = Date.now();
      touched.push(path);
    },
    mtimeMs: async (path) => files.get(path)?.mtime,
    readDirectory: async (directory) =>
      [...files.keys()]
        .filter((path) => dirname(path) === directory)
        .map((path) => ({ name: basename(path), kind: "file" as const })),
    ...overrides,
  };
  return {
    fs,
    files,
    renames,
    deleted,
    touched,
    put,
    content: (path) => files.get(path)?.content,
  };
}

export interface CatToolEdit {
  readonly target?: string;
  readonly state?: string;
  readonly dropHash?: boolean;
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unitBlock(xml: string, key: string): { readonly start: number; readonly block: string } {
  const name = escapeForPattern(key);
  const pattern = xml.includes('version="2.0"')
    ? new RegExp(`<unit id="u\\d+" name="${name}">[\\s\\S]*?</unit>`)
    : new RegExp(`<trans-unit id="${name}"[^>]*>[\\s\\S]*?</trans-unit>`);
  const match = pattern.exec(xml);
  if (match === null) {
    throw new Error(`no unit for ${key}`);
  }
  return { start: match.index, block: match[0] };
}

export function xliffSourceInner(xml: string, key: string): string {
  const { block } = unitBlock(xml, key);
  return /<source>([\s\S]*?)<\/source>/.exec(block)?.[1] ?? "";
}

function editXliff2Unit(block: string, edit: CatToolEdit): string {
  let next = block.replace(/<unit id="(u\d+)" name="([^"]*)">/, '<unit name="$2" id="$1">');
  if (edit.dropHash === true) {
    next = next.replace(/\s*<mda:metadata>[\s\S]*?<\/mda:metadata>/, "");
  }
  if (edit.target !== undefined) {
    next = next
      .replace(/\s*<target>[\s\S]*?<\/target>/, "")
      .replace("</segment>", `  <target>${edit.target}</target>\n      </segment>`);
  }
  if (edit.state !== undefined) {
    next = next.replace(/<segment state="[^"]*">/, `<segment state="${edit.state}">`);
  }
  return next;
}

function editXliff12Unit(block: string, edit: CatToolEdit): string {
  let next = block.replace(/<trans-unit ([^>]*)>/, (_whole, attributes: string) => {
    const kept = attributes
      .split(/ (?=[\w:-]+=")/)
      .filter((attribute) => edit.dropHash !== true || !attribute.startsWith("extradata="));
    return `<trans-unit ${kept.reverse().join(" ")}>`;
  });
  if (edit.target !== undefined) {
    const state = edit.state ?? /<target state="([^"]*)"/.exec(next)?.[1] ?? "translated";
    next = next
      .replace(/\s*<target[^>]*>[\s\S]*?<\/target>/, "")
      .replace("</source>", `</source>\n        <target state="${state}">${edit.target}</target>`);
  } else if (edit.state !== undefined) {
    next = next.replace(/<target state="[^"]*"/, `<target state="${edit.state}"`);
  }
  return next;
}

export function editXliffUnit(xml: string, key: string, edit: CatToolEdit): string {
  const { start, block } = unitBlock(xml, key);
  const edited = xml.includes('version="2.0"')
    ? editXliff2Unit(block, edit)
    : editXliff12Unit(block, edit);
  return `${xml.slice(0, start)}${edited}${xml.slice(start + block.length)}`;
}

export interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

export function deferred(): Deferred {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
