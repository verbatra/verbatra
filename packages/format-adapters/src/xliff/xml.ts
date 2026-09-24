import { resolve } from "node:path";
import type { TranslationEntry } from "@verbatra/core";
import { type Document, type Element, XMLSerializer } from "@xmldom/xmldom";
import type { WriteContext } from "../adapter.js";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { appendMissingUnits } from "./append-units.js";
import {
  childByName,
  collectByTag,
  documentVersion,
  parseXml,
  type Unit,
  walkUnits,
  type XliffVersion,
} from "./document.js";
import { readInlineValue, writeInlineValue } from "./inline.js";
import { readsTargets } from "./languages.js";
import { extractXliffPlaceholders } from "./placeholders.js";
import { isInitialSegment, isUntranslatedTarget, markTranslated } from "./state.js";

function isUntouchedInitialCopy(unit: Unit, value: string, version: XliffVersion): boolean {
  return isInitialSegment(unit.container, version) && value === readInlineValue(unit.source);
}

function targetValue(unit: Unit, version: XliffVersion): string | undefined {
  const { target } = unit;
  if (target === null || isUntranslatedTarget(target)) {
    return undefined;
  }
  const value = readInlineValue(target);
  if (value.trim() === "" || isUntouchedInitialCopy(unit, value, version)) {
    return undefined;
  }
  return value;
}

function createRoleResolver(locale: string): (unit: Unit) => boolean {
  const byScope = new Map<Element, boolean>();
  return (unit) => {
    const known = byScope.get(unit.scope);
    if (known !== undefined) {
      return known;
    }
    const hasTargets = collectByTag(unit.scope, "target").length > 0;
    const role = readsTargets(unit.languages, locale, hasTargets);
    byScope.set(unit.scope, role);
    return role;
  };
}

export function parseXliffEntries(
  content: string,
  namespace: string,
  _filePath: string,
  _fs: AdapterFs,
  locale: string,
): Map<string, TranslationEntry> {
  const { root } = parseXml(content);
  const version = documentVersion(root);
  const readsTargetOf = createRoleResolver(locale);
  const out = new Map<string, TranslationEntry>();
  const seen = new Set<string>();
  for (const unit of walkUnits(root)) {
    if (seen.has(unit.key)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        "The XLIFF file has two trans-units with the same id.",
      );
    }
    seen.add(unit.key);
    const value = readsTargetOf(unit) ? targetValue(unit, version) : readInlineValue(unit.source);
    if (value === undefined) {
      continue;
    }
    out.set(unit.key, {
      key: unit.key,
      namespace,
      value,
      placeholders: extractXliffPlaceholders(value, version),
      isPlural: false,
      ...(unit.description !== undefined ? { description: unit.description } : {}),
    });
  }
  return out;
}

function destinationReadErrorMessage(error: unknown): string {
  if (isEnoent(error)) {
    return "The destination XLIFF file does not exist.";
  }
  return `The destination XLIFF file could not be read: ${failureReason(error)}`;
}

async function readDestination(filePath: string, fs: AdapterFs): Promise<string> {
  let outcome: BoundedReadOutcome;
  try {
    outcome = await readBoundedFile(fs, filePath);
  } catch (error) {
    throw new AdapterError("INVALID_STRUCTURE", destinationReadErrorMessage(error));
  }
  return outcomeToContent(outcome, "The destination path is not a regular file.");
}

function insertTarget(doc: Document, unit: Unit): Element {
  const target = doc.createElementNS(unit.source.namespaceURI, "target");
  const anchor = childByName(unit.container, "seg-source") ?? unit.source;
  unit.container.insertBefore(target, anchor.nextSibling);
  return target;
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readSourceRoot(sourcePath: string, fs: AdapterFs): Promise<Element> {
  let content: string;
  try {
    content = outcomeToContent(
      await readBoundedFile(fs, sourcePath),
      "The source path is not a regular file.",
    );
  } catch (error) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The source XLIFF file could not be read, so units the destination lacks cannot be copied from it: ${failureReason(error)}`,
    );
  }
  try {
    return parseXml(content).root;
  } catch (error) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The source XLIFF file is not a valid XLIFF document, so units the destination lacks cannot be copied from it: ${failureReason(error)}`,
    );
  }
}

async function readSourceUnits(
  context: WriteContext,
  fs: AdapterFs,
  version: XliffVersion,
): Promise<ReadonlyMap<string, Unit>> {
  if (context.sourcePath === undefined) {
    return new Map();
  }
  const root = await readSourceRoot(context.sourcePath, fs);
  if (documentVersion(root) !== version) {
    return new Map();
  }
  return new Map(walkUnits(root).map((unit) => [unit.key, unit]));
}

function isSourceDestination(filePath: string, context: WriteContext): boolean {
  return context.sourcePath !== undefined && resolve(context.sourcePath) === resolve(filePath);
}

function holderElement(doc: Document, unit: Unit, writingSource: boolean): Element {
  if (writingSource) {
    return unit.source;
  }
  return unit.target ?? insertTarget(doc, unit);
}

export async function serializeXliffEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
  context: WriteContext,
): Promise<string> {
  const { doc, root } = parseXml(await readDestination(filePath, fs));
  const version = documentVersion(root);
  const writingSource = isSourceDestination(filePath, context);
  const written = new Set<string>();
  for (const unit of walkUnits(root)) {
    const entry = entries.get(unit.key);
    if (entry !== undefined) {
      const holder = holderElement(doc, unit, writingSource);
      writeInlineValue(doc, holder, entry.value, version);
      if (!writingSource) {
        markTranslated(holder, unit.container, version);
      }
      written.add(unit.key);
    }
  }
  const missing = [...entries.values()].filter((entry) => !written.has(entry.key));
  if (missing.length > 0) {
    appendMissingUnits({
      doc,
      root,
      version,
      missing,
      sourceUnits: writingSource ? new Map() : await readSourceUnits(context, fs, version),
      writingSource,
    });
  }
  return new XMLSerializer().serializeToString(doc);
}
