import {
  checkPlaceholders,
  contentHash,
  type DiffResult,
  diffResources,
  type LocaleResource,
} from "@verbatra/core";
import { flattenJson, i18nextPlaceholders } from "./showcase-flatten";
import {
  applyShowcaseChange,
  type JsonTree,
  SHOWCASE_CHANGES,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE,
  SHOWCASE_TARGET,
  SHOWCASE_TARGET_LOCALE,
  type ShowcaseScenarioId,
  showcaseKey,
} from "./showcase-seed";

export type ShowcaseMark =
  | "edited"
  | "added"
  | "removed"
  | "missing"
  | "stale"
  | "orphaned"
  | "changes"
  | "new"
  | "kept"
  | "refused";

export type ShowcaseLine = { readonly text: string; readonly mark?: ShowcaseMark };

export type ShowcaseRefusal = {
  readonly key: string;
  readonly candidate: string;
  readonly details: ReadonlyArray<string>;
};

export type ShowcaseOutcome = {
  readonly scenario: ShowcaseScenarioId | null;
  readonly source: ReadonlyArray<ShowcaseLine>;
  readonly target: ReadonlyArray<ShowcaseLine>;
  readonly lock: ReadonlyArray<ShowcaseLine>;
  readonly missing: ReadonlyArray<string>;
  readonly stale: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
  readonly orphaned: ReadonlyArray<string>;
  readonly written: ReadonlyArray<string>;
  readonly lockHashes: Readonly<Record<string, string>>;
  readonly refusal: ShowcaseRefusal | null;
};

type DisplayLeaf = {
  readonly value: string;
  readonly mark?: ShowcaseMark;
  readonly refused?: string;
};
type DisplayTree = ReadonlyArray<readonly [string, DisplayLeaf | DisplayTree]>;

const MISSING_VALUE = "…";

function resource(tree: JsonTree, locale: string): LocaleResource {
  return { locale, namespace: locale, format: "i18next-json", entries: flattenJson(tree, locale) };
}

function displayTree(
  tree: JsonTree,
  marks: ReadonlyMap<string, DisplayLeaf>,
  prefix = "",
): DisplayTree {
  return Object.entries(tree).map(([segment, node]) => {
    const key = prefix === "" ? segment : `${prefix}.${segment}`;
    if (typeof node === "object") return [segment, displayTree(node, marks, key)] as const;
    return [segment, marks.get(key) ?? { value: node }] as const;
  });
}

function isLeaf(node: DisplayLeaf | DisplayTree): node is DisplayLeaf {
  return !Array.isArray(node);
}

function treeLines(tree: DisplayTree, depth: number, out: ShowcaseLine[]): void {
  const indent = "  ".repeat(depth);
  tree.forEach(([segment, node], index) => {
    const comma = index < tree.length - 1 ? "," : "";
    if (isLeaf(node)) {
      if (node.refused !== undefined) {
        out.push({ text: `${indent}"${segment}": "${node.refused}"`, mark: "refused" });
      }
      out.push({ text: `${indent}"${segment}": "${node.value}"${comma}`, mark: node.mark });
      return;
    }
    out.push({ text: `${indent}"${segment}": {` });
    treeLines(node, depth + 1, out);
    out.push({ text: `${indent}}${comma}` });
  });
}

function jsonLines(tree: DisplayTree): ReadonlyArray<ShowcaseLine> {
  const out: ShowcaseLine[] = [{ text: "{" }];
  treeLines(tree, 1, out);
  out.push({ text: "}" });
  return out.map((line) => (line.mark === undefined ? { text: line.text } : line));
}

function lockLines(
  hashes: Readonly<Record<string, string>>,
  marks: ReadonlyMap<string, ShowcaseMark>,
): ReadonlyArray<ShowcaseLine> {
  const keys = Object.keys(hashes).sort();
  const lines = keys.map((key, index) => {
    const text = `  "${key}": "${hashes[key]}"${index < keys.length - 1 ? "," : ""}`;
    const mark = marks.get(key);
    return mark === undefined ? { text } : { text, mark };
  });
  return [{ text: `{ "${SHOWCASE_TARGET_LOCALE}": {` }, ...lines, { text: "} }" }];
}

function hashesOf(source: LocaleResource): Record<string, string> {
  return Object.fromEntries([...source.entries].map(([key, entry]) => [key, contentHash(entry)]));
}

export const SEED_LOCK_HASHES: Readonly<Record<string, string>> = hashesOf(
  resource(SHOWCASE_SOURCE, "en"),
);

function sourceMarks(id: ShowcaseScenarioId): ReadonlyMap<string, DisplayLeaf> {
  const change = SHOWCASE_CHANGES[id];
  const key = showcaseKey(change.path);
  if (change.value !== undefined) {
    return new Map([
      [key, { value: change.value, mark: key in SEED_LOCK_HASHES ? "edited" : "added" }],
    ]);
  }
  const removed = flattenJson(SHOWCASE_SOURCE, "en").get(key)?.value ?? "";
  return new Map([[key, { value: removed, mark: "removed" }]]);
}

