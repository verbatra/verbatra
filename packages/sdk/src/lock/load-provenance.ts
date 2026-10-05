import { defaultFs, type SdkFs } from "../fs.js";
import { type ProvenanceFile, provenanceFilePath, readProvenanceFile } from "./provenance-file.js";

/** Input for {@link loadProvenance}. */
export interface LoadProvenanceInput {
  /** Directory holding the provenance file. Defaults to the process working directory. */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link loadProvenance}. Every field has a working default. */
export interface LoadProvenanceDeps {
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * Reads the project's provenance file as stored. Use it when you need the raw records;
 * {@link keyValue}, {@link localeValues}, {@link check}, {@link diff}, and {@link lockState} already
 * report each key's interpreted {@link KeyProvenance}, which also tells a record that no longer
 * matches its value (`external`) from a key that was never recorded (`unrecorded`).
 *
 * A project with no provenance file yet reads as an empty one, and so does a file written by a newer
 * verbatra, whose records this release cannot interpret. A file that exists but cannot be trusted
 * throws, because treating it as empty would let the next write erase every review decision in it.
 *
 * @param input - The optional working directory.
 * @param deps - Optional file-system override.
 * @returns The provenance file's contents, or an empty one when none exists.
 *
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file exists but is oversized,
 * not valid JSON, or structurally wrong.
 */
export async function loadProvenance(
  input: LoadProvenanceInput = {},
  deps: LoadProvenanceDeps = {},
): Promise<ProvenanceFile> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  return (await readProvenanceFile(provenanceFilePath(cwd), fs)).file;
}
