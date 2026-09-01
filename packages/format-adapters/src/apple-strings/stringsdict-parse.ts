import type { TranslationEntry } from "@verbatra/core";
import { DOMParser, type Document, type Element, type Node, XMLSerializer } from "@xmldom/xmldom";
import { AdapterError } from "../errors.js";
import type { AdapterFs } from "../fs-port.js";
import {
  type I18nextPluralCategory,
  makePluralKey,
  pluralBaseKey,
  pluralCategoryOf,
} from "../i18next/plural.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { extractAppleStringsPlaceholders } from "./placeholders.js";

const ELEMENT_NODE = 1;

const PLURAL_CATEGORIES: readonly I18nextPluralCategory[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];
const PLURAL_CATEGORY_SET = new Set<string>(PLURAL_CATEGORIES);

const FORMAT_KEY = "NSStringLocalizedFormatKey";
const SPEC_TYPE_KEY = "NSStringFormatSpecTypeKey";
const VALUE_TYPE_KEY = "NSStringFormatValueTypeKey";
const PLURAL_RULE_TYPE = "NSStringPluralRuleType";
const VARIABLE_REF = /%#@(\w+)@/;
const PLIST_HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';

export interface StringsDictEntry {
  readonly formatKey: string;
  readonly variableName: string;
  readonly valueType: string | undefined;
  readonly categories: ReadonlyMap<I18nextPluralCategory, string>;
}

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

function elementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(isElement);
}

function doctypeHasInternalSubset(content: string): boolean {
  const start = content.search(/<!DOCTYPE/i);
  if (start === -1) {
    return false;
  }
  for (let i = start; i < content.length; i += 1) {
    const char = content[i];
    if (char === "[") {
      return true;
    }
    if (char === ">") {
      return false;
    }
  }
  return false;
}

function assertSafePlist(content: string, filePath: string): void {
  if (/<!ENTITY/i.test(content)) {
    throw new AdapterError(
      "INVALID_XML",
      `${filePath}: the plist contains an <!ENTITY> declaration, which is rejected before parsing.`,
    );
  }
  if (doctypeHasInternalSubset(content)) {
    throw new AdapterError(
      "INVALID_XML",
      `${filePath}: the plist's <!DOCTYPE> declares an internal subset, which is rejected before parsing.`,
    );
  }
}

function onFatal(level: "warning" | "error" | "fatalError"): void {
  if (level === "fatalError") {
    throw new Error("malformed XML");
  }
}

function parsePlistRoot(content: string, filePath: string): { doc: Document; root: Element } {
  assertSafePlist(content, filePath);
  let doc: Document;
  try {
    doc = new DOMParser({ onError: onFatal }).parseFromString(content, "text/xml");
  } catch {
    throw new AdapterError("INVALID_XML", `${filePath}: the file is not valid XML.`);
  }
  const plistEl = doc.documentElement;
  if (plistEl === null || plistEl.localName !== "plist") {
    throw new AdapterError("INVALID_STRUCTURE", `${filePath}: the file is not a plist document.`);
  }
  const root = elementChildren(plistEl).find((el) => el.localName === "dict");
  if (root === undefined) {
    throw new AdapterError("INVALID_STRUCTURE", `${filePath}: the plist has no top-level <dict>.`);
  }
  return { doc, root };
}

interface DictPair {
  readonly keyText: string;
  readonly valueEl: Element;
}

function dictPairs(dict: Element, filePath: string, where: string): DictPair[] {
  const children = elementChildren(dict);
  const pairs: DictPair[] = [];
  for (let i = 0; i < children.length; i += 2) {
    const keyEl = children[i];
    const valueEl = children[i + 1];
    if (keyEl === undefined || keyEl.localName !== "key" || valueEl === undefined) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `${filePath}: ${where} has a <dict> with an odd or malformed key/value structure.`,
      );
    }
    pairs.push({ keyText: keyEl.textContent ?? "", valueEl });
  }
  return pairs;
}

function stringValue(el: Element, filePath: string, where: string): string {
  if (el.localName !== "string") {
    throw new AdapterError("INVALID_STRUCTURE", `${filePath}: ${where} expected a <string> value.`);
  }
  return el.textContent ?? "";
}

