import type { FormatAdapter } from "../adapter.js";
import { createFlatFileAdapter } from "../flat/flat-file-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { compareXliffPlaceholders, extractXliffPlaceholders } from "./placeholders.js";
import { parseXliffEntries, serializeXliffEntries } from "./xml.js";

function sniffXliff(sample: string): boolean {
  const head = sample.trimStart();
  return head.startsWith("<xliff") || head.startsWith("<?xml");
}

export function createXliffAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createFlatFileAdapter({
    fs,
    format: "xliff",
    extensions: [".xlf", ".xliff"],
    sniff: sniffXliff,
    parseEntries: parseXliffEntries,
    serializeEntries: serializeXliffEntries,
    extractPlaceholders: (value) => extractXliffPlaceholders(value),
    comparePlaceholders: compareXliffPlaceholders,
  });
}
