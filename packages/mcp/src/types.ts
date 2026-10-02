import type {
  CheckDeps,
  CreateProvider,
  GitExecFile,
  LoadedConfig,
  ProgressListener,
  SdkFs,
  ValueMarker,
} from "@verbatra/sdk";
import type { McpProjectSession } from "./project-session.js";

/** What every MCP tool call runs against: the loaded project and the injected SDK seams. */
export interface McpToolContext {
  /** The project config as it was when the call started; a later reload never changes it mid-call. */
  readonly config: LoadedConfig;
  /** The project root every tool resolves locale, lock, and glossary paths against. */
  readonly cwd: string;
  /** File-system port handed to the SDK calls. Defaults to the real file system. */
  readonly fs?: SdkFs;
  /** Format-adapter registry handed to the SDK calls. Defaults to the built-in registry. */
  readonly adapterRegistry?: NonNullable<CheckDeps["adapterRegistry"]>;
  /** Builds the provider for the provider-spending tools. Defaults to the configured provider. */
  readonly createProvider?: CreateProvider;
  /** Runs git for history.list. Defaults to a real `child_process.execFile`. */
  readonly execFile?: GitExecFile;
  /** Present when the server redacts translation values: every value in a result is replaced by its marker. */
  readonly valueMarker?: ValueMarker;
}

export interface McpCallScope {
  readonly onProgress?: ProgressListener;
}

export type McpToolCallContext = McpToolContext & McpCallScope;

export interface McpUnconfiguredContext extends Omit<McpToolContext, "config"> {
  readonly configError: unknown;
}

export interface McpServerOptions {
  readonly project: McpProjectSession;
  readonly cwd: string;
  readonly allowSpend?: boolean;
  readonly valueMarker?: ValueMarker;
  readonly fs?: McpToolContext["fs"];
  readonly adapterRegistry?: McpToolContext["adapterRegistry"];
  readonly createProvider?: CreateProvider;
  readonly onLog?: (line: string) => void;
}
