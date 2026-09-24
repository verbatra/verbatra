import process from "node:process";
import {
  check,
  diff,
  doctor,
  exportTmx,
  exportWorkbook,
  extract,
  generateTypes,
  importTmx,
  importWorkbook,
  loadConfig,
  loadConfigWithMeta,
  pseudolocalize,
  releaseHeldLocks,
  translate,
  watch,
} from "@verbatra/sdk";
import { run } from "./run.js";
import { createLineSettler } from "./spinner.js";

const stderr = createLineSettler((text) => {
  process.stderr.write(text);
});

function exitAfterReleasingLocks(code: number): void {
  stderr.settle();
  void releaseHeldLocks().finally(() => process.exit(code));
}

const code = await run(
  process.argv.slice(2),
  {
    loadConfig,
    translate,
    watch,
    exportWorkbook,
    importWorkbook,
    check,
    diff,
    doctor,
    loadConfigWithMeta,
    pseudolocalize,
    importStudio: () => import("@verbatra/studio"),
    importMcp: () => import("@verbatra/mcp"),
    extract,
    generateTypes,
    importTmx,
    exportTmx,
  },
  {
    out: (text) => {
      process.stdout.write(text);
    },
    err: stderr.write,
  },
  {
    onLockingCommand: () => {
      process.once("SIGINT", () => exitAfterReleasingLocks(130));
      process.once("SIGTERM", () => exitAfterReleasingLocks(143));
    },
    onWatchSession: (session) => {
      process.on("SIGINT", () => session.requestStop());
      process.on("SIGTERM", () => session.requestStop());
    },
    onStudioSession: (session) => {
      process.on("SIGINT", () => session.requestStop());
      process.on("SIGTERM", () => session.requestStop());
    },
    onMcpSession: (session) => {
      process.on("SIGINT", () => session.requestStop());
      process.on("SIGTERM", () => session.requestStop());
    },
  },
  {
    env: process.env,
    stdinIsTty: process.stdin.isTTY === true,
    stderrIsTty: process.stderr.isTTY === true,
  },
);

await releaseHeldLocks();
stderr.settle();
process.exit(code);
