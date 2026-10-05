import process from "node:process";
import {
  check,
  checkFile,
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
  provenanceReport,
  pseudolocalize,
  releaseHeldLocks,
  translate,
  watch,
} from "@verbatra/sdk";
import { releaseLocksWithin } from "./lock-release.js";
import { type InterruptSignal, renderInterrupted } from "./render.js";
import { run } from "./run.js";
import { createLineSettler } from "./spinner.js";

const stderr = createLineSettler((text) => {
  process.stderr.write(text);
});

const RELEASE_LOCKS_DEADLINE_MS = 5_000;

function exitAfterReleasingLocks(code: number, signal: InterruptSignal, json: boolean): void {
  stderr.settle();
  void releaseLocksWithin(releaseHeldLocks, RELEASE_LOCKS_DEADLINE_MS).then((outcome) => {
    process.stderr.write(`${renderInterrupted(signal, json, outcome)}\n`);
    process.exit(code);
  });
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
    checkFile,
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
    provenanceReport,
  },
  {
    out: (text) => {
      process.stdout.write(text);
    },
    err: stderr.write,
  },
  {
    onLockingCommand: ({ json }) => {
      process.once("SIGINT", () => exitAfterReleasingLocks(130, "SIGINT", json));
      process.once("SIGTERM", () => exitAfterReleasingLocks(143, "SIGTERM", json));
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
    stdoutIsTty: process.stdout.isTTY === true,
  },
);

await releaseHeldLocks();
stderr.settle();
process.exit(code);
