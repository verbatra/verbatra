import type { CheckDeps, CreateProvider, LoadedConfig, SdkFs } from "@verbatra/sdk";

export interface McpToolContext {
  readonly config: LoadedConfig;
  readonly cwd: string;
  readonly fs?: SdkFs;
  readonly adapterRegistry?: NonNullable<CheckDeps["adapterRegistry"]>;
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