function sourceDisplay(id: ShowcaseScenarioId): JsonTree {
  const change = SHOWCASE_CHANGES[id];
  if (change.value !== undefined) return applyShowcaseChange(SHOWCASE_SOURCE, change);
  return SHOWCASE_SOURCE;
}

function targetDisplay(id: ShowcaseScenarioId, missing: ReadonlyArray<string>): JsonTree {
  const { path } = SHOWCASE_CHANGES[id];
  if (!missing.includes(showcaseKey(path))) return SHOWCASE_TARGET;
  return applyShowcaseChange(SHOWCASE_TARGET, { path, value: MISSING_VALUE });
}

function refusalFor(
  id: ShowcaseScenarioId,
  source: LocaleResource,
  sent: ReadonlyArray<string>,
): ShowcaseRefusal | null {
  const change = SHOWCASE_CHANGES[id];
  const key = showcaseKey(change.path);
  const entry = source.entries.get(key);
  if (change.candidate === undefined || entry === undefined || !sent.includes(key)) return null;
  const result = checkPlaceholders(entry.placeholders, i18nextPlaceholders(change.candidate));
  if (result.matches) return null;
  const details = [
    ...result.missing.map((token) => `-${token}`),
    ...result.extra.map((token) => `+${token}`),
  ];
  return { key, candidate: change.candidate, details };
}

function targetMarks(
  diff: DiffResult,
  refusal: ShowcaseRefusal | null,
): ReadonlyMap<string, DisplayLeaf> {
  const target = flattenJson(SHOWCASE_TARGET, SHOWCASE_TARGET_LOCALE);
  const kept = (key: string) => target.get(key)?.value ?? "";
  const marks = new Map<string, DisplayLeaf>();
  for (const key of diff.missing) marks.set(key, { value: MISSING_VALUE, mark: "missing" });
  for (const key of diff.changed) marks.set(key, { value: kept(key), mark: "stale" });
  for (const key of diff.orphaned) marks.set(key, { value: kept(key), mark: "orphaned" });
  if (refusal) {
    marks.set(refusal.key, { value: kept(refusal.key), mark: "stale", refused: refusal.candidate });
  }
  return marks;
}

function lockMarks(
  written: ReadonlyArray<string>,
  held: ReadonlyArray<string>,
): ReadonlyMap<string, ShowcaseMark> {
  const marks = new Map<string, ShowcaseMark>();
  for (const key of written) marks.set(key, key in SEED_LOCK_HASHES ? "changes" : "new");
  for (const key of held) marks.set(key, "kept");
  return marks;
}

export function showcaseSeed(): ShowcaseOutcome {
  const source = resource(SHOWCASE_SOURCE, "en");
  return {
    scenario: null,
    source: jsonLines(displayTree(SHOWCASE_SOURCE, new Map())),
    target: jsonLines(displayTree(SHOWCASE_TARGET, new Map())),
    lock: lockLines(SEED_LOCK_HASHES, new Map()),
    missing: [],
    stale: [],
    unchanged: [...source.entries.keys()].sort(),
    orphaned: [],
    written: [],
    lockHashes: SEED_LOCK_HASHES,
    refusal: null,
  };
}

export function runShowcaseScenario(id: ShowcaseScenarioId): ShowcaseOutcome {
  const sourceTree = applyShowcaseChange(SHOWCASE_SOURCE, SHOWCASE_CHANGES[id]);
  const source = resource(sourceTree, "en");
  const target = resource(SHOWCASE_TARGET, SHOWCASE_TARGET_LOCALE);
  const diff = diffResources(source, target, {
    baseline: new Map(Object.entries(SEED_LOCK_HASHES)),
  });
  const sent = [...diff.missing, ...diff.changed].sort();
  const refusal = refusalFor(id, source, sent);
  const written = sent.filter((key) => key !== refusal?.key);
  const fresh = hashesOf(source);
  const lockHashes = {
    ...SEED_LOCK_HASHES,
    ...Object.fromEntries(written.map((key) => [key, fresh[key] ?? ""])),
  };
  const held = [...diff.orphaned, ...(refusal ? [refusal.key] : [])];
  return {
    scenario: id,
    source: jsonLines(displayTree(sourceDisplay(id), sourceMarks(id))),
    target: jsonLines(displayTree(targetDisplay(id, diff.missing), targetMarks(diff, refusal))),
    lock: lockLines(lockHashes, lockMarks(written, held)),
    missing: diff.missing,
    stale: diff.changed,
    unchanged: diff.unchanged,
    orphaned: diff.orphaned,
    written,
    lockHashes,
    refusal,
  };
}

export type ShowcaseRows = {
  readonly source: number;
  readonly target: number;
  readonly lock: number;
};

export function showcaseRows(): ShowcaseRows {
  const outcomes = [showcaseSeed(), ...SHOWCASE_SCENARIOS.map(runShowcaseScenario)];
  const most = (pane: keyof ShowcaseRows) =>
    Math.max(...outcomes.map((outcome) => outcome[pane].length));
  return { source: most("source"), target: most("target"), lock: most("lock") };
}
