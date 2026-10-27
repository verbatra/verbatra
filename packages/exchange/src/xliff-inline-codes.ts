import type { InlineSpan } from "./xliff-vocabulary.js";

export type NumberedSpan =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "code";
      readonly id: string;
      readonly dataId: string;
      readonly code: string;
    };

export interface NumberedUnit {
  readonly source: readonly NumberedSpan[];
  readonly target: readonly NumberedSpan[] | undefined;
  readonly data: ReadonlyMap<string, string>;
}

class CodeTable {
  readonly data = new Map<string, string>();
  private readonly dataIds = new Map<string, string>();
  private nextId = 1;

  dataIdFor(code: string): string {
    const known = this.dataIds.get(code);
    if (known !== undefined) {
      return known;
    }
    const dataId = `d${this.dataIds.size + 1}`;
    this.dataIds.set(code, dataId);
    this.data.set(dataId, code);
    return dataId;
  }

  freshId(): string {
    const id = String(this.nextId);
    this.nextId += 1;
    return id;
  }
}

function numberSource(spans: readonly InlineSpan[], table: CodeTable): NumberedSpan[] {
  return spans.map((span) =>
    span.kind === "text"
      ? span
      : { kind: "code", id: table.freshId(), dataId: table.dataIdFor(span.code), code: span.code },
  );
}

function claimSourceId(
  code: string,
  source: readonly NumberedSpan[],
  claimed: Set<string>,
): string | undefined {
  for (const span of source) {
    if (span.kind === "code" && span.code === code && !claimed.has(span.id)) {
      claimed.add(span.id);
      return span.id;
    }
  }
  return undefined;
}

function numberTarget(
  spans: readonly InlineSpan[],
  source: readonly NumberedSpan[],
  table: CodeTable,
): NumberedSpan[] {
  const claimed = new Set<string>();
  return spans.map((span) => {
    if (span.kind === "text") {
      return span;
    }
    const id = claimSourceId(span.code, source, claimed) ?? table.freshId();
    return { kind: "code", id, dataId: table.dataIdFor(span.code), code: span.code };
  });
}

export function numberInlineCodes(
  source: readonly InlineSpan[],
  target: readonly InlineSpan[] | undefined,
): NumberedUnit {
  const table = new CodeTable();
  const numberedSource = numberSource(source, table);
  return {
    source: numberedSource,
    target: target === undefined ? undefined : numberTarget(target, numberedSource, table),
    data: table.data,
  };
}
