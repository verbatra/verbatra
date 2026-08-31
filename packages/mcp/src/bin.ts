import process from "node:process";
import { redact, SdkError } from "@verbatra/sdk";
import { startMcpServer } from "./index.js";

const ALLOW_SPEND_ENV_VAR = "VERBATRA_MCP_ALLOW_SPEND";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnvValueTruthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

interface BinOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly allowSpend: boolean;
}

function requireFlagValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

export function parseArgs(argv: readonly string[]): BinOptions {
  let cwd: string | undefined;
  let configPath: string | undefined;
  let allowSpend = isEnvValueTruthy(process.env[ALLOW_SPEND_ENV_VAR]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") {
      cwd = requireFlagValue(argv, index, "--cwd");
      index += 1;
    } else if (arg === "--config") {
      configPath = requireFlagValue(argv, index, "--config");
      index += 1;
    } else if (arg === "--allow-spend") {
      allowSpend = true;
    }
  }

  return {
    ...(cwd !== undefined ? { cwd } : {}),
    ...(configPath !== undefined ? { configPath } : {}),
    allowSpend,
  };
}

function logToStderr(line: string): void {
  process.stderr.write(`${redact(line)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const handle = await startMcpServer({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
    allowSpend: options.allowSpend,
    onLog: logToStderr,
  });

  const shutdown = (): void => {
    void handle.close();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  if (error instanceof SdkError) {
    logToStderr(`${error.code}: ${error.message}`);
  } else if (error instanceof Error) {
    logToStderr(error.message);
  } else {
    logToStderr(String(error));
  }
  process.exitCode = 1;
});
