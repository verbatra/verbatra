import process from "node:process";
import {
  check,
  diff,
  doctor,
  exportWorkbook,
  extract,
  generateTypes,
  importWorkbook,
  loadConfig,
  loadConfigWithMeta,
  pseudolocalize,
  translate,
  watch,
} from "@verbatra/sdk";
import { run } from "./run.js";

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
  },
  {
    out: (text) => {
      process.stdout.write(text);
    },
    err: (text) => {
      process.stderr.write(text);
    },
  },
  {
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
);

process.exit(code);
