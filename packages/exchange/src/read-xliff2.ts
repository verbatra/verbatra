import type { Element } from "@xmldom/xmldom";
import {
  nonEmptyAttribute,
  recordUnit,
  type UnitBody,
  type UnitReadContext,
} from "./read-xliff.js";
import { decodeInline, type InlineHandler, type InlineStep } from "./xliff-inline-decode.js";
import {
  lowestState,
  METADATA_CATEGORY,
  SOURCE_HASH_META_TYPE,
  stateFromXliff2,
  XLIFF2_METADATA_NAMESPACE,
} from "./xliff-vocabulary.js";
import { childrenNamed, elementChildren, firstChildNamed } from "./xml-document.js";

const UNRESOLVED: InlineStep = { kind: "unresolved" };

const HEX = /^[0-9A-Fa-f]{1,6}$/;

function codePointStep(element: Element): InlineStep {
  const hex = element.getAttribute("hex") ?? "";
  const code = Number.parseInt(hex, 16);
  return HEX.test(hex) && code <= 0x10ffff
    ? { kind: "text", text: String.fromCodePoint(code) }
    : UNRESOLVED;
}

const DATA_CONTENT: InlineHandler = (element) =>
  element.localName === "cp" ? codePointStep(element) : UNRESOLVED;

function resolveCode(
  element: Element,
  data: ReadonlyMap<string, string>,
  refAttribute: string,
  equivAttribute: string,
): string | undefined {
  const ref = element.getAttribute(refAttribute);
  const equiv = element.getAttribute(equivAttribute);
  if (ref !== null) {
    return data.get(ref) ?? equiv ?? undefined;
  }
  return equiv ?? "";
}

function standaloneStep(element: Element, data: ReadonlyMap<string, string>): InlineStep {
  const text = resolveCode(element, data, "dataRef", "equiv");
  return text === undefined ? UNRESOLVED : { kind: "text", text };
}

function pairedStep(element: Element, data: ReadonlyMap<string, string>): InlineStep {
  const before = resolveCode(element, data, "dataRefStart", "equivStart");
  const after = resolveCode(element, data, "dataRefEnd", "equivEnd");
  return before === undefined || after === undefined ? UNRESOLVED : { kind: "wrap", before, after };
}

function contentHandler(data: ReadonlyMap<string, string>): InlineHandler {
  return (element) => {
    switch (element.localName) {
      case "ph":
      case "sc":
      case "ec":
        return standaloneStep(element, data);
      case "pc":
        return pairedStep(element, data);
      case "cp":
        return codePointStep(element);
      case "mrk":
        return { kind: "wrap", before: "", after: "" };
      case "sm":
      case "em":
        return { kind: "text", text: "" };
      default:
        return UNRESOLVED;
    }
  };
}

function originalData(unit: Element): ReadonlyMap<string, string> {
  const data = new Map<string, string>();
  const container = firstChildNamed(unit, "originalData");
  for (const entry of container === undefined ? [] : childrenNamed(container, "data")) {
    const id = entry.getAttribute("id");
    const text = decodeInline(entry, DATA_CONTENT);
    if (id !== null && text !== undefined) {
      data.set(id, text);
    }
  }
  return data;
}

function metaGroupHash(group: Element): string | undefined {
  for (const child of elementChildren(group)) {
    if (child.localName === "meta" && child.getAttribute("type") === SOURCE_HASH_META_TYPE) {
      return child.textContent ?? "";
    }
    const nested = child.localName === "metaGroup" ? metaGroupHash(child) : undefined;
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function sourceHashOf(unit: Element): string | undefined {
  for (const metadata of elementChildren(unit)) {
    if (metadata.namespaceURI !== XLIFF2_METADATA_NAMESPACE || metadata.localName !== "metadata") {
      continue;
    }
    for (const group of childrenNamed(metadata, "metaGroup")) {
      const hash =
        group.getAttribute("category") === METADATA_CATEGORY ? metaGroupHash(group) : undefined;
      if (hash !== undefined) {
        return hash;
      }
    }
  }
  return undefined;
}

interface PartText {
  readonly source: string | undefined;
  readonly target: string | undefined | null;
}

function partText(part: Element, handler: InlineHandler): PartText {
  const source = firstChildNamed(part, "source");
  const target = firstChildNamed(part, "target");
  const sourceText = source === undefined ? undefined : decodeInline(source, handler);
  if (target !== undefined) {
    return { source: sourceText, target: decodeInline(target, handler) ?? null };
  }
  return { source: sourceText, target: part.localName === "ignorable" ? sourceText : undefined };
}

function joinSources(parts: readonly PartText[]): string | undefined {
  const sources = parts.map((part) => part.source);
  return sources.every((text) => text !== undefined) ? sources.join("") : undefined;
}

function joinTargets(parts: readonly PartText[]): string | undefined | null {
  const targets = parts.map((part) => part.target);
  if (targets.some((text) => text === null)) {
    return null;
  }
  return targets.every((text) => typeof text === "string") ? targets.join("") : undefined;
}

function unitBody(unit: Element): UnitBody {
  const handler = contentHandler(originalData(unit));
  const segments = elementChildren(unit).filter(
    (child) => child.localName === "segment" || child.localName === "ignorable",
  );
  const parts = segments.map((part) => partText(part, handler));
  const states = segments
    .filter((part) => part.localName === "segment")
    .map((part) => stateFromXliff2(part.getAttribute("state")));
  return {
    key: nonEmptyAttribute(unit, "name") ?? nonEmptyAttribute(unit, "id"),
    source: parts.length === 0 ? undefined : joinSources(parts),
    target: joinTargets(parts),
    state: states.length === 0 ? "initial" : lowestState(states),
    sourceHash: sourceHashOf(unit),
  };
}

function walkFile(file: Element, context: UnitReadContext): void {
  const pending: Element[] = [];
  const pushChildren = (parent: Element): void => {
    pending.push(...elementChildren(parent).reverse());
  };
  pushChildren(file);
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (current.localName === "unit") {
      recordUnit(context, current, unitBody(current));
    } else if (current.localName === "group") {
      pushChildren(current);
    }
  }
}

export function readXliff2Units(
  root: Element,
  context: UnitReadContext,
): { sourceLanguage: string | undefined; targetLanguage: string | undefined } {
  for (const file of childrenNamed(root, "file")) {
    walkFile(file, context);
  }
  return {
    sourceLanguage: nonEmptyAttribute(root, "srcLang"),
    targetLanguage: nonEmptyAttribute(root, "trgLang"),
  };
}
