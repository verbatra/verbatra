import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { identityTag, isLocalPidGone, type LivenessContext } from "./holder-liveness.js";

export const MAX_LOCK_PAYLOAD_BYTES = 64 * 1_024;

const TRANSIENT_RENAME_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);

const ASIDE_NAME = /^.+\.lock(?:\.reclaim)?\.(\d+)\.([0-9a-f]{12})\.[0-9a-f-]{36}\.stale$/;

export type RenameFs = SdkFs & Required<Pick<SdkFs, "rename">>;

export function hasRename(fs: SdkFs): fs is RenameFs {
  return fs.rename !== undefined;
}

export type MoveAsideResult =
  | { readonly kind: "removed" | "missing" | "displaced" | "changed" }
  | { readonly kind: "busy"; readonly error: unknown };

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

export function isTransientFsError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && TRANSIENT_RENAME_CODES.has(code);
}

export function asideName(path: string, liveness: LivenessContext): string {
  return `${path}.${process.pid}.${identityTag(liveness)}.${randomUUID()}.stale`;
}

async function restoreDisplaced(
  path: string,
  aside: string,
  moved: BoundedFileRead,
  fs: SdkFs,
): Promise<void> {
  if (moved.kind !== "ok") {
    return;
  }
  await fs.createExclusive(path, moved.content);
  await fs.deleteFile(aside).catch(() => undefined);
}

export async function moveAsideIfUnchanged(
  path: string,
  fs: RenameFs,
  content: string,
  liveness: LivenessContext,
): Promise<MoveAsideResult> {
  const aside = asideName(path, liveness);
  try {
    await fs.rename(path, aside);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { kind: "missing" };
    }
    if (isTransientFsError(error)) {
      return { kind: "busy", error };
    }
    throw error;
  }
  const moved = await fs.readFileBounded(aside, MAX_LOCK_PAYLOAD_BYTES);
  if (moved.kind === "ok" && moved.content === content) {
    await fs.deleteFile(aside).catch(() => undefined);
    return { kind: "removed" };
  }
  await restoreDisplaced(path, aside, moved, fs);
  return { kind: "displaced" };
}

export async function isOlderThan(path: string, fs: SdkFs, ageMs: number): Promise<boolean> {
  if (fs.mtimeMs === undefined) {
    return false;
  }
  try {
    const mtime = await fs.mtimeMs(path);
    return mtime !== undefined && Date.now() - mtime >= ageMs;
  } catch {
    return false;
  }
}

export interface SweepSettings {
  readonly liveness: LivenessContext;
  readonly staleAfterMs: number;
}

async function isSweepable(
  path: string,
  match: RegExpExecArray,
  fs: SdkFs,
  settings: SweepSettings,
): Promise<boolean> {
  const movedByThisMachine = match[2] === identityTag(settings.liveness);
  if (movedByThisMachine && isLocalPidGone(Number(match[1]), settings.liveness)) {
    return true;
  }
  return isOlderThan(path, fs, settings.staleAfterMs);
}

async function listDirectory(
  directory: string,
  fs: SdkFs,
): Promise<readonly { readonly name: string; readonly kind: string }[]> {
  if (fs.readDirectory === undefined) {
    return [];
  }
  try {
    return await fs.readDirectory(directory);
  } catch {
    return [];
  }
}

export async function sweepAbandonedAsides(
  directory: string,
  fs: SdkFs,
  settings: SweepSettings,
): Promise<void> {
  const entries = await listDirectory(directory, fs);
  for (const entry of entries) {
    const match = entry.kind === "file" ? ASIDE_NAME.exec(entry.name) : null;
    if (match === null) {
      continue;
    }
    const path = join(directory, entry.name);
    if (await isSweepable(path, match, fs, settings)) {
      await fs.deleteFile(path).catch(() => undefined);
    }
  }
}
