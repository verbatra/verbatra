import {
  type LoadedConfig,
  loadConfigWithMeta,
  redact,
  SdkError,
  type SdkFs,
  type ValueMarker,
} from "@verbatra/sdk";
import {
  configFilesStamp,
  type FingerprintInput,
  glossaryFileStamp,
} from "./project-fingerprint.js";
import { resolveConfigSource } from "./tools/config-projection.js";
import { describeErrorMessage } from "./tools/define-tool.js";

export type McpProjectState =
  | { readonly kind: "configured"; readonly loaded: LoadedConfig }
  | { readonly kind: "unconfigured"; readonly error: unknown };

export interface McpProjectSession {
  current(): Promise<McpProjectState>;
  latest(): McpProjectState;
}

export interface OpenProjectSessionOptions {
  readonly cwd: string;
  readonly configPath?: string;
  readonly fs?: SdkFs;
  readonly onLog?: (line: string) => void;
  readonly valueMarker?: ValueMarker;
}

interface Snapshot {
  readonly state: McpProjectState;
  readonly configStamp: string;
  readonly glossaryStamp: string;
}

export const UNCONFIGURED_LOG_PREFIX = "Running without a usable project config:";

function isMissingExplicitConfig(error: unknown, configPath: string | undefined): boolean {
  return configPath !== undefined && error instanceof SdkError && error.code === "CONFIG_NOT_FOUND";
}

async function loadState(options: OpenProjectSessionOptions): Promise<McpProjectState> {
  try {
    const loaded = await loadConfigWithMeta({
      cwd: options.cwd,
      fresh: true,
      ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
      ...(options.fs !== undefined ? { fs: options.fs } : {}),
    });
    return { kind: "configured", loaded };
  } catch (error) {
    return { kind: "unconfigured", error };
  }
}

function stateLine(state: McpProjectState, cwd: string, marker: ValueMarker | undefined): string {
  if (state.kind === "unconfigured") {
    return `${UNCONFIGURED_LOG_PREFIX} ${redact(describeErrorMessage(state.error, cwd, marker))}`;
  }
  return `Loaded the project config from ${resolveConfigSource(state.loaded.source, cwd)}`;
}

export async function openProjectSession(
  options: OpenProjectSessionOptions,
): Promise<McpProjectSession> {
  const stampInput: FingerprintInput = options;

  async function takeSnapshot(): Promise<Snapshot> {
    const configStamp = await configFilesStamp(stampInput);
    const state = await loadState(options);
    const glossaryStamp =
      state.kind === "configured" ? await glossaryFileStamp(state.loaded, options.fs) : "";
    return { state, configStamp, glossaryStamp };
  }

  async function isStale(snapshot: Snapshot): Promise<boolean> {
    if (snapshot.state.kind === "unconfigured") {
      return true;
    }
    if ((await configFilesStamp(stampInput)) !== snapshot.configStamp) {
      return true;
    }
    return (await glossaryFileStamp(snapshot.state.loaded, options.fs)) !== snapshot.glossaryStamp;
  }

  let snapshot = await takeSnapshot();
  if (
    snapshot.state.kind === "unconfigured" &&
    isMissingExplicitConfig(snapshot.state.error, options.configPath)
  ) {
    throw snapshot.state.error;
  }
  let lastLine = stateLine(snapshot.state, options.cwd, options.valueMarker);
  if (snapshot.state.kind === "unconfigured") {
    options.onLog?.(lastLine);
  }

  async function refresh(): Promise<McpProjectState> {
    if (!(await isStale(snapshot))) {
      return snapshot.state;
    }
    snapshot = await takeSnapshot();
    const line = stateLine(snapshot.state, options.cwd, options.valueMarker);
    if (line !== lastLine || snapshot.state.kind === "configured") {
      options.onLog?.(line);
    }
    lastLine = line;
    return snapshot.state;
  }

  let pending: Promise<McpProjectState> | undefined;
  return {
    latest: () => snapshot.state,
    current() {
      pending ??= refresh().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}
