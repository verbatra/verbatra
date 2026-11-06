import {
  type IcuSampleValue,
  type IcuSegment,
  type IcuVariationAxis,
  icuMessageArguments,
  icuVariationAxes,
  renderIcuMessage,
} from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { NUMBER_ARGUMENT_SAMPLE, pluralSamples } from "./icu-preview-samples.js";
import {
  describeIcuMessageArguments,
  isIcuMessageFormat,
  type MessageArguments,
} from "./message-arguments.js";
import { pluralCategoriesFor } from "./plural-rules.js";

export const ICU_PREVIEW_MAX_ROWS = 24;

/** Which argument a preview row varies, or `none` for a message with nothing to vary. */
export type IcuPreviewAxis = "plural" | "ordinal" | "select" | "none";

/**
 * Why a message could not be previewed.
 *
 * - `too-long`: the message is over 20,000 characters.
 * - `too-complex`: the message nests deeper than 16 braces or holds more than 256 arguments and tags.
 * - `invalid-message`: the message does not parse as ICU.
 * - `unsupported-locale`: this runtime's CLDR data does not know the locale, or it is malformed.
 * - `too-large`: the rendered text would exceed 100,000 characters.
 */
export type IcuPreviewFailure =
  | "too-long"
  | "too-complex"
  | "invalid-message"
  | "unsupported-locale"
  | "too-large";

/** One rendering of a message with a single argument set to a sample. */
export interface IcuPreviewRow {
  /** What the row varies: a cardinal plural, an ordinal plural, a select, or `none`. */
  readonly axis: IcuPreviewAxis;
  /** The argument the row varies, or `null` when the message has none to vary. */
  readonly argument: string | null;
  /** The plural category, an exact arm such as `=0`, or the select option the row shows. `null` when the message has nothing to vary. */
  readonly category: string | null;
  /** The value the varied argument took in this row. `null` when the message has nothing to vary. */
  readonly sample: string | number | null;
  /** The rendered message. Plain text runs only: never markup to interpret. */
  readonly segments: readonly IcuSegment[];
}

/** Input for {@link previewIcuMessage}. */
export interface IcuPreviewInput {
  /** The resolved project config. Only its `format` is read. */
  readonly config: VerbatraConfig;
  /** The locale the message is rendered for. A locale this runtime's CLDR data does not know is refused as `unsupported-locale`. */
  readonly locale: string;
  /** The message text. Untrusted: a value over 20,000 characters or past the nesting and argument caps is refused rather than parsed. */
  readonly value: string;
  /** Sample values for the message's arguments, by name. Numbers drive plural and number arguments, and a number given for a date argument is read as milliseconds since the epoch. Names the message does not use are ignored. */
  readonly args?: Readonly<Record<string, string | number>>;
}

/**
 * What {@link previewIcuMessage} found.
 *
 * - `supported: false`: the configured format does not use ICU message syntax, so there is nothing
 *   to preview.
 * - `valid: false`: the message was refused, with the reason.
 * - `valid: true`: the message's arguments and its renderings.
 */
export type IcuPreviewResult =
  | { readonly supported: false; readonly reason: "not-icu" }
  | { readonly supported: true; readonly valid: false; readonly reason: IcuPreviewFailure }
  | {
      readonly supported: true;
      readonly valid: true;
      /** The message's arguments with the types verbatra infers for them. */
      readonly arguments: MessageArguments;
      /** One row per plural category, exact arm, or select option, varying one argument at a time. At most 24. */
      readonly rows: readonly IcuPreviewRow[];
      /** True when more than 24 rows existed. */
      readonly truncated: boolean;
    };

interface Variant {
  readonly category: string;
  readonly sample: IcuSampleValue;
}

interface PlannedAxis {
  readonly axis: IcuVariationAxis;
  readonly variants: readonly Variant[];
}

type SampleArguments = Readonly<Record<string, IcuSampleValue>>;

function withSample(base: SampleArguments, name: string, sample: IcuSampleValue): SampleArguments {
  return Object.assign(Object.create(null) as Record<string, IcuSampleValue>, base, {
    [name]: sample,
  });
}

function exactArmsOf(axes: readonly IcuVariationAxis[], argument: string): ReadonlySet<number> {
  return new Set(axes.filter((axis) => axis.argument === argument).flatMap((axis) => axis.exact));
}

function pluralVariants(
  axis: IcuVariationAxis,
  locale: string,
  avoid: ReadonlySet<number>,
): readonly Variant[] {
  const ruleType = axis.kind === "ordinal" ? "ordinal" : "cardinal";
  const categories = pluralCategoriesFor(locale, ruleType);
  const samples = pluralSamples({ locale, ruleType, offset: axis.offset, avoid, categories });
  const exact = axis.exact.map((count) => ({ category: `=${count}`, sample: count }));
  const byCategory = categories.flatMap((category) => {
    const sample = samples.get(category);
    return sample === undefined ? [] : [{ category, sample }];
  });
  return [...exact, ...byCategory];
}

function planAxes(axes: readonly IcuVariationAxis[], locale: string): readonly PlannedAxis[] {
  return axes.map((axis) => ({
    axis,
    variants:
      axis.kind === "select"
        ? axis.selectors.map((selector) => ({ category: selector, sample: selector }))
        : pluralVariants(axis, locale, exactArmsOf(axes, axis.argument)),
  }));
}

