import type { FormatAdapter } from "../adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { icuDeriveEntry, icuInvalidKeys, icuIsValid, icuPlaceholders } from "../icu/analyze.js";
import { compareIcuBranchArms } from "../icu/branch-arms.js";
import { compareIcuPlaceholders } from "../icu/compare.js";
import { createJsonFileAdapter } from "../json/json-file-adapter.js";

export function createNextIntlJsonAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createJsonFileAdapter({
    fs,
    format: "next-intl-json",
    extractPlaceholders: icuPlaceholders,
    deriveEntry: icuDeriveEntry,
    computeInvalidIcuKeys: icuInvalidKeys,
    validateMessage: icuIsValid,
    comparePlaceholders: compareIcuPlaceholders,
    compareBranchArms: compareIcuBranchArms,
  });
}
