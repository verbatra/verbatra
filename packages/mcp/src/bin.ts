import process from "node:process";
import { redact, releaseHeldLocks, SdkError } from "@verbatra/sdk";
import { BIN_NAME, type BinOptions, BinUsageError, HELP_TEXT, parseArgs } from "./bin-args.js";
import { startMcpServer } from "./index.js";
import { readPackageManifest } from "./package-manifest.js";
import {
  mcpReadyLine,
  mcpStoppedLine,
  mcpTerminalHint,
  mcpUnconfiguredHint,
  projectLabel,
} from "./session-banner.js";
import { createShutdown } from "./shutdown.js";

const STANDALONE_LAUNCH = ["-y", "@verbatra/mcp"] as const;

function logToStderr(line: string): void {
  process.stderr.write(`${redact(line)}\n`);
}

async function main(): Promise<void> {
  const invocation = parseArgs(process.argv.slice(2));
  if (invocation.kind === "help") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (invocation.kind === "version") {
    process.stdout.write(`${readPackageManifest().version}\n`);
    return;
  }
  await serve(invocation.options);
}

async function serve(options: BinOptions): Promise<void> {
  const handle = await startMcpServer({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
    allowSpend: options.allowSpend,
    redactValues: options.redactValues,
    onLog: logToStderr,
  });

  const project = projectLabel(handle.projectRoot, process.cwd());
  logToStderr(mcpReadyLine(project, handle.spend, handle.valuesRedacted));
  if (!handle.configured) {
    for (const line of mcpUnconfiguredHint()) {
      logToStderr(line);
    }
  }
  if (process.stdin.isTTY === true) {
    for (const line of mcpTerminalHint(STANDALONE_LAUNCH)) {
      logToStderr(line);
    }
  }

  const shutdown = createShutdown({
    close: () => handle.close(),
    releaseLocks: releaseHeldLocks,
    exit: (code) => process.exit(code),
    onStopped: (cause) => logToStderr(mcpStoppedLine(cause)),
    startDeadline: (onElapsed, ms) => {
      setTimeout(onElapsed, ms).unref();
    },
  });
  void handle.closed.then(() => shutdown.onClosed());
  process.on("SIGINT", () => shutdown.onSignal("SIGINT"));
  process.on("SIGTERM", () => shutdown.onSignal("SIGTERM"));
}

main().catch((error: unknown) => {
  if (error instanceof BinUsageError) {
    logToStderr(`${BIN_NAME}: error [${error.code}] ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (error instanceof SdkError) {
    logToStderr(`${error.code}: ${error.message}`);
  } else if (error instanceof Error) {
    logToStderr(error.message);
  } else {
    logToStderr(String(error));
  }
  process.exitCode = 1;
});
