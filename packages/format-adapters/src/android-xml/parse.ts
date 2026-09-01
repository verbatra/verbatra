import type { TranslationEntry } from "@verbatra/core";
import type { Element } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import { decodeAndroidEscapes } from "./escape.js";
import { assertValidResourceName } from "./names.js";
import { extractAndroidPlaceholders } from "./placeholders.js";
import {
  ANDROID_PLURAL_CATEGORIES,
  isAndroidPluralCategory,
  makeAndroidPluralKey,
} from "./plural.js";
import { elementChildren, parseAndroidXml, singleTextValue } from "./xml.js";

function isTranslatable(element: Element): boolean {
  return element.getAttribute("translatable") !== "false";
}

function setEntry(
  out: Map<string, TranslationEntry>,
  key: string,
  namespace: string,
  value: string,
  isPlural: boolean,
): void {
  if (out.has(key)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The resolved key "${key}" is defined more than once in the file.`,
    );
  }
  out.set(key, {
    key,
    namespace,
    value,
    placeholders: extractAndroidPlaceholders(value),
    isPlural,
  });
}

function parseStringElement(
  element: Element,
  namespace: string,
  out: Map<string, TranslationEntry>,
): void {
  const name = element.getAttribute("name") ?? "";
  assertValidResourceName(name, "string");
  if (!isTranslatable(element)) {
    return;
  }
  const raw = singleTextValue(element);
  if (raw === undefined) {
    return;
  }
  setEntry(out, name, namespace, decodeAndroidEscapes(raw), false);
}

function assertUniqueQuantities(items: readonly Element[], name: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const quantity = item.getAttribute("quantity") ?? "";
    if (seen.has(quantity)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The <plurals name="${name}"> element has more than one item for quantity "${quantity}".`,
      );
    }
    seen.add(quantity);
  }
}

function parsePluralsElement(
  element: Element,
  namespace: string,
  out: Map<string, TranslationEntry>,
): void {
  const name = element.getAttribute("name") ?? "";
  assertValidResourceName(name, "plurals");
  if (!isTranslatable(element)) {
    return;
  }
  const items = elementChildren(element, "item");
  assertUniqueQuantities(items, name);
  const values: Array<readonly [string, string]> = [];
  for (const item of items) {
    const quantity = item.getAttribute("quantity") ?? "";
    if (!isAndroidPluralCategory(quantity)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The <plurals name="${name}"> element has an item with quantity="${quantity}", which is not one of ${ANDROID_PLURAL_CATEGORIES.join(", ")}.`,
      );
    }
    const raw = singleTextValue(item);
    if (raw === undefined) {
      return;
    }
    values.push([quantity, raw]);
  }
  for (const [quantity, raw] of values) {
    setEntry(
      out,
      makeAndroidPluralKey(name, quantity as (typeof ANDROID_PLURAL_CATEGORIES)[number]),
      namespace,
      decodeAndroidEscapes(raw),
      true,
    );
  }
}

export function parseAndroidXmlEntries(
  content: string,
  namespace: string,
): Map<string, TranslationEntry> {
  const { root } = parseAndroidXml(content);
  const out = new Map<string, TranslationEntry>();
  for (const element of elementChildren(root)) {
    if (element.localName === "string") {
      parseStringElement(element, namespace, out);
    } else if (element.localName === "plurals") {
      parsePluralsElement(element, namespace, out);
    }
  }
  return out;
}
