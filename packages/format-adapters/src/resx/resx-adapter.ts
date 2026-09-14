import type { FormatAdapter } from "../adapter.js";
import { createFlatFileAdapter } from "../flat/flat-file-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { parseResxEntries, serializeResxEntries } from "./parse.js";
import { extractResxPlaceholders } from "./placeholders.js";

export function createResxAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createFlatFileAdapter({
    fs,
    format: "resx",
    extensions: [".resx"],
    parseEntries: parseResxEntries,
    serializeEntries: serializeResxEntries,
    extractPlaceholders: extractResxPlaceholders,
  });
}
