import { isAbsolute, relative, sep } from "node:path";
import type { LocaleResource } from "@verbatra/core";
import { AdapterError, type FormatAdapter } from "@verbatra/format-adapters";
import { SdkError } from "../errors.js";

const REMEDY_BY_CODE: Readonly<Record<string, string>> = {
  EACCES: "Check the write permissions on the containing directory, then run again.",
  EPERM: "Check the write permissions on the containing directory, then run again.",
  EROFS: "That file system is mounted read-only, so nothing can be written there.",
  ENOSPC: "The device it lives on has no space left.",
  ENOENT: "Check that the containing directory exists and is reachable, then run again.",
  EISDIR: "A directory already exists at that path, so no file can take its place.",
};

const DEFAULT_REMEDY =
  "Check that the containing directory exists and is writable, then run again.";

export function escapesWorkingDirectory(inside: string): boolean {
  return inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
}

function displayPath(targetPath: string, cwd: string): string {
  const relativePath = relative(cwd, targetPath);
  if (escapesWorkingDirectory(relativePath)) {
    return targetPath;
  }
  return relativePath.split(sep).join("/");
}

function fsErrorCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

export function targetUnwritableMessage(targetPath: string, cwd: string, error: unknown): string {
  const code = fsErrorCode(error);
  const remedy = (code === undefined ? undefined : REMEDY_BY_CODE[code]) ?? DEFAULT_REMEDY;
  const detail = code === undefined ? "" : ` (${code})`;
  return `Could not write the locale file ${displayPath(targetPath, cwd)}${detail}. ${remedy}`;
}

export async function writeTargetResource(
  adapter: FormatAdapter,
  resource: LocaleResource,
  targetPath: string,
  cwd: string,
): Promise<void> {
  try {
    await adapter.write(resource, targetPath);
  } catch (error) {
    if (error instanceof AdapterError || error instanceof SdkError) {
      throw error;
    }
    throw new SdkError("TARGET_UNWRITABLE", targetUnwritableMessage(targetPath, cwd, error));
  }
}
