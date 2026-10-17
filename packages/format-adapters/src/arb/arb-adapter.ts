import type { FormatAdapter } from "../adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { icuDeriveEntry, icuInvalidKeys, icuIsValid, icuPlaceholders } from "../icu/analyze.js";
import { compareIcuBranchArms } from "../icu/branch-arms.js";
import { compareIcuPlaceholders } from "../icu/compare.js";
import {
  assertJsonRecord,
  type JsonRecord,
  serializeJsonTree,
  sniffJsonObject,
} from "../json/json-tree.js";
import { createTreeFileAdapter } from "../json/tree-file-adapter.js";
import {
  buildArbWriteTree,
  extractArbDescriptions,
  parseArbObject,
  stripArbMetadata,
} from "./metadata.js";

function parseArb(content: string): JsonRecord {
  return assertJsonRecord(stripArbMetadata(parseArbObject(content)));
}

export function createArbAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createTreeFileAdapter({
    fs,
    format: "arb",
    extensions: [".arb"],
    sniff: sniffJsonObject,
    parse: parseArb,
    serialize: serializeJsonTree,
    extractPlaceholders: icuPlaceholders,
    deriveEntry: icuDeriveEntry,
    computeInvalidIcuKeys: icuInvalidKeys,
    validateMessage: icuIsValid,
    comparePlaceholders: compareIcuPlaceholders,
    compareBranchArms: compareIcuBranchArms,
    buildWriteTree: buildArbWriteTree,
    deriveDescriptions: extractArbDescriptions,
  });
}
