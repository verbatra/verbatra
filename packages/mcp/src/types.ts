import type { CheckDeps, CreateProvider, LoadedConfig, SdkFs } from "@verbatra/sdk";

/** What every MCP tool call runs against: the loaded project and the injected SDK seams. */
export interface McpToolContext {
  /** The project config, loaded once at startup and reused by every tool call. */
  readonly config: LoadedConfig;
  /** The project root every tool resolves locale, lock, and glossary paths against. */
  readonly cwd: string;
  /** File-system port handed to the SDK calls. Defaults to the real file system. */
  readonly fs?: SdkFs;
  /** Format-adapter registry handed to the SDK calls. Defaults to the built-in registry. */
  readonly adapterRegistry?: NonNullable<CheckDeps["adapterRegistry"]>;
  /** Builds the provider for the provider-spending tools. Defaults to the configured provider. */
  readonly createProvider?: CreateProvider;
}

export interface McpServerOptions {
  readonly config: LoadedConfig;
  readonly cwd: string;
  readonly allowSpend?: boolean;
  readonly fs?: McpToolContext["fs"];
  readonly adapterRegistry?: McpToolContext["adapterRegistry"];
  readonly createProvider?: CreateProvider;
  readonly onLog?: (line: string) => void;
}
