import { DOMImplementation, DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";

const ROOT_TAG = "root";

const RESHEADERS: readonly (readonly [string, string])[] = [
  ["resmimetype", "text/microsoft-resx"],
  ["version", "2.0"],
  [
    "reader",
    "System.Resources.ResXResourceReader, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089",
  ],
  [
    "writer",
    "System.Resources.ResXResourceWriter, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089",
  ],
];

function onFatal(level: "warning" | "error" | "fatalError", message: string): void {
  if (level === "fatalError") {
    throw new Error(message);
  }
}

function assertNoDoctype(content: string): void {
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    throw new AdapterError(
      "INVALID_XML",
      "A resource file with a DTD or entity declaration is rejected.",
    );
  }
}

export function parseResxXml(content: string): { doc: Document; root: Element } {
  assertNoDoctype(content);
  let doc: Document;
  try {
    doc = new DOMParser({ onError: onFatal }).parseFromString(content, "text/xml");
  } catch {
    throw new AdapterError("INVALID_XML", "The file is not valid XML.");
  }
  const root = doc.documentElement;
  if (root === null || root.localName !== ROOT_TAG) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The file is not a .NET resource file: the root element must be <${ROOT_TAG}>.`,
    );
  }
  return { doc, root };
}

function appendResheader(doc: Document, root: Element, name: string, text: string): void {
  const header = doc.createElement("resheader");
  header.setAttribute("name", name);
  const value = doc.createElement("value");
  value.appendChild(doc.createTextNode(text));
  header.appendChild(value);
  root.appendChild(doc.createTextNode("\n  "));
  root.appendChild(header);
}

export function createResxDocument(): { doc: Document; root: Element } {
  const doc = new DOMImplementation().createDocument(null, ROOT_TAG, null);
  const root = doc.documentElement;
  if (root === null) {
    throw new AdapterError("INVALID_STRUCTURE", "Could not synthesize a new resource document.");
  }
  for (const [name, text] of RESHEADERS) {
    appendResheader(doc, root, name, text);
  }
  return { doc, root };
}
