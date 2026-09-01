import type { FormatAdapter } from "../adapter.js";
import { createFlatFileAdapter } from "../flat/flat-file-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { parsePoEntries } from "./parse.js";
import { extractGettextPlaceholders } from "./placeholders.js";
import { serializePoEntries } from "./serialize.js";

export function createGettextAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createFlatFileAdapter({
    fs,
    format: "gettext-po",
    extensions: [".po", ".pot"],
    parseEntries: parsePoEntries,
    serializeEntries: serializePoEntries,
    extractPlaceholders: extractGettextPlaceholders,
  });
}
