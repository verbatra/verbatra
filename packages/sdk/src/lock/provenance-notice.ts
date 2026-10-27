import type { LocaleSummary, SdkNotice } from "../flow/summary.js";
import type { SdkFs } from "../fs.js";
import {
  MAX_PROVENANCE_FILE_BYTES,
  PROVENANCE_FILE_NAME,
  type ProvenanceWriteOutcome,
  provenanceFilePath,
  readProvenanceFile,
} from "./provenance-file.js";

const PROVENANCE_VERSION_NOTICE: SdkNotice = {
  code: "PROVENANCE_VERSION_UNRECOGNIZED",
  message:
    `${PROVENANCE_FILE_NAME} carries a version this build does not recognize, so it was written ` +
    "by a newer verbatra. It was left untouched and this run recorded no provenance for the values " +
    "it wrote. Upgrade verbatra to keep the record current.",
};

const PROVENANCE_TOO_LARGE_NOTICE: SdkNotice = {
  code: "PROVENANCE_FILE_TOO_LARGE",
  message:
    `Recording this locale's provenance would have grown ${PROVENANCE_FILE_NAME} past ` +
    `${MAX_PROVENANCE_FILE_BYTES} bytes, the most verbatra reads back, so the file was left as it ` +
    "was and the values this locale wrote have no record.",
};

export async function assertProvenanceReadable(cwd: string, fs: SdkFs): Promise<void> {
  await readProvenanceFile(provenanceFilePath(cwd), fs);
}

export async function isNewerProvenance(cwd: string, fs: SdkFs): Promise<boolean> {
  return !(await readProvenanceFile(provenanceFilePath(cwd), fs)).writable;
}

export function withNewerProvenanceNotice(
  summaries: readonly LocaleSummary[],
  newer: boolean,
): LocaleSummary[] {
  if (!newer) {
    return [...summaries];
  }
  return summaries.map((summary) => withNotice(summary, PROVENANCE_VERSION_NOTICE));
}

export function withProvenanceWriteNotice(
  summary: LocaleSummary,
  outcome: ProvenanceWriteOutcome,
): LocaleSummary {
  return outcome === "too-large" ? withNotice(summary, PROVENANCE_TOO_LARGE_NOTICE) : summary;
}

function withNotice(summary: LocaleSummary, notice: SdkNotice): LocaleSummary {
  return { ...summary, notices: [...summary.notices, notice] };
}
