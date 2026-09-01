import type { FormatAdapter } from "../adapter.js";
import { createFlatFileAdapter } from "../flat/flat-file-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { parseAndroidXmlEntries } from "./parse.js";
import { extractAndroidPlaceholders } from "./placeholders.js";
import { serializeAndroidXmlEntries } from "./serialize.js";

export function createAndroidXmlAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createFlatFileAdapter({
    fs,
    format: "android-xml",
    extensions: [".xml"],
    parseEntries: parseAndroidXmlEntries,
    serializeEntries: serializeAndroidXmlEntries,
    extractPlaceholders: extractAndroidPlaceholders,
  });
}
