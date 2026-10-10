import { resolve } from "node:path";
import {
  type FileScannedListener,
  type ProjectScan,
  type SourceExtractor,
  type SourceFramework,
  type SourceFs,
  scanProject,
} from "@verbatra/extract";
import { buildExtractor, type ExtractionConfig } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import type { SdkFs } from "../fs.js";
import type { ScanProgressListener } from "../progress/types.js";

export type CreateExtractor = (framework: SourceFramework) => SourceExtractor;

export const EXTRACT_NOT_CONFIGURED_MESSAGE =
  "No extract block is configured. Add an extract block naming a framework and at least one " +
  "source root to the verbatra config.";

export function requireExtractionConfig(config: VerbatraConfig): ExtractionConfig {
  if (config.extract === undefined) {
    throw new SdkError("EXTRACT_NOT_CONFIGURED", EXTRACT_NOT_CONFIGURED_MESSAGE);
  }
  return config.extract;
}

export function toSourceFs(fs: SdkFs): SourceFs {
  const readDirectory = fs.readDirectory;
  if (readDirectory === undefined) {
    throw new SdkError(
      "EXTRACT_FS_UNSUPPORTED",
      "The supplied file system implements no readDirectory, so no source file can be discovered.",
    );
  }
  return {
    listDirectory: (path) => readDirectory(path),
    readTextBounded: async (path, maxBytes) => fs.readFileBounded(path, maxBytes),
  };
}

export function scanProgress(onProgress: ScanProgressListener | undefined): {
  onFileScanned?: FileScannedListener;
} {
  return onProgress === undefined
    ? {}
    : {
        onFileScanned: (scanned, total) => onProgress({ type: "files-scanned", scanned, total }),
      };
}

export async function runScan(
  extraction: ExtractionConfig,
  cwd: string,
  fs: SdkFs,
  createExtractor: CreateExtractor = buildExtractor,
  onProgress?: ScanProgressListener,
): Promise<ProjectScan> {
  return scanProject(
    {
      cwd,
      roots: extraction.roots.map((root) => resolve(cwd, root)),
      extractor: createExtractor(extraction.framework),
      ...(extraction.exclude !== undefined ? { exclude: extraction.exclude } : {}),
      ...scanProgress(onProgress),
    },
    toSourceFs(fs),
  );
}
