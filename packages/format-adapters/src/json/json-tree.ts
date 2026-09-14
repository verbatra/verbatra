import { AdapterError } from "../errors.js";
import { MAX_DEPTH } from "./limits.js";
import {
  assertWithinDepth,
  type OrderedRecord,
  parseOrderedJson,
  serializeOrderedJson,
} from "./ordered-json.js";

/** A terminal value in a parsed locale tree: everything that is not a nested object. */
export type JsonLeaf = string | number | boolean | null;

/** Any node in a parsed locale tree: a leaf, or a nested record of further nodes. */
export type JsonTree = JsonLeaf | JsonRecord;

/** A parsed locale tree node, keyed in the order the source document defined its keys. */
export type JsonRecord = ReadonlyMap<string, JsonTree>;

const INVALID_STRUCTURE_MESSAGE =
  "The file is not a valid object (expected nested objects of string, number, boolean, or null leaves).";

function isJsonLeaf(value: unknown): value is JsonLeaf {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function assertNodesValid(root: ReadonlyMap<unknown, unknown>): void {
  const stack: Array<ReadonlyMap<unknown, unknown>> = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      break;
    }
    for (const [key, child] of node) {
      if (typeof key !== "string") {
        throw new AdapterError("INVALID_STRUCTURE", INVALID_STRUCTURE_MESSAGE);
      }
      if (child instanceof Map) {
        stack.push(child);
      } else if (!isJsonLeaf(child)) {
        throw new AdapterError("INVALID_STRUCTURE", INVALID_STRUCTURE_MESSAGE);
      }
    }
  }
}

export function assertJsonRecord(value: unknown): JsonRecord {
  assertWithinDepth(value, MAX_DEPTH);
  if (!(value instanceof Map)) {
    throw new AdapterError("INVALID_STRUCTURE", INVALID_STRUCTURE_MESSAGE);
  }
  assertNodesValid(value);
  return value as JsonRecord;
}

export function parseJsonObject(content: string): JsonRecord {
  return assertJsonRecord(parseOrderedJson(content));
}

export function serializeJsonTree(tree: OrderedRecord): string {
  return serializeOrderedJson(tree);
}

export function isJsonNode(value: unknown): value is JsonRecord {
  return value instanceof Map;
}

export function sniffJsonObject(sample: string): boolean {
  return sample.trimStart().startsWith("{");
}
