import type { FormatAdapter, ReadResult } from "../adapter.js";
import { extractAppleStringsPlaceholders } from "../apple-strings/placeholders.js";
import { AdapterError } from "../errors.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { readFileContent } from "../json/bounded-read.js";
import { buildCanHandle, isEnoent, namespaceOf } from "../shell.js";
import { parseXcstringsDocument } from "./xcstrings-document.js";
import { readXcstringsLocale } from "./xcstrings-read.js";
import { patchXcstringsDocument } from "./xcstrings-write.js";

const EXTENSIONS = [".xcstrings"];

export function createAppleXcstringsAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return {
    format: "apple-xcstrings",
    canHandle: buildCanHandle(EXTENSIONS),
    extractPlaceholders: extractAppleStringsPlaceholders,
    validateMessage: (): boolean => true,
    async read(filePath, locale): Promise<ReadResult> {
      const content = await readFileContent(fs, filePath);
      const doc = parseXcstringsDocument(content, filePath);
      const namespace = namespaceOf(filePath);
      const { entries, excludedLeafPaths } = readXcstringsLocale(
        doc,
        locale,
        namespace,
        filePath,
        extractAppleStringsPlaceholders,
      );
      return {
        resource: { locale, namespace, format: "apple-xcstrings", entries },
        invalidIcuKeys: [],
        excludedLeafPaths,
      };
    },
    async write(resource, filePath): Promise<void> {
      let content: string;
      try {
        content = await readFileContent(fs, filePath);
      } catch (error) {
        if (isEnoent(error)) {
          throw new AdapterError(
            "INVALID_STRUCTURE",
            `${filePath}: the catalogue does not exist. verbatra does not create a new .xcstrings catalogue; create it in Xcode first.`,
          );
        }
        throw error;
      }
      const doc = parseXcstringsDocument(content, filePath);
      patchXcstringsDocument(doc, resource.locale, resource, filePath);
      await fs.writeFileAtomic(filePath, `${JSON.stringify(doc.raw, null, 2)}\n`);
    },
  };
}
