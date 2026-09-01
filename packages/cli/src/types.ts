import type { McpServerHandle, StartMcpServerOptions } from "@verbatra/mcp";
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
import type { StoppableSession } from "./stoppable-session.js";

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

export interface McpModule {
  startMcpServer(options: StartMcpServerOptions): Promise<McpServerHandle>;
}

export type Session = StoppableSession;

export interface RunHooks {
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
  readonly yes?: boolean;
  readonly force?: boolean;
}