function parseRuleDict(
  rulePairs: readonly DictPair[],
  filePath: string,
  pluralKey: string,
  variableName: string,
): {
  readonly valueType: string | undefined;
  readonly categories: Map<I18nextPluralCategory, string>;
} {
  const specPair = rulePairs.find((pair) => pair.keyText === SPEC_TYPE_KEY);
  const specType =
    specPair === undefined
      ? undefined
      : stringValue(specPair.valueEl, filePath, `${pluralKey}'s ${SPEC_TYPE_KEY}`);
  if (specType !== PLURAL_RULE_TYPE) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the stringsdict entry "${pluralKey}" has an unsupported ${SPEC_TYPE_KEY} ` +
        `(expected "${PLURAL_RULE_TYPE}", found ${specType === undefined ? "none" : `"${specType}"`}).`,
    );
  }
  const valueTypePair = rulePairs.find((pair) => pair.keyText === VALUE_TYPE_KEY);
  const valueType =
    valueTypePair === undefined
      ? undefined
      : stringValue(valueTypePair.valueEl, filePath, `${pluralKey}'s ${VALUE_TYPE_KEY}`);
  const categories = new Map<I18nextPluralCategory, string>();
  for (const pair of rulePairs) {
    if (pair.keyText === SPEC_TYPE_KEY || pair.keyText === VALUE_TYPE_KEY) {
      continue;
    }
    if (!PLURAL_CATEGORY_SET.has(pair.keyText)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `${filePath}: the stringsdict entry "${pluralKey}" has an unsupported plural category ` +
          `"${pair.keyText}" (variable "${variableName}"); expected one of zero, one, two, few, many, other.`,
      );
    }
    categories.set(
      pair.keyText as I18nextPluralCategory,
      stringValue(pair.valueEl, filePath, `${pluralKey}'s "${pair.keyText}" category`),
    );
  }
  if (categories.size === 0) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the stringsdict entry "${pluralKey}" has no plural categories.`,
    );
  }
  return { valueType, categories };
}

function parseEntryDict(entryDict: Element, filePath: string, pluralKey: string): StringsDictEntry {
  const pairs = dictPairs(entryDict, filePath, `the stringsdict entry "${pluralKey}"`);
  const formatPair = pairs.find((pair) => pair.keyText === FORMAT_KEY);
  if (formatPair === undefined) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the stringsdict entry "${pluralKey}" is missing ${FORMAT_KEY}.`,
    );
  }
  const formatKey = stringValue(
    formatPair.valueEl,
    filePath,
    `the stringsdict entry "${pluralKey}"'s ${FORMAT_KEY}`,
  );
  const variableMatch = VARIABLE_REF.exec(formatKey);
  if (variableMatch === null) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the stringsdict entry "${pluralKey}" is missing a plural rule: its ${FORMAT_KEY} ` +
        "does not reference a %#@variable@ substitution.",
    );
  }
  const variableName = variableMatch[1] as string;
  const rulePair = pairs.find((pair) => pair.keyText === variableName);
  if (rulePair === undefined) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the stringsdict entry "${pluralKey}" references variable "${variableName}" in its ` +
        `${FORMAT_KEY} but has no matching rule dictionary.`,
    );
  }
  if (rulePair.valueEl.localName !== "dict") {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the stringsdict entry "${pluralKey}"'s "${variableName}" rule must be a <dict>.`,
    );
  }
  const rulePairs = dictPairs(
    rulePair.valueEl,
    filePath,
    `the stringsdict entry "${pluralKey}"'s "${variableName}" rule`,
  );
  const { valueType, categories } = parseRuleDict(rulePairs, filePath, pluralKey, variableName);
  return { formatKey, variableName, valueType, categories };
}

export function parseStringsDictGroups(
  content: string,
  filePath: string,
): Map<string, StringsDictEntry> {
  const { root } = parsePlistRoot(content, filePath);
  const pairs = dictPairs(root, filePath, "the stringsdict document");
  const out = new Map<string, StringsDictEntry>();
  for (const pair of pairs) {
    const pluralKey = pair.keyText;
    if (pair.valueEl.localName !== "dict") {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `${filePath}: the stringsdict entry "${pluralKey}" must be a <dict>.`,
      );
    }
    if (out.has(pluralKey)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `${filePath}: the stringsdict file has two entries with the key "${pluralKey}".`,
      );
    }
    out.set(pluralKey, parseEntryDict(pair.valueEl, filePath, pluralKey));
  }
  return out;
}

export function parseAppleStringsDictEntries(
  content: string,
  namespace: string,
  filePath: string,
): Map<string, TranslationEntry> {
  const groups = parseStringsDictGroups(content, filePath);
  const out = new Map<string, TranslationEntry>();
  for (const [pluralKey, group] of groups) {
    for (const category of PLURAL_CATEGORIES) {
      const text = group.categories.get(category);
      if (text === undefined) {
        continue;
      }
      const key = makePluralKey(pluralKey, category);
      out.set(key, {
        key,
        namespace,
        value: text,
        placeholders: extractAppleStringsPlaceholders(text),
        isPlural: true,
      });
    }
  }
  return out;
}

