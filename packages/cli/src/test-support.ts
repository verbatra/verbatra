import type {
  CheckInput,
  CheckSummary,
  ConfigSource,
  DiffInput,
  DiffSummary,
  DoctorInput,
  DoctorResult,
  ExportWorkbookInput,
  ExportWorkbookResult,
  ImportWorkbookInput,
  LoadConfigOptions,
  LoadedConfig,
  LocaleSummary,
  RunSummary,
  TranslateInput,
  VerbatraConfig,
  WatchController,
  WatchInput,
} from "@verbatra/sdk";
import { DEFAULT_STUDIO_PORT } from "@verbatra/studio";
import type { CliDeps, McpModule, Streams, StudioModule } from "./types.js";

export function makeConfig(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return {
    sourceLocale: "en",
    targetLocales: ["de"],
    format: "i18next-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model: "test-model", maxTokens: 256 } },
    ...overrides,
  };
}

export function makeLocale(overrides: Partial<LocaleSummary> = {}): LocaleSummary {
  return {
    locale: "de",
    status: "succeeded",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    integrityMismatches: [],
    providerFailures: [],
    budgetWithheld: [],
    generated: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    malformedRows: [],
    duplicateKeys: [],
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return { dryRun: false, locales: [], succeeded: [], partial: [], failed: [], ...overrides };
}

export function makeExportResult(
  overrides: Partial<ExportWorkbookResult> = {},
): ExportWorkbookResult {
  return { path: "/proj/verbatra-translations.xlsx", locales: [], ...overrides };
}

export function makeCheckSummary(overrides: Partial<CheckSummary> = {}): CheckSummary {
  return { inSync: true, locales: [], ...overrides };
}

export function makeDiffSummary(overrides: Partial<DiffSummary> = {}): DiffSummary {
  return { hasPendingChanges: false, locales: [], ...overrides };
}

export function makeDoctorResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    ok: true,
    checks: [
      {
        id: "config",
        title: "Configuration",
        status: "pass",
        detail: "Loaded /proj/verbatra.config.ts.",
      },
    ],
    ...overrides,
  };
}

export function makeLoadedConfig(overrides: Partial<LoadedConfig> = {}): LoadedConfig {
  return {
    config: makeConfig(),
    source: { kind: "search", filepath: "/proj/verbatra.config.ts" } satisfies ConfigSource,
    glossary: { source: "none" },
    ...overrides,
  };
}

export function makeStudioModule(overrides: Partial<StudioModule> = {}): StudioModule {
  return {
    startStudioServer: async (options) => ({
      url: `http://127.0.0.1:${options.port ?? DEFAULT_STUDIO_PORT}/`,
      port: options.port ?? DEFAULT_STUDIO_PORT,
      close: async () => {},
    }),
    ...overrides,
  };
}

export function makeMcpModule(overrides: Partial<McpModule> = {}): McpModule {
  return {
    startMcpServer: async () => ({ close: async () => {} }),
    ...overrides,
  };
}

export function captureStreams(): { streams: Streams; out: () => string; err: () => string } {
  let outBuf = "";
  let errBuf = "";
  return {
    streams: {
      out: (text) => {
        outBuf += text;
      },
      err: (text) => {
        errBuf += text;
      },
    },
    out: () => outBuf,
    err: () => errBuf,
  };
}

export interface ParsedEnvelope {
  readonly ok: boolean;
  readonly version: number;
  readonly command: string | null;
  readonly result?: unknown;
  readonly code?: string;
  readonly message?: string;
}

export function parseEnvelope(line: string): ParsedEnvelope {
  return JSON.parse(line.trim()) as ParsedEnvelope;
}

export interface DepCalls {
  loadConfig: LoadConfigOptions[];
  translate: TranslateInput[];
  watch: WatchInput[];
  exportWorkbook: ExportWorkbookInput[];
  importWorkbook: ImportWorkbookInput[];
  check: CheckInput[];
  diff: DiffInput[];
  doctor: DoctorInput[];
  loadConfigWithMeta: LoadConfigOptions[];
  importStudio: undefined[];
  importMcp: undefined[];
}

export function recordingDeps(impl: Partial<CliDeps> = {}): { deps: CliDeps; calls: DepCalls } {
  const calls: DepCalls = {
    loadConfig: [],
    translate: [],
    watch: [],
    exportWorkbook: [],
    importWorkbook: [],
    check: [],
    diff: [],
    doctor: [],
    loadConfigWithMeta: [],
    importStudio: [],
    importMcp: [],
  };
  const deps: CliDeps = {
    loadConfig: async (options) => {
      calls.loadConfig.push(options);
      return impl.loadConfig ? impl.loadConfig(options) : makeConfig();
    },
    translate: async (input) => {
      calls.translate.push(input);
      return impl.translate ? impl.translate(input) : makeSummary();
    },
    watch: async (input) => {
      calls.watch.push(input);
      return impl.watch ? impl.watch(input) : ({ stop: async () => {} } satisfies WatchController);
    },
    exportWorkbook: async (input) => {
      calls.exportWorkbook.push(input);
      return impl.exportWorkbook ? impl.exportWorkbook(input) : makeExportResult();
    },
    importWorkbook: async (input) => {
      calls.importWorkbook.push(input);
      return impl.importWorkbook ? impl.importWorkbook(input) : makeSummary();
    },
    check: async (input) => {
      calls.check.push(input);
      return impl.check ? impl.check(input) : makeCheckSummary();
    },
    diff: async (input) => {
      calls.diff.push(input);
      return impl.diff ? impl.diff(input) : makeDiffSummary();
    },
    doctor: async (input) => {
      calls.doctor.push(input);
      return impl.doctor ? impl.doctor(input) : makeDoctorResult();
    },
    loadConfigWithMeta: async (options) => {
      calls.loadConfigWithMeta.push(options);
      return impl.loadConfigWithMeta ? impl.loadConfigWithMeta(options) : makeLoadedConfig();
    },
    importStudio: async () => {
      calls.importStudio.push(undefined);
      return impl.importStudio ? impl.importStudio() : makeStudioModule();
    },
    importMcp: async () => {
      calls.importMcp.push(undefined);
      return impl.importMcp ? impl.importMcp() : makeMcpModule();
    },
  };
  return { deps, calls };
}

export async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}
