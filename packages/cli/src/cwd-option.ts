import { statSync } from "node:fs";
import { CliUsageError } from "./cli-usage-error.js";

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function assertCwdDirectory(
  cwd: string,
  directoryExists: (path: string) => boolean = isDirectory,
): void {
  if (!directoryExists(cwd)) {
    throw new CliUsageError(
      "INVALID_OPTION",
      `--cwd names ${JSON.stringify(cwd)}, which is not an existing directory. Create it first, or pass the project directory.`,
    );
  }
}
