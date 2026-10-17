import type {
  CreateProvider,
  CreateProviderHooks,
  PlaceholderIntegrityResult,
  TranslateRequest,
  TranslateResult,
} from "@verbatra/sdk";
import type { CliDeps } from "./cli.ts";
import type { RunRequest } from "./run.ts";
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SOURCE } from "./source.ts";

export interface StubOptions {
  readonly transform?: (value: string, locale: string) => string;
  readonly beforeReply?: (hooks: CreateProviderHooks | undefined, call: number) => void;
  readonly failBatch?: (request: TranslateRequest) => Error | undefined;
}

export interface StubProvider {
  readonly createProvider: CreateProvider;
  readonly sent: TranslateRequest[];
  readonly constructed: () => number;
}

const INTACT: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function isAborted(request: TranslateRequest): boolean {
  return request.signal?.aborted === true;
}

function abortError(): DOMException {
  return new DOMException("This operation was aborted.", "AbortError");
}

export function defaultTransform(value: string, locale: string): string {
  return `${locale.toUpperCase()}: ${value}`;
}

function reply(request: TranslateRequest, transform: StubOptions["transform"]): TranslateResult {
  const values = new Map<string, string>();
  const integrity = new Map<string, PlaceholderIntegrityResult>();
  for (const entry of request.entries) {
    const translated = (transform ?? defaultTransform)(entry.value, request.targetLocale);
    values.set(entry.key, translated);
    integrity.set(entry.key, request.comparePlaceholders?.(entry.value, translated) ?? INTACT);
  }
  return { values, integrity };
}

export function createStubProvider(options: StubOptions = {}): StubProvider {
  const sent: TranslateRequest[] = [];
  let constructed = 0;
  const createProvider: CreateProvider = (_config, _context, hooks) => {
    constructed += 1;
    return {
      id: "gemini",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: async (request) => {
        if (isAborted(request)) {
          throw abortError();
        }
        sent.push(request);
        options.beforeReply?.(hooks, sent.length);
        if (isAborted(request)) {
          throw abortError();
        }
        const failure = options.failBatch?.(request);
        if (failure !== undefined) {
          throw failure;
        }
        return reply(request, options.transform);
      },
    };
  };
  return { createProvider, sent, constructed: () => constructed };
}

export interface CapturedCli {
  readonly deps: CliDeps;
  readonly stdout: string[];
  readonly stderr: string[];
  readonly written: string[];
}

export function cliHarness(overrides: Partial<CliDeps> = {}): CapturedCli {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const written: string[] = [];
  const deps: CliDeps = {
    argv: [],
    env: {},
    isTTY: true,
    insideContainer: false,
    items: PLAYGROUND_SOURCE,
    languages: PLAYGROUND_LANGUAGES,
    sdkVersion: "0.0.0-test",
    outputLabel: "lib/playground/translations.json",
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    out: (line) => stdout.push(line),
    err: (line) => stderr.push(line),
    readExisting: async () => undefined,
    writeOutput: async (data) => {
      written.push(data);
    },
    ...overrides,
  };
  return { deps, stdout, stderr, written };
}

export function stubbedRequest(stub: StubOptions = {}, overrides: Partial<RunRequest> = {}) {
  const provider = createStubProvider(stub);
  const runRequest: RunRequest = {
    items: PLAYGROUND_SOURCE,
    languages: PLAYGROUND_LANGUAGES,
    existing: undefined,
    sdkVersion: "0.0.0-test",
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    createProvider: provider.createProvider,
    ...overrides,
  };
  return { provider, runRequest };
}
