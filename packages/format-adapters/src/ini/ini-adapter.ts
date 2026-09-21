import type { FormatAdapter } from "../adapter.js";
import { createFlatFileAdapter } from "../flat/flat-file-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { extractSingleBraceTokens } from "../single-brace/tokens.js";
import { parseIniEntries, serializeIniEntries } from "./parse.js";

export function createIniAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createFlatFileAdapter({
    fs,
    format: "ini",
    extensions: [".ini"],
    parseEntries: parseIniEntries,
    serializeEntries: serializeIniEntries,
    extractPlaceholders: extractSingleBraceTokens,
  });
}
