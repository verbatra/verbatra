import { contentHash } from "@verbatra/core/pure";
import { HERO_TERMINAL_CHANGED_KEYS, HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
import { PLAYGROUND_TRANSLATIONS } from "@/lib/landing-playground";
import { splitPlaceholders } from "@/lib/placeholder-segments";

export const LOCK_DEMO_LOCALE = "de";

export const LOCK_FILE_NAME = "verbatra.lock.json";

export const LOCK_DEMO_COUNTS = {
  changed: HERO_TERMINAL_CHANGED_KEYS.length,
  unchanged: HERO_TERMINAL_SOURCE.length - HERO_TERMINAL_CHANGED_KEYS.length,
  total: HERO_TERMINAL_SOURCE.length,
} as const;

export const LOCK_DEMO_PLAYGROUND_IDS: Readonly<Record<string, string>> = {
  "checkout.title": "checkoutTitle",
  "checkout.pay": "checkoutPay",
};

export function playgroundIdOf(key: string): string {
  const id = LOCK_DEMO_PLAYGROUND_IDS[key];
  if (id === undefined) {
    throw new Error(`LOCK_DEMO_PLAYGROUND_IDS has no generated string id for ${key}`);
  }
  return id;
}

function hashOf(value: string): string {
  return contentHash({
    key: "demo",
    namespace: "en",
    value,
    placeholders: splitPlaceholders(value)
      .filter(({ placeholder }) => placeholder)
      .map(({ text }) => text),
    isPlural: false,
  });
}

export const LOCK_DEMO_HASHES: Readonly<
  Record<string, { readonly before: string; readonly after: string }>
> = Object.fromEntries(
  HERO_TERMINAL_SOURCE.map(({ key, value, before }) => [
    key,
    { before: hashOf(before ?? value), after: hashOf(value) },
  ]),
);

export type LineMark = "changed" | "stale";

export type CodeLine =
  | { readonly kind: "text"; readonly depth: number; readonly text: string }
  | { readonly kind: "open"; readonly depth: number; readonly key: string }
  | { readonly kind: "close"; readonly depth: number; readonly comma: boolean }
  | {
      readonly kind: "entry";
      readonly depth: number;
      readonly key: string;
      readonly value: string;
      readonly comma: boolean;
      readonly mark?: LineMark;
      readonly neighbour?: true;
    }
  | {
      readonly kind: "gap";
      readonly depth: number;
      readonly count: number;
      readonly fold?: number;
    };

const INDENT = "  ";

export function codeLineText(line: Exclude<CodeLine, { kind: "gap" }>): string {
  const pad = INDENT.repeat(line.depth);
  switch (line.kind) {
    case "text":
      return `${pad}${line.text}`;
    case "open":
      return `${pad}${JSON.stringify(line.key)}: {`;
    case "close":
      return `${pad}}${line.comma ? "," : ""}`;
    case "entry":
      return `${pad}${JSON.stringify(line.key)}: ${JSON.stringify(line.value)}${line.comma ? "," : ""}`;
  }
}

type Words = {
  readonly gap: (count: number) => string;
  readonly mark: (mark: LineMark) => string;
};

export function codeLinesText(lines: ReadonlyArray<CodeLine>, words: Words): string {
  return lines
    .filter((line) => line.kind !== "gap" || line.count > 0)
    .map((line) => {
      if (line.kind === "gap") return `${INDENT.repeat(line.depth)}${words.gap(line.count)}`;
      const text = codeLineText(line);
      return line.kind === "entry" && line.mark !== undefined
        ? `${text} ${words.mark(line.mark)}`
        : text;
    })
    .join("\n");
}

type Row = { readonly key: string; readonly value: string; readonly mark?: LineMark };

function gap(depth: number, count: number): ReadonlyArray<CodeLine> {
  return count > 0 ? [{ kind: "gap", depth, count }] : [];
}

function visibleIndexes(rows: ReadonlyArray<Row>, neighbours: number): ReadonlySet<number> {
  const visible = new Set<number>();
  rows.forEach((row, index) => {
    if (row.mark === undefined) return;
    for (let at = index - neighbours; at <= index + neighbours; at += 1) {
      if (at >= 0 && at < rows.length) visible.add(at);
    }
  });
  return visible;
}

function foldRuns(lines: ReadonlyArray<CodeLine>, depth: number): CodeLine[] {
  const folded: CodeLine[] = [];
  let run: CodeLine[] = [];
  const flush = () => {
    const total = run.reduce(
      (sum, line) => sum + (line.kind === "gap" ? line.count : line.kind === "entry" ? 1 : 0),
      0,
    );
    if (total === 0) {
      folded.push(...run);
      run = [];
      return;
    }
    const at = run.findIndex((line) => line.kind === "gap");
    if (at < 0) {
      folded.push({ kind: "gap", depth, count: 0, fold: total }, ...run);
    } else {
      folded.push(
        ...run.map((line, index) =>
          line.kind === "gap" ? { ...line, fold: index === at ? total : 0 } : line,
        ),
      );
    }
    run = [];
  };
  for (const line of lines) {
    if (line.kind === "entry" && line.mark !== undefined) {
      flush();
      folded.push(line);
    } else {
      run.push(line.kind === "entry" ? { ...line, neighbour: true } : line);
    }
  }
  flush();
  return folded;
}

function flatLines(
  rows: ReadonlyArray<Row>,
  depth: number,
  neighbours: number,
  fold = false,
): CodeLine[] {
  const visible = visibleIndexes(rows, neighbours);
  const lines: CodeLine[] = [];
  let hidden = 0;
  rows.forEach((row, index) => {
    if (!visible.has(index)) {
      hidden += 1;
      return;
    }
    lines.push(...gap(depth, hidden));
    hidden = 0;
    lines.push({
      kind: "entry",
      depth,
      key: row.key,
      value: row.value,
      comma: index < rows.length - 1,
      ...(row.mark === undefined ? {} : { mark: row.mark }),
    });
  });
  lines.push(...gap(depth, hidden));
  return fold ? foldRuns(lines, depth) : lines;
}

type Group = {
  readonly name: string;
  readonly rows: ReadonlyArray<Row & { readonly leaf: string }>;
};

function groupsOf(rows: ReadonlyArray<Row>): ReadonlyArray<Group> {
  const groups: Array<{ name: string; rows: Array<Row & { leaf: string }> }> = [];
  for (const row of rows) {
    const [name = "", leaf = ""] = row.key.split(".");
    const last = groups.at(-1);
    if (last?.name === name) last.rows.push({ ...row, leaf });
    else groups.push({ name, rows: [{ ...row, leaf }] });
  }
  return groups;
}

function groupLines(group: Group, last: boolean, neighbours: number): CodeLine[] {
  const leaves = group.rows.map(({ leaf, value, mark }) => ({
    key: leaf,
    value,
    ...(mark === undefined ? {} : { mark }),
  }));
  return [
    { kind: "open", depth: 1, key: group.name },
    ...flatLines(leaves, 2, neighbours),
    { kind: "close", depth: 1, comma: !last },
  ];
}

function nestedLines(rows: ReadonlyArray<Row>, neighbours: number): ReadonlyArray<CodeLine> {
  const groups = groupsOf(rows);
  const visible = (group: Group): boolean => group.rows.some(({ mark }) => mark !== undefined);
  const lines: CodeLine[] = [{ kind: "text", depth: 0, text: "{" }];
  let hidden = 0;
  groups.forEach((group, index) => {
    if (!visible(group)) {
      hidden += group.rows.length;
      return;
    }
    lines.push(...gap(1, hidden));
    hidden = 0;
    lines.push(...groupLines(group, index === groups.length - 1, neighbours));
  });
  lines.push(...gap(1, hidden));
  lines.push({ kind: "text", depth: 0, text: "}" });
  return lines;
}

const CHANGED = new Set(HERO_TERMINAL_CHANGED_KEYS);

const NEIGHBOURS = 1;

export function lockDemoSourceLines(): ReadonlyArray<CodeLine> {
  return nestedLines(
    HERO_TERMINAL_SOURCE.map(({ key, value }) => ({
      key,
      value,
      ...(CHANGED.has(key) ? { mark: "changed" as const } : {}),
    })),
    NEIGHBOURS,
  );
}

export function lockLines(): ReadonlyArray<CodeLine> {
  const rows = [...HERO_TERMINAL_SOURCE]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(({ key }) => ({
      key,
      value: LOCK_DEMO_HASHES[key]?.[CHANGED.has(key) ? "before" : "after"] ?? "",
      ...(CHANGED.has(key) ? { mark: "stale" as const } : {}),
    }));
  return [
    { kind: "text", depth: 0, text: "{" },
    { kind: "text", depth: 1, text: '"version": 1,' },
    { kind: "text", depth: 1, text: '"locales": {' },
    { kind: "text", depth: 2, text: `${JSON.stringify(LOCK_DEMO_LOCALE)}: {` },
    ...flatLines(rows, 3, NEIGHBOURS, true),
    { kind: "text", depth: 2, text: "}" },
    { kind: "text", depth: 1, text: "}" },
    { kind: "text", depth: 0, text: "}" },
  ];
}

export function lockDemoTranslatedValues(): ReadonlyArray<{ key: string; value: string }> {
  return HERO_TERMINAL_CHANGED_KEYS.map((key) => {
    const id = playgroundIdOf(key);
    const value = PLAYGROUND_TRANSLATIONS[LOCK_DEMO_LOCALE]?.[id];
    if (value === undefined) {
      throw new Error(
        `lib/playground/translations.json has no ${LOCK_DEMO_LOCALE} value for ${id}`,
      );
    }
    return { key, value };
  });
}

export function lockDemoTranslationLines(): ReadonlyArray<CodeLine> {
  const translated = new Map(lockDemoTranslatedValues().map(({ key, value }) => [key, value]));
  return nestedLines(
    HERO_TERMINAL_SOURCE.map(({ key }) => {
      const value = translated.get(key);
      return value === undefined ? { key, value: "" } : { key, value, mark: "changed" as const };
    }),
    0,
  );
}