function defaultSamples(
  value: string,
  planned: readonly PlannedAxis[],
): { readonly defaults: SampleArguments; readonly names: ReadonlySet<string> } {
  const analysis = icuMessageArguments(value);
  const defaults = Object.create(null) as Record<string, IcuSampleValue>;
  const names = new Set<string>();
  for (const argument of analysis.valid ? analysis.arguments : []) {
    names.add(argument.name);
    if (argument.kinds.includes("number")) {
      defaults[argument.name] = NUMBER_ARGUMENT_SAMPLE;
    }
  }
  for (const { axis, variants } of planned) {
    const other = variants.find((variant) => variant.category === "other");
    if (axis.kind !== "select" && other !== undefined) {
      defaults[axis.argument] = other.sample;
    }
  }
  return { defaults, names };
}

function baseArguments(
  defaults: SampleArguments,
  names: ReadonlySet<string>,
  supplied: Readonly<Record<string, string | number>> | undefined,
): SampleArguments {
  let base = defaults;
  for (const name of names) {
    const sample =
      supplied !== undefined && Object.hasOwn(supplied, name) ? supplied[name] : undefined;
    if (typeof sample === "string" || typeof sample === "number") {
      base = withSample(base, name, sample);
    }
  }
  return base;
}

function* variedRows(
  planned: readonly PlannedAxis[],
): Generator<{ readonly axis: IcuVariationAxis; readonly variant: Variant }> {
  for (const { axis, variants } of planned) {
    for (const variant of variants) {
      yield { axis, variant };
    }
  }
}

interface RenderFailure {
  readonly reason: IcuPreviewFailure;
}

interface RenderedRows {
  readonly rows: readonly IcuPreviewRow[];
  readonly truncated: boolean;
}

type RowIdentity = Pick<IcuPreviewRow, "axis" | "argument" | "category" | "sample">;

const UNVARYING: RowIdentity = { axis: "none", argument: null, category: null, sample: null };

function renderRow(
  value: string,
  locale: string,
  args: SampleArguments,
  identity: RowIdentity,
): IcuPreviewRow | RenderFailure {
  const result = renderIcuMessage(value, locale, args);
  return result.valid ? { ...identity, segments: result.segments } : { reason: result.reason };
}

function isFailure(row: IcuPreviewRow | RenderFailure): row is RenderFailure {
  return !("segments" in row);
}

function renderVaried(
  value: string,
  locale: string,
  planned: readonly PlannedAxis[],
  base: SampleArguments,
): RenderedRows | RenderFailure {
  const rows: IcuPreviewRow[] = [];
  for (const { axis, variant } of variedRows(planned)) {
    if (rows.length === ICU_PREVIEW_MAX_ROWS) {
      return { rows, truncated: true };
    }
    const row = renderRow(value, locale, withSample(base, axis.argument, variant.sample), {
      axis: axis.kind,
      argument: axis.argument,
      category: variant.category,
      sample: variant.sample,
    });
    if (isFailure(row)) {
      return row;
    }
    rows.push(row);
  }
  return { rows, truncated: false };
}

function renderRows(
  value: string,
  locale: string,
  planned: readonly PlannedAxis[],
  base: SampleArguments,
): RenderedRows | RenderFailure {
  if (planned.length > 0) {
    return renderVaried(value, locale, planned, base);
  }
  const row = renderRow(value, locale, base, UNVARYING);
  return isFailure(row) ? row : { rows: [row], truncated: false };
}

/**
 * Renders an ICU message for a locale, one row per plural category, exact arm, or select option.
 *
 * Previews only the formats whose messages use ICU syntax, `next-intl-json` and `arb`; any other
 * format, including a `custom:` one, answers `supported: false`. The message is untrusted text and
 * the call never throws on it: an over-long, over-nested, malformed or otherwise unusable message,
 * or an unknown locale, comes back as `valid: false` with a reason. Numbers and dates are formatted
 * with this runtime's Node CLDR data, dates at a fixed instant in UTC, so the text can differ from
 * what an application's own runtime prints. Nothing is read from or written to disk.
 *
 * @param input - The config, locale, message and optional sample values.
 * @returns The preview, or why there is nothing to preview.
 */
export function previewIcuMessage(input: IcuPreviewInput): IcuPreviewResult {
  if (!isIcuMessageFormat(input.config.format)) {
    return { supported: false, reason: "not-icu" };
  }
  const { value } = input;
  const preflight = renderIcuMessage(value, input.locale, {});
  if (!preflight.valid) {
    return { supported: true, valid: false, reason: preflight.reason };
  }
  const { locale } = preflight;
  const planned = planAxes(icuVariationAxes(value), locale);
  const { defaults, names } = defaultSamples(value, planned);
  const outcome = renderRows(value, locale, planned, baseArguments(defaults, names, input.args));
  if ("reason" in outcome) {
    return { supported: true, valid: false, reason: outcome.reason };
  }
  return {
    supported: true,
    valid: true,
    arguments: describeIcuMessageArguments(value),
    rows: outcome.rows,
    truncated: outcome.truncated,
  };
}
