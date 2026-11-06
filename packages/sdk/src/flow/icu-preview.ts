import {
  createIcuRenderBudget,
  type IcuAxisOccurrence,
  type IcuAxisStep,
  type IcuMessageArguments,
  type IcuPreparedMessage,
  type IcuSampleValue,
  type IcuSegment,
  type IcuVariationAxis,
  icuExactArmValue,
  icuMessageArguments,
  icuVariationAxesOf,
  prepareIcuMessage,
  renderPreparedIcuMessage,
} from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultPluralSample, NUMBER_ARGUMENT_SAMPLE } from "./icu-preview-samples.js";
import {
  type ArmConstraint,
  createSolver,
  type Solution,
  type Solver,
} from "./icu-preview-solve.js";
import {
  describeIcuAnalysis,
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
 * - `too-complex`: the message nests deeper than 16 braces or has more than 256 `{` and `<` characters.
 * - `invalid-message`: the message does not parse as ICU.
 * - `unsupported-locale`: this runtime's CLDR data does not know the locale, or it is malformed.
 * - `too-large`: the first row alone would render more than 100,000 characters or 5,000 segments.
 */
export type IcuPreviewFailure =
  | "too-long"
  | "too-complex"
  | "invalid-message"
  | "unsupported-locale"
  | "too-large";

/** One rendering of a message with one argument varied. Arguments that enclose it are held at the arm that contains it. */
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
  /** The message text. Untrusted: a value over 20,000 characters, nested deeper than 16 braces, or with more than 256 `{` and `<` characters is refused rather than parsed. */
  readonly value: string;
  /** Sample values for the message's arguments, by name. Numbers drive plural and number arguments, and a number given for a date argument is read as milliseconds since the epoch. Names the message does not use are ignored, and so is the sample for an argument a row varies or holds at an enclosing arm. */
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
      /** True when rows were left out: more than 24 existed, the rows shared out their 100,000-character or 5,000-segment output budget, or a plural category had no sample within the search bound. */
      readonly truncated: boolean;
    };

interface Candidate {
  readonly axis: IcuVariationAxis;
  readonly label: string;
  readonly solution: Solution;
}

type Resolution =
  | { readonly kind: "found"; readonly solution: Solution }
  | { readonly kind: "unreachable" }
  | { readonly kind: "lost" };

type SampleArguments = Readonly<Record<string, IcuSampleValue>>;

function withSamples(
  base: SampleArguments,
  samples: Iterable<readonly [string, IcuSampleValue]>,
): SampleArguments {
  const next = Object.assign(Object.create(null) as Record<string, IcuSampleValue>, base);
  for (const [name, sample] of samples) {
    next[name] = sample;
  }
  return next;
}

function ruleTypeOf(axis: IcuVariationAxis): "cardinal" | "ordinal" {
  return axis.kind === "ordinal" ? "ordinal" : "cardinal";
}

function labelsOf(axis: IcuVariationAxis, locale: string): readonly string[] {
  const written = new Set(axis.occurrences.flatMap((occurrence) => occurrence.options));
  if (axis.kind === "select") {
    return [...written];
  }
  const exact = [...written].filter((option) => icuExactArmValue(option) !== undefined);
  return [...exact, ...pluralCategoriesFor(locale, ruleTypeOf(axis))];
}

function occurrencesFor(
  axis: IcuVariationAxis,
  label: string,
  byCategory: boolean,
): readonly IcuAxisOccurrence[] {
  const naming = axis.occurrences.filter((occurrence) => occurrence.options.includes(label));
  if (!byCategory) {
    return naming;
  }
  return [...naming, ...axis.occurrences.filter((occurrence) => !naming.includes(occurrence))];
}

function targetStep(
  axis: IcuVariationAxis,
  occurrence: IcuAxisOccurrence,
  label: string,
): IcuAxisStep {
  return {
    argument: axis.argument,
    kind: axis.kind,
    offset: occurrence.offset,
    options: occurrence.options,
    selector: label,
  };
}

