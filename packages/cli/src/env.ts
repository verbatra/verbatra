import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { searchedConfigDir } from "./config-presence.js";

function applyIfUnset(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
  return parseEnv(content) as Record<string, string>;
}

export function loadEnvFilesIn(cwd: string): void {
  applyIfUnset(parseEnvFile(resolve(cwd, ".env.local")));
  applyIfUnset(parseEnvFile(resolve(cwd, ".env")));
}

export function loadEnvFiles(cwd: string, configPath?: string): void {
  loadEnvFilesIn(cwd);
  if (configPath !== undefined) {
    return;
  }
  const root = searchedConfigDir(cwd);
  if (root !== undefined && root !== resolve(cwd)) {
    loadEnvFilesIn(root);
  }
}
