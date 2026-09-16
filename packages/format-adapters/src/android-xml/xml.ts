import type { Document, Element } from "@xmldom/xmldom";
import { createXmlDocument, parseXmlDocument } from "../xml/document.js";

const ROOT_TAG = "resources";

export { elementChildren, setSingleTextValue, singleTextValue } from "../xml/document.js";

export function parseAndroidXml(content: string): { doc: Document; root: Element } {
  return parseXmlDocument(content, ROOT_TAG, {
    doctype: "strings.xml with a DTD or entity declaration is rejected.",
    notXml: "The file is not valid XML",
    notRoot: `The file is not an Android resources file: the root element must be <${ROOT_TAG}>.`,
  });
}

export function createAndroidXmlDocument(): { doc: Document; root: Element } {
  return createXmlDocument(ROOT_TAG, "Could not synthesize a new resources document.");
}