function withoutExactArms(step: IcuAxisStep): IcuAxisStep {
  return {
    ...step,
    options: step.options.filter((option) => icuExactArmValue(option) === undefined),
  };
}

function classify(
  solve: Solver,
  ancestors: readonly ArmConstraint[],
  target: ArmConstraint,
): Resolution {
  if (ancestors.some((constraint) => solve([constraint]) === undefined)) {
    return { kind: "unreachable" };
  }
  if (solve([target]) === undefined) {
    const intercepted =
      target.byCategory &&
      solve([{ ...target, step: withoutExactArms(target.step) }]) !== undefined;
    return { kind: intercepted ? "unreachable" : "lost" };
  }
  return { kind: "lost" };
}

function resolveLabel(solve: Solver, axis: IcuVariationAxis, label: string): Resolution {
  const byCategory = axis.kind !== "select" && icuExactArmValue(label) === undefined;
  let lost = false;
  for (const occurrence of occurrencesFor(axis, label, byCategory)) {
    const ancestors = occurrence.path.map((step) => ({ step, byCategory: false }));
    const target = { step: targetStep(axis, occurrence, label), byCategory };
    const solution = solve([...ancestors, target]);
    if (solution !== undefined) {
      return { kind: "found", solution };
    }
    lost = lost || classify(solve, ancestors, target).kind === "lost";
  }
  return lost ? { kind: "lost" } : { kind: "unreachable" };
}

function candidatesOf(
  axes: readonly IcuVariationAxis[],
  locale: string,
): { readonly groups: readonly (readonly Candidate[])[]; readonly incomplete: boolean } {
  const solve = createSolver(locale);
  let incomplete = false;
  const groups = axes.map((axis) => {
    const found: Candidate[] = [];
    for (const label of labelsOf(axis, locale)) {
      const resolution = resolveLabel(solve, axis, label);
      if (resolution.kind === "found") {
        found.push({ axis, label, solution: resolution.solution });
      }
      incomplete = incomplete || resolution.kind === "lost";
    }
    return found;
  });
  return { groups, incomplete };
}

function exactValuesOf(axes: readonly IcuVariationAxis[], argument: string): ReadonlySet<number> {
  const exact = new Set<number>();
  for (const axis of axes) {
    for (const occurrence of axis.occurrences) {
      for (const option of axis.argument === argument ? occurrence.options : []) {
        const value = icuExactArmValue(option);
        if (value !== undefined) {
          exact.add(value);
        }
      }
    }
  }
  return exact;
}

function defaultSamples(
  analysis: IcuMessageArguments,
  axes: readonly IcuVariationAxis[],
  locale: string,
): { readonly defaults: SampleArguments; readonly names: ReadonlySet<string> } {
  const defaults = Object.create(null) as Record<string, IcuSampleValue>;
  const names = new Set<string>();
  for (const argument of analysis.valid ? analysis.arguments : []) {
    names.add(argument.name);
    if (argument.kinds.includes("number")) {
      defaults[argument.name] = NUMBER_ARGUMENT_SAMPLE;
    }
  }
  for (const axis of axes) {
    const first = axis.occurrences[0];
    if (axis.kind !== "select" && first !== undefined && !Object.hasOwn(defaults, axis.argument)) {
      defaults[axis.argument] = defaultPluralSample(
        locale,
        ruleTypeOf(axis),
        first.offset,
        exactValuesOf(axes, axis.argument),
      );
    }
  }
  return { defaults, names };
}

function baseArguments(
  defaults: SampleArguments,
  names: ReadonlySet<string>,
  supplied: Readonly<Record<string, string | number>> | undefined,
): SampleArguments {
  const given: (readonly [string, IcuSampleValue])[] = [];
  for (const name of names) {
    const sample =
      supplied !== undefined && Object.hasOwn(supplied, name) ? supplied[name] : undefined;
    if (sample !== undefined) {
      given.push([name, sample]);
    }
  }
  return withSamples(defaults, given);
}

