import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

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

export function loadEnvFiles(cwd: string): void {
  applyIfUnset(parseEnvFile(resolve(cwd, ".env.local")));
  applyIfUnset(parseEnvFile(resolve(cwd, ".env")));
}

export function loadRootEnvFiles(cwd: string, root: string): void {
  if (resolve(root) !== resolve(cwd)) {
    loadEnvFiles(root);
  }
}
