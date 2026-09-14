import type { Document, Element } from "@xmldom/xmldom";
import { createXmlDocument, parseXmlDocument } from "../xml/document.js";

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

export function parseResxXml(content: string): { doc: Document; root: Element } {
  return parseXmlDocument(content, ROOT_TAG, {
    doctype: "A resource file with a DTD or entity declaration is rejected.",
    notXml: "The file is not valid XML",
    notRoot: `The file is not a .NET resource file: the root element must be <${ROOT_TAG}>.`,
  });
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
  const { doc, root } = createXmlDocument(
    ROOT_TAG,
    "Could not synthesize a new resource document.",
  );
  for (const [name, text] of RESHEADERS) {
    appendResheader(doc, root, name, text);
  }
  return { doc, root };
}