async function readExistingGroups(
  filePath: string,
  fs: AdapterFs,
  strict: boolean,
): Promise<ReadonlyMap<string, StringsDictEntry>> {
  try {
    const outcome = await readBoundedFile(fs, filePath);
    const content = outcomeToContent(
      outcome,
      `${filePath}: the destination path is not a regular file.`,
    );
    return parseStringsDictGroups(content, filePath);
  } catch (error) {
    if (isEnoent(error) || !strict) {
      return new Map();
    }
    if (error instanceof AdapterError) {
      throw error;
    }
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `${filePath}: the destination stringsdict file could not be read.`,
    );
  }
}

function groupTargets(
  entries: ReadonlyMap<string, TranslationEntry>,
): Map<string, Map<I18nextPluralCategory, string>> {
  const groups = new Map<string, Map<I18nextPluralCategory, string>>();
  for (const [key, entry] of entries) {
    const baseKey = pluralBaseKey(key);
    const category = pluralCategoryOf(key);
    if (baseKey === undefined || category === undefined) {
      continue;
    }
    const group = groups.get(baseKey) ?? new Map<I18nextPluralCategory, string>();
    group.set(category, entry.value);
    groups.set(baseKey, group);
  }
  return groups;
}

const DEFAULT_VALUE_TYPE = "d";

function appendTextEl(doc: Document, parent: Element, tag: string, text: string): void {
  const el = doc.createElement(tag);
  el.appendChild(doc.createTextNode(text));
  parent.appendChild(el);
}

function buildEntryPair(
  doc: Document,
  baseKey: string,
  entry: StringsDictEntry,
  categories: ReadonlyMap<I18nextPluralCategory, string>,
): { readonly keyEl: Element; readonly dictEl: Element } {
  const keyEl = doc.createElement("key");
  keyEl.appendChild(doc.createTextNode(baseKey));

  const entryDict = doc.createElement("dict");
  appendTextEl(doc, entryDict, "key", FORMAT_KEY);
  appendTextEl(doc, entryDict, "string", entry.formatKey);
  appendTextEl(doc, entryDict, "key", entry.variableName);

  const ruleDict = doc.createElement("dict");
  appendTextEl(doc, ruleDict, "key", SPEC_TYPE_KEY);
  appendTextEl(doc, ruleDict, "string", PLURAL_RULE_TYPE);
  appendTextEl(doc, ruleDict, "key", VALUE_TYPE_KEY);
  appendTextEl(doc, ruleDict, "string", entry.valueType ?? DEFAULT_VALUE_TYPE);
  for (const category of PLURAL_CATEGORIES) {
    const text = categories.get(category);
    if (text === undefined) {
      continue;
    }
    appendTextEl(doc, ruleDict, "key", category);
    appendTextEl(doc, ruleDict, "string", text);
  }
  entryDict.appendChild(ruleDict);

  return { keyEl, dictEl: entryDict };
}

function synthesizeEntry(baseKey: string): StringsDictEntry {
  return {
    formatKey: `%#@${baseKey}@`,
    variableName: baseKey,
    valueType: undefined,
    categories: new Map(),
  };
}

export async function serializeAppleStringsDictEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string | undefined> {
  const targets = groupTargets(entries);
  const existing = await readExistingGroups(filePath, fs, targets.size > 0);
  if (targets.size === 0 && existing.size === 0) {
    return undefined;
  }
  const doc = new DOMParser().parseFromString('<plist version="1.0"><dict/></plist>', "text/xml");
  const plistEl = doc.documentElement as Element;
  const dictEl = elementChildren(plistEl)[0] as Element;

  const orderedKeys = [
    ...[...existing.keys()].filter((key) => targets.has(key)),
    ...[...targets.keys()].filter((key) => !existing.has(key)),
  ];
  for (const baseKey of orderedKeys) {
    const categories = targets.get(baseKey);
    if (categories === undefined) {
      continue;
    }
    const base = existing.get(baseKey) ?? synthesizeEntry(baseKey);
    const { keyEl, dictEl: entryDictEl } = buildEntryPair(doc, baseKey, base, categories);
    dictEl.appendChild(keyEl);
    dictEl.appendChild(entryDictEl);
  }

  return `${PLIST_HEADER}${new XMLSerializer().serializeToString(doc)}`;
}
