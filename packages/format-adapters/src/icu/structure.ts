import {
  type DateTimeSkeleton,
  type MessageFormatElement,
  type NumberSkeleton,
  parse,
  TYPE,
} from "@formatjs/icu-messageformat-parser";

type Style = string | NumberSkeleton | DateTimeSkeleton | null | undefined;

function styleText(style: Style): string {
  if (style === null || style === undefined) {
    return "";
  }
  if (typeof style === "string") {
    return style;
  }
  return "pattern" in style
    ? `::${style.pattern}`
    : `::${style.tokens.map((token) => [token.stem, ...token.options].join("/")).join(" ")}`;
}

function collect(elements: readonly MessageFormatElement[], scope: string, found: string[]): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        found.push(`argument:${element.value}`);
        break;
      case TYPE.number:
        found.push(`number:${element.value}:${styleText(element.style)}`);
        break;
      case TYPE.date:
        found.push(`date:${element.value}:${styleText(element.style)}`);
        break;
      case TYPE.time:
        found.push(`time:${element.value}:${styleText(element.style)}`);
        break;
      case TYPE.pound:
        found.push(`#:${scope}`);
        break;
      case TYPE.tag:
        collect(element.children, scope, found);
        break;
      case TYPE.select:
      case TYPE.plural: {
        const kind =
          element.type === TYPE.select
            ? "select"
            : element.pluralType === "ordinal"
              ? "selectordinal"
              : "plural";
        found.push(`${kind}:${element.value}`);
        for (const [selector, option] of Object.entries(element.options)) {
          collect(option.value, `${scope}>${element.value}:${selector}`, found);
        }
        break;
      }
      default:
        break;
    }
  }
}

function signaturesOf(value: string): string[] | undefined {
  try {
    const found: string[] = [];
    collect(parse(value), "", found);
    return found;
  } catch {
    return undefined;
  }
}

function countsOf(signatures: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const signature of signatures) {
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return counts;
}

function surplus(
  from: ReadonlyMap<string, number>,
  against: ReadonlyMap<string, number>,
  mark: string,
): string[] {
  const lines: string[] = [];
  for (const [signature, count] of from) {
    const extra = count - (against.get(signature) ?? 0);
    for (let index = 0; index < extra; index += 1) {
      lines.push(`${mark}${signature}`);
    }
  }
  return lines;
}

export function icuStructureChanges(
  before: string,
  after: string,
  fallback?: string,
): readonly string[] {
  const beforeSignatures =
    signaturesOf(before) ?? (fallback === undefined ? undefined : signaturesOf(fallback));
  const afterSignatures = signaturesOf(after);
  if (beforeSignatures === undefined || afterSignatures === undefined) {
    return [];
  }
  const beforeCounts = countsOf(beforeSignatures);
  const afterCounts = countsOf(afterSignatures);
  return [...surplus(afterCounts, beforeCounts, "+"), ...surplus(beforeCounts, afterCounts, "-")];
}
