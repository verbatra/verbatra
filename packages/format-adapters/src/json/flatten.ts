import type { TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";
import { isJsonNode, type JsonRecord } from "./json-tree.js";
import { encodePathSegment, encodeSegment, joinEncodedSegments } from "./key-encoding.js";

/**
 * Derives the per-entry facts a format decides for itself from one key and its string value: the
 * placeholder tokens the value carries, and whether the key is one plural form of a set.
 */
export type DeriveEntry = (
  key: string,
  value: string,
) => { readonly placeholders: readonly string[]; readonly isPlural: boolean };

/**
 * How a dotted key in the source document is addressed. `literal-leaf` keeps `"a.b"` as one key
 * whose name contains a dot; `path-notation` reads it as the nested path `a` then `b`.
 */
export type KeyMode = "literal-leaf" | "path-notation";

export interface FlattenResult {
  readonly entries: Map<string, TranslationEntry>;
  readonly excludedLeafPaths: readonly string[];
}

interface FlattenContext {
  readonly namespace: string;
  readonly derive: DeriveEntry;
  readonly out: Map<string, TranslationEntry>;
  readonly claimed: Map<string, string>;
  readonly excluded: string[];
}

function addLeaf(
  ctx: FlattenContext,
  segments: readonly string[],
  key: string,
  value: string | number | boolean | null,
): void {
  const effectivePath = segments.join(".");
  const mapKey = joinEncodedSegments(segments.map(encodeSegment));
  if (ctx.claimed.has(effectivePath) && ctx.claimed.get(effectivePath) !== mapKey) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "A literal dotted leaf key and a nested key path resolve to the same path.",
    );
  }
  ctx.claimed.set(effectivePath, mapKey);
  if (typeof value !== "string") {
    ctx.excluded.push(mapKey);
    return;
  }
  const { placeholders, isPlural } = ctx.derive(key, value);
  ctx.out.set(mapKey, { key: mapKey, namespace: ctx.namespace, value, placeholders, isPlural });
}

function addEntries(ctx: FlattenContext, prefix: readonly string[], node: JsonRecord): void {
  for (const [key, value] of node) {
    const segments = [...prefix, key];
    if (isJsonNode(value)) {
      addEntries(ctx, segments, value);
    } else {
      addLeaf(ctx, segments, key, value);
    }
  }
}

function addPathEntries(
  node: JsonRecord,
  prefix: string,
  namespace: string,
  derive: DeriveEntry,
  out: Map<string, TranslationEntry>,
  claimedPaths: Set<string>,
  excluded: string[],
): void {
  for (const [key, value] of node) {
    const segment = encodePathSegment(key);
    const path = prefix === "" ? segment : `${prefix}.${segment}`;
    if (claimedPaths.has(path)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        "A dotted key and a nested key path resolve to the same path.",
      );
    }
    claimedPaths.add(path);
    if (isJsonNode(value)) {
      addPathEntries(value, path, namespace, derive, out, claimedPaths, excluded);
    } else if (typeof value === "string") {
      const { placeholders, isPlural } = derive(key, value);
      out.set(path, { key: path, namespace, value, placeholders, isPlural });
    } else {
      excluded.push(path);
    }
  }
}

export function flattenTree(
  tree: JsonRecord,
  namespace: string,
  derive: DeriveEntry,
  keyMode: KeyMode = "literal-leaf",
): FlattenResult {
  const out = new Map<string, TranslationEntry>();
  if (keyMode === "path-notation") {
    const excluded: string[] = [];
    addPathEntries(tree, "", namespace, derive, out, new Set(), excluded);
    return { entries: out, excludedLeafPaths: excluded };
  }
  const ctx: FlattenContext = { namespace, derive, out, claimed: new Map(), excluded: [] };
  addEntries(ctx, [], tree);
  return { entries: out, excludedLeafPaths: ctx.excluded };
}
