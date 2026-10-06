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
 * Resolves the project directory the MCP server starts from, always as an absolute path. An
 * explicit `cwd` always wins, and a relative one is resolved against `process.cwd()`. Without one,
 * the `CLAUDE_PROJECT_DIR` environment variable, which Claude Code sets to the project root when it
 * spawns a stdio server, is used when it names an existing directory. Otherwise it falls back to
 * `process.cwd()`. The config search starts here; when it finds a config, possibly in a parent
 * directory, the tools resolve the locale, lock, and glossary paths from that config file's
 * directory, so a server started in a subdirectory still works on the project's own files.
 *
 * @param cwd - The explicit project directory, such as a `--cwd` flag value.
 * @param env - The environment to read `CLAUDE_PROJECT_DIR` from. Defaults to `process.env`.
 * @returns The directory the config search starts from, and the base for a relative `configPath`.
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
