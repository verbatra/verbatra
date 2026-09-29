import type { Element } from "@xmldom/xmldom";
import {
  nonEmptyAttribute,
  recordUnit,
  type UnitBody,
  type UnitReadContext,
} from "./read-xliff.js";
import { decodeInline, directText, type InlineHandler } from "./xliff-inline-decode.js";
import {
  EXTRADATA_SOURCE_HASH_PREFIX,
  stateFromXliff12,
  type XliffState,
} from "./xliff-vocabulary.js";
import { childrenNamed, elementChildren, firstChildNamed } from "./xml-document.js";

const CONTENT: InlineHandler = (element) => {
  switch (element.localName) {
    case "ph":
    case "bpt":
    case "ept":
    case "it":
      return { kind: "text", text: directText(element) };
    case "g":
    case "mrk":
      return { kind: "wrap", before: "", after: "" };
    case "x":
    case "bx":
    case "ex": {
      const equiv = element.getAttribute("equiv-text");
      return equiv === null ? { kind: "unresolved" } : { kind: "text", text: equiv };
    }
    default:
      return { kind: "unresolved" };
  }
};

function sourceHashOf(unit: Element): string | undefined {
  const extradata = unit.getAttribute("extradata");
  return extradata?.startsWith(EXTRADATA_SOURCE_HASH_PREFIX) === true
    ? extradata.slice(EXTRADATA_SOURCE_HASH_PREFIX.length)
    : undefined;
}

function stateOf(unit: Element, target: Element | undefined): XliffState {
  const state = stateFromXliff12(target?.getAttribute("state") ?? null);
  const approved = unit.getAttribute("approved") === "yes";
  return approved && (state === "initial" || state === "translated") ? "reviewed" : state;
}

function unitBody(unit: Element): UnitBody {
  const source = firstChildNamed(unit, "source");
  const target = firstChildNamed(unit, "target");
  return {
    key: nonEmptyAttribute(unit, "resname") ?? nonEmptyAttribute(unit, "id"),
    source: source === undefined ? undefined : decodeInline(source, CONTENT),
    target: target === undefined ? undefined : (decodeInline(target, CONTENT) ?? null),
    state: stateOf(unit, target),
    sourceHash: sourceHashOf(unit),
  };
}

function walkBody(body: Element, context: UnitReadContext): void {
  const pending: Element[] = [...elementChildren(body).reverse()];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (current.localName === "trans-unit") {
      recordUnit(context, current, unitBody(current));
    } else if (current.localName === "group") {
      pending.push(...elementChildren(current).reverse());
    }
  }
}

export function readXliff12Units(
  root: Element,
  context: UnitReadContext,
): { sourceLanguage: string | undefined; targetLanguage: string | undefined } {
  const files = childrenNamed(root, "file");
  for (const file of files) {
    const body = firstChildNamed(file, "body");
    if (body !== undefined) {
      walkBody(body, context);
    }
  }
  const first = files[0];
  return {
    sourceLanguage: first === undefined ? undefined : nonEmptyAttribute(first, "source-language"),
    targetLanguage: first === undefined ? undefined : nonEmptyAttribute(first, "target-language"),
  };
}