function chooseRows(groups: readonly (readonly Candidate[])[]): {
  readonly chosen: readonly Candidate[];
  readonly truncated: boolean;
} {
  const all = groups.flat();
  if (all.length <= ICU_PREVIEW_MAX_ROWS) {
    return { chosen: all, truncated: false };
  }
  const taken = new Set<Candidate>();
  for (let round = 0; taken.size < ICU_PREVIEW_MAX_ROWS; round += 1) {
    for (const group of groups) {
      const candidate = group[round];
      if (candidate !== undefined && taken.size < ICU_PREVIEW_MAX_ROWS) {
        taken.add(candidate);
      }
    }
  }
  return { chosen: all.filter((candidate) => taken.has(candidate)), truncated: true };
}

interface RenderedRows {
  readonly rows: readonly IcuPreviewRow[];
  readonly exhausted: boolean;
}

function renderChosen(
  prepared: IcuPreparedMessage,
  base: SampleArguments,
  chosen: readonly Candidate[],
): RenderedRows | { readonly reason: IcuPreviewFailure } {
  const budget = createIcuRenderBudget();
  const rows: IcuPreviewRow[] = [];
  for (const { axis, label, solution } of chosen) {
    const args = withSamples(base, solution);
    const result = renderPreparedIcuMessage(prepared, args, budget);
    if (!result.valid) {
      return rows.length === 0 ? { reason: result.reason } : { rows, exhausted: true };
    }
    rows.push({
      axis: axis.kind,
      argument: axis.argument,
      category: label,
      sample: solution.get(axis.argument) ?? null,
      segments: result.segments,
    });
  }
  return { rows, exhausted: false };
}

function renderUnvarying(
  prepared: IcuPreparedMessage,
  base: SampleArguments,
): RenderedRows | { readonly reason: IcuPreviewFailure } {
  const result = renderPreparedIcuMessage(prepared, base, createIcuRenderBudget());
  if (!result.valid) {
    return { reason: result.reason };
  }
  const row: IcuPreviewRow = {
    axis: "none",
    argument: null,
    category: null,
    sample: null,
    segments: result.segments,
  };
  return { rows: [row], exhausted: false };
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
 * Each row varies one argument and holds the others at `args` or a default. A row for an argument
 * nested inside another argument's arm also holds that enclosing argument at the arm, so the row
 * shows the arm it names; the `args` value for an argument a row varies or holds this way is
 * ignored in that row. An argument that appears in several places gets one row per arm, using the
 * first place that can show it. The rows share one output budget; when it runs out, or more than
 * 24 rows exist, the rest are left out and `truncated` is set.
 *
 * @param input - The config, locale, message and optional sample values.
 * @returns The preview, or why there is nothing to preview.
 */
export function previewIcuMessage(input: IcuPreviewInput): IcuPreviewResult {
  if (!isIcuMessageFormat(input.config.format)) {
    return { supported: false, reason: "not-icu" };
  }
  const preparation = prepareIcuMessage(input.value, input.locale);
  if (!preparation.valid) {
    return { supported: true, valid: false, reason: preparation.reason };
  }
  const { prepared } = preparation;
  const axes = icuVariationAxesOf(prepared.ast);
  const { groups, incomplete } = candidatesOf(axes, prepared.locale);
  const analysis = icuMessageArguments(input.value);
  const { defaults, names } = defaultSamples(analysis, axes, prepared.locale);
  const base = baseArguments(defaults, names, input.args);
  const selection = chooseRows(groups);
  const outcome =
    selection.chosen.length === 0
      ? renderUnvarying(prepared, base)
      : renderChosen(prepared, base, selection.chosen);
  if ("reason" in outcome) {
    return { supported: true, valid: false, reason: outcome.reason };
  }
  return {
    supported: true,
    valid: true,
    arguments: describeIcuAnalysis(analysis),
    rows: outcome.rows,
    truncated: selection.truncated || outcome.exhausted || incomplete,
  };
}
