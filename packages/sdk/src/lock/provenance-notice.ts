import type { LocaleSummary, SdkNotice } from "../flow/summary.js";
import type { SdkFs } from "../fs.js";
import { PROVENANCE_FILE_NAME, provenanceFilePath, readProvenanceFile } from "./provenance-file.js";

const PROVENANCE_VERSION_NOTICE: SdkNotice = {
  code: "PROVENANCE_VERSION_UNRECOGNIZED",
  message:
    `${PROVENANCE_FILE_NAME} carries a version this build does not recognize, so it was written ` +
    "by a newer verbatra. It was left untouched and this run recorded no provenance for the values " +
    "it wrote. Upgrade verbatra to keep the record current.",
};

export async function provenanceWritable(cwd: string, fs: SdkFs): Promise<boolean> {
  return (await readProvenanceFile(provenanceFilePath(cwd), fs)).writable;
}

export function withProvenanceNotices(
  summaries: readonly LocaleSummary[],
  writable: boolean,
): LocaleSummary[] {
  if (writable) {
    return [...summaries];
  }
  return summaries.map((summary) => ({
    ...summary,
    notices: [...summary.notices, PROVENANCE_VERSION_NOTICE],
  }));
}
