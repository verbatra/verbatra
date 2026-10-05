import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { configCandidatePaths, type LoadedConfig, type SdkFs } from "@verbatra/sdk";

const GLOSSARY_READ_LIMIT_BYTES = 1024 * 1024 + 1;

export interface FingerprintInput {
  readonly cwd: string;
  readonly configPath?: string;
  readonly fs?: SdkFs;
}

async function diskStamp(path: string): Promise<string> {
  try {
    const info = await stat(path);
    return `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
  } catch {
    return "-";
  }
}

async function portStamp(path: string, fs: SdkFs): Promise<string> {
  if (fs.mtimeMs !== undefined) {
    return String((await fs.mtimeMs(path)) ?? "-");
  }
  const read = await fs.readFileBounded(path, GLOSSARY_READ_LIMIT_BYTES);
  return read.kind === "ok" ? createHash("sha256").update(read.content).digest("hex") : read.kind;
}

export function glossaryFileStamp(loaded: LoadedConfig, fs: SdkFs | undefined): Promise<string> {
  if (loaded.glossary.source !== "file") {
    return Promise.resolve("");
  }
  const path = loaded.glossary.path;
  return fs === undefined ? diskStamp(path) : portStamp(path, fs);
}

export async function configFilesStamp(input: FingerprintInput): Promise<string> {
  const candidates = configCandidatePaths({
    cwd: input.cwd,
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
  });
  return (await Promise.all(candidates.map(diskStamp))).join("|");
}
