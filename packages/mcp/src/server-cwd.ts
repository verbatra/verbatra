import { statSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_DIR_ENV_VAR = "CLAUDE_PROJECT_DIR";

function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolves the project root the MCP server runs against, always as an absolute path, so error
 * messages can name project files relative to it. An explicit `cwd` always wins, and a relative
 * one is resolved against `process.cwd()`. Without one, the `CLAUDE_PROJECT_DIR` environment
 * variable, which Claude Code sets to the project root when it spawns a stdio server, is used when
 * it names an existing directory, so a session started from a subdirectory still finds the project
 * config. Otherwise it falls back to `process.cwd()`.
 *
 * @param cwd - The explicit project root, such as a `--cwd` flag value.
 * @param env - The environment to read `CLAUDE_PROJECT_DIR` from. Defaults to `process.env`.
 * @returns The directory to resolve the config, locale, lock, and glossary paths from.
 */
export function resolveServerCwd(
  cwd?: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (cwd !== undefined) {
    return resolve(cwd);
  }
  const projectDir = env[PROJECT_DIR_ENV_VAR];
  if (projectDir !== undefined && projectDir.length > 0 && isExistingDirectory(projectDir)) {
    return resolve(projectDir);
  }
  return process.cwd();
}
