import type {
  McpCapabilities,
  McpLaunchArgs,
  McpServerHandle,
  McpSpendState,
  McpStopCause,
  StartMcpServerOptions,
} from "@verbatra/mcp";
import type {
  CheckFileInput,
  CheckFileSummary,
  CheckInput,
  CheckSummary,
  DiffInput,
  DiffSummary,
  DoctorInput,
  DoctorResult,
  ExportTmxInput,
  ExportTmxResult,
  ExportWorkbookInput,
  ExportWorkbookResult,
  ExtractInput,
  ExtractResult,
  GenerateTypesInput,
  GenerateTypesResult,
  ImportTmxInput,
  ImportTmxResult,
  ImportWorkbookInput,
  LoadConfigOptions,
  LoadedConfig,
  ProvenanceReportInput,
  ProvenanceReportResult,
  PseudolocalizeInput,
  PseudolocalizeResult,
  RunSummary,
  TranslateInput,
  WatchController,
  WatchInput,
} from "@verbatra/sdk";
import type { StudioServer, StudioServerOptions } from "@verbatra/studio";
import type { StoppableSession } from "./stoppable-session.js";

export interface Streams {
  out(text: string): void;
  err(text: string): void;
}

export interface CliDeps {
  translate(input: TranslateInput): Promise<RunSummary>;
  watch(input: WatchInput): Promise<WatchController>;
  exportWorkbook(input: ExportWorkbookInput): Promise<ExportWorkbookResult>;
  importWorkbook(input: ImportWorkbookInput): Promise<RunSummary>;
  check(input: CheckInput): Promise<CheckSummary>;
  checkFile(input: CheckFileInput): Promise<CheckFileSummary>;
  diff(input: DiffInput): Promise<DiffSummary>;
  doctor(input: DoctorInput): Promise<DoctorResult>;
  loadConfigWithMeta(options: LoadConfigOptions): Promise<LoadedConfig>;
  pseudolocalize(input: PseudolocalizeInput): Promise<PseudolocalizeResult>;
  importStudio(): Promise<StudioModule>;
  importMcp(): Promise<McpModule>;
  extract(input: ExtractInput): Promise<ExtractResult>;
  generateTypes(input: GenerateTypesInput): Promise<GenerateTypesResult>;
  importTmx(input: ImportTmxInput): Promise<ImportTmxResult>;
  exportTmx(input: ExportTmxInput): Promise<ExportTmxResult>;
  provenanceReport(input: ProvenanceReportInput): Promise<ProvenanceReportResult>;
  isDirectory?(path: string): boolean;
}

export interface StudioModule {
  startStudioServer(options: StudioServerOptions): Promise<StudioServer>;
  isRequestLogLine?(line: string): boolean;
}

export interface McpModule {
  readonly MCP_CAPABILITIES?: Partial<McpCapabilities>;
  startMcpServer(options: StartMcpServerOptions): Promise<McpServerHandle>;
  resolveServerCwd?(cwd?: string): string;
  projectLabel?(cwd: string, base: string): string;
  mcpReadyLine?(project: string, spend: McpSpendState, valuesRedacted?: boolean): string;
  mcpTerminalHint?(launch: McpLaunchArgs): readonly string[];
  mcpUnconfiguredHint?(): readonly string[];
  mcpStoppedLine?(cause: McpStopCause): string;
}

export type Session = StoppableSession;

export interface RunHooks {
  onLockingCommand?(mode: { readonly json: boolean }): void;
  onWatchSession?(session: Session): void;
  onStudioSession?(session: Session): void;
  onMcpSession?(session: Session): void;
}

export interface InitOpts {
  readonly cwd?: string;
  readonly provider?: string;
  readonly source?: string;
  readonly targets?: string;
  readonly path?: string;
  readonly format?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKeyEnvVar?: string;
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly json?: boolean;
  readonly agent?: boolean;
}
