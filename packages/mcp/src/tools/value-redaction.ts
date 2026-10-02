import type { ValueMarker } from "@verbatra/sdk";

type StringField<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends string ? K : never;
}[keyof T] &
  string;

export function markFields<T extends object>(
  value: T,
  fields: readonly StringField<T>[],
  marker: ValueMarker,
): T {
  const marked: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const field of fields) {
    const current = marked[field];
    if (typeof current === "string") {
      marked[field] = marker.mark(current);
    }
  }
  return marked as T;
}

export function markAll(values: readonly string[], marker: ValueMarker): string[] {
  return values.map((value) => marker.mark(value));
}

export function markRecord<V>(
  record: Readonly<Record<string, V>>,
  markValue: (value: V) => V,
): Record<string, V> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, markValue(value)]));
}

export function withoutReviewer<T extends { readonly reviewer?: string | undefined }>(
  provenance: T,
): T {
  const { reviewer: _reviewer, ...rest } = provenance;
  return rest as T;
}

export function withProvenanceRedacted<
  T extends { readonly provenance?: { readonly reviewer?: string | undefined } | undefined },
>(value: T): T {
  return value.provenance === undefined
    ? value
    : { ...value, provenance: withoutReviewer(value.provenance) };
}

export function redactWriteResult<
  T extends { readonly value: string; readonly details?: readonly string[] | undefined },
>(result: T, marker: ValueMarker): T {
  const { details: _details, ...rest } = result;
  return { ...rest, value: marker.mark(result.value) } as T;
}

export function redactQuoted(text: string, marker: ValueMarker): string {
  return text.replace(/"([^"\n]*)"/g, (_quoted, inner: string) => marker.mark(inner));
}
