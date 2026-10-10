import type { TranslationEntry } from "@verbatra/core/pure";
import type { JsonTree } from "./showcase-seed";

const I18NEXT_PLACEHOLDER = /\{\{[^{}]*\}\}|\$t\([^()]*\)/g;
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

export function i18nextPlaceholders(value: string): readonly string[] {
  return [...value.matchAll(I18NEXT_PLACEHOLDER)].map((match) => match[0]);
}

export function encodeSegment(segment: string): string {
  return segment.replaceAll("\\", "\\\\").replaceAll(".", "\\.");
}

function collect(
  tree: JsonTree,
  prefix: ReadonlyArray<string>,
  namespace: string,
  out: Map<string, TranslationEntry>,
): void {
  for (const [segment, node] of Object.entries(tree)) {
    const path = [...prefix, encodeSegment(segment)];
    if (typeof node === "object") {
      collect(node, path, namespace, out);
      continue;
    }
    const key = path.join(".");
    out.set(key, {
      key,
      namespace,
      value: node,
      placeholders: i18nextPlaceholders(node),
      isPlural: PLURAL_SUFFIX.test(segment),
    });
  }
}

export function flattenJson(tree: JsonTree, namespace: string): Map<string, TranslationEntry> {
  const out = new Map<string, TranslationEntry>();
  collect(tree, [], namespace, out);
  return out;
}
