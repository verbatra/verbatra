import type {
  CheckInput,
  CheckSummary,
  DiffInput,
  DiffSummary,
  DoctorInput,
  DoctorResult,
  ExportWorkbookInput,
  ExportWorkbookResult,
  ImportWorkbookInput,
  LoadConfigOptions,
  LoadedConfig,
  RunSummary,
  TranslateInput,
  VerbatraConfig,
  WatchController,
  WatchInput,
} from "@verbatra/sdk";
import type { StudioServer, StudioServerOptions } from "@verbatra/studio";

export interface Streams {
  out(text: string): void;
  err(text: string): void;
}

export interface CliDeps {
  loadConfig(options: LoadConfigOptions): Promise<VerbatraConfig>;
  translate(input: TranslateInput): Promise<RunSummary>;
  watch(input: WatchInput): Promise<WatchController>;
  exportWorkbook(input: ExportWorkbookInput): Promise<ExportWorkbookResult>;
  importWorkbook(input: ImportWorkbookInput): Promise<RunSummary>;
  check(input: CheckInput): Promise<CheckSummary>;
  diff(input: DiffInput): Promise<DiffSummary>;
  doctor(input: DoctorInput): Promise<DoctorResult>;
  loadConfigWithMeta(options: LoadConfigOptions): Promise<LoadedConfig>;
  importStudio(): Promise<StudioModule>;
  importMcp(): Promise<McpModule>;
}

export interface StudioModule {
  startStudioServer(options: StudioServerOptions): Promise<StudioServer>;
}

export interface McpServerHandle {
  close(): Promise<void>;
}

export interface StartMcpServerOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly allowSpend?: boolean;
  readonly onLog?: (line: string) => void;
}

export interface McpModule {
  startMcpServer(options: StartMcpServerOptions): Promise<McpServerHandle>;
}

export interface WatchSession {
  readonly done: Promise<number>;
  requestStop(): void;
}

export interface StudioSession {
  readonly done: Promise<number>;
  requestStop(): void;
}

export interface McpSession {
  readonly done: Promise<number>;
  requestStop(): void;
}

export interface RunHooks {
  onWatchSession?(session: WatchSession): void;
  onStudioSession?(session: StudioSession): void;
  onMcpSession?(session: McpSession): void;
}

export interface InitOpts {
  readonly cwd?: string;
  readonly provider?: string;
  readonly source?: string;
  readonly targets?: string;
  readonly path?: string;
  readonly yes?: boolean;
  readonly force?: boolean;
}
