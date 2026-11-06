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
  icuPluralSampleOf,
  icuVariationAxesOf,
  prepareIcuMessage,
  renderPreparedIcuMessage,
} from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultPluralSample, NUMBER_ARGUMENT_SAMPLE } from "./icu-preview-samples.js";
import {
  type ArmSelector,
  createArmSelector,
  createSolver,
  exactValuesOf as exactValuesOfOptions,
  ruleTypeOf,
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

/** One rendering of a message with one argument varied. Arguments that enclose it are held at the arm that contains it; `category` repeats when the same arm appears in several places. */
export interface IcuPreviewRow {
  /** What the row varies: a cardinal plural, an ordinal plural, a select, or `none`. */
  readonly axis: IcuPreviewAxis;
  /** The argument the row varies, or `null` when the message has none to vary. */
  readonly argument: string | null;
  /** The plural category, an exact arm such as `=0`, or the select option the row shows; for a row showing a value you supplied, the arm that value selects. `null` when the message has nothing to vary. */
  readonly category: string | null;
  /** The value the varied argument took in this row. `null` when the message has nothing to vary. */
  readonly sample: string | number | null;
  /** True for the row that shows a value you supplied in `args` for this argument rather than one of its arms. */
  readonly supplied: boolean;
  /** The enclosing arguments this row holds at the arm that contains the varied argument, by name. Empty when the varied argument is not nested. */
  readonly held: Readonly<Record<string, string | number>>;
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
  /** Sample values for the message's arguments, by name. Numbers drive plural and number arguments, and a number given for a date argument is read as milliseconds since the epoch. Names the message does not use are ignored. A value for a plural, ordinal or select argument adds a row showing it for each place that value reaches an arm of that argument, and in the ordinary rows is replaced by the arm each row shows. A number text such as `"5"` reads as the number, as the runtime does. */
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
      /** True when a reachable arm has no row because the preview needed more than 24 rows or ran out of its shared 100,000-character or 5,000-segment output budget. Arms no input can reach do not set it. */
      readonly truncated: boolean;
    };

interface Candidate {
  readonly axis: IcuVariationAxis;
  readonly label: string;
  readonly solution: Solution;
  readonly sample: IcuSampleValue;
  readonly rank: number;
  readonly held: Readonly<Record<string, IcuSampleValue>>;
  readonly supplied: boolean;
}

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

function labelsOf(axis: IcuVariationAxis, locale: string): readonly string[] {
  const written = new Set(axis.occurrences.flatMap((occurrence) => occurrence.options));
  if (axis.kind === "select") {
    return [...written];
  }
  const exact = [...written].filter((option) => icuExactArmValue(option) !== undefined);
  return [...exact, ...pluralCategoriesFor(locale, ruleTypeOf(axis.kind))];
}

function occurrencesFor(
  axis: IcuVariationAxis,
  label: string,
  byCategory: boolean,
): readonly IcuAxisOccurrence[] {
  const naming = axis.occurrences.filter((occurrence) => occurrence.options.includes(label));
  return byCategory && naming.length === 0 ? axis.occurrences : naming;
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

function solutionsFor(solve: Solver, axis: IcuVariationAxis, label: string): readonly Solution[] {
  const byCategory = axis.kind !== "select" && icuExactArmValue(label) === undefined;
  const found = occurrencesFor(axis, label, byCategory).flatMap((occurrence) => {
    const ancestors = occurrence.path.map((step) => ({ step, byCategory: false }));
    const target = { step: targetStep(axis, occurrence, label), byCategory };
    const solution = solve([...ancestors, target]);
    return solution === undefined ? [] : [solution];
  });
  return axis.occurrences.some((occurrence) => occurrence.options.includes(label))
    ? found
    : found.slice(0, 1);
}

function heldOf(solution: Solution, argument: string): Readonly<Record<string, IcuSampleValue>> {
  return Object.fromEntries([...solution].filter(([name]) => name !== argument));
}

function armLabelOf(
  axis: IcuVariationAxis,
  occurrence: IcuAxisOccurrence,
  value: IcuSampleValue,
  locale: string,
): string {
  if (axis.kind === "select") {
    return occurrence.options.includes(String(value)) ? String(value) : "other";
  }
  const plural = icuPluralSampleOf(value);
  if (plural === undefined) {
    return "other";
  }
  const exact = `=${plural.key}`;
  if (occurrence.options.includes(exact)) {
    return exact;
  }
  const category = new Intl.PluralRules(locale, { type: ruleTypeOf(axis.kind) }).select(
    plural.count - occurrence.offset,
  );
  return occurrence.options.includes(category) ? category : "other";
}

function reachedBy(
  solve: Solver,
  selects: ArmSelector,
  axis: IcuVariationAxis,
  occurrence: IcuAxisOccurrence,
  value: IcuSampleValue,
): Solution | undefined {
  const own = occurrence.path.filter((step) => step.argument === axis.argument);
  if (!own.every((step) => selects(step, value))) {
    return undefined;
  }
  const others = occurrence.path.filter((step) => step.argument !== axis.argument);
  return solve(others.map((step) => ({ step, byCategory: false })));
}

function suppliedCandidate(
  solve: Solver,
  selects: ArmSelector,
  axis: IcuVariationAxis,
  value: IcuSampleValue,
  locale: string,
): readonly Candidate[] {
  for (const occurrence of axis.occurrences) {
    const held = reachedBy(solve, selects, axis, occurrence, value);
    if (held !== undefined) {
      return [
        {
          axis,
          label: armLabelOf(axis, occurrence, value, locale),
          solution: new Map(held).set(axis.argument, value),
          sample: value,
          rank: -1,
          held: heldOf(held, axis.argument),
          supplied: true,
        },
      ];
    }
  }
  return [];
}

function candidatesOf(
  axes: readonly IcuVariationAxis[],
  locale: string,
  supplied: Readonly<Record<string, string | number>> | undefined,
): readonly (readonly Candidate[])[] {
  const solve = createSolver(locale);
  const selects = createArmSelector(locale);
  return axes.map((axis) => {
    const arms = labelsOf(axis, locale).flatMap((label) =>
      solutionsFor(solve, axis, label).map((solution, rank) => ({
        axis,
        label,
        solution,
        sample: solution.get(axis.argument) as IcuSampleValue,
        rank: Math.min(rank, 1),
        held: heldOf(solution, axis.argument),
        supplied: false,
      })),
    );
    const given =
      supplied !== undefined && Object.hasOwn(supplied, axis.argument)
        ? supplied[axis.argument]
        : undefined;
    return given === undefined
      ? arms
      : [...arms, ...suppliedCandidate(solve, selects, axis, given, locale)];
  });
}

function exactValuesOf(axes: readonly IcuVariationAxis[], argument: string): ReadonlySet<number> {
  const exact = new Set<number>();
  for (const axis of axes) {
    for (const occurrence of axis.occurrences) {
      for (const value of axis.argument === argument
        ? exactValuesOfOptions(occurrence.options)
        : []) {
        exact.add(value);
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
  const pluralSet = new Set<string>();
  for (const axis of axes) {
    const first = axis.occurrences[0];
    if (axis.kind !== "select" && first !== undefined && !pluralSet.has(axis.argument)) {
      pluralSet.add(axis.argument);
      defaults[axis.argument] = defaultPluralSample(
        locale,
        ruleTypeOf(axis.kind),
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

function interleave(groups: readonly (readonly Candidate[])[]): readonly Candidate[] {
  const ordered = groups.map((group) =>
    [...group].sort((first, second) => first.rank - second.rank),
  );
  const sequence: Candidate[] = [];
  const longest = Math.max(0, ...ordered.map((group) => group.length));
  for (let round = 0; round < longest; round += 1) {
    for (const group of ordered) {
      const candidate = group[round];
      if (candidate !== undefined) {
        sequence.push(candidate);
      }
    }
  }
  return sequence;
}

interface RenderedRows {
  readonly rows: readonly IcuPreviewRow[];
  readonly truncated: boolean;
}

function signatureOf(segments: readonly IcuSegment[]): string {
  return segments.map((segment) => `${segment.kind}:${segment.text}`).join("\u0000");
}

function renderCandidates(
  prepared: IcuPreparedMessage,
  base: SampleArguments,
  groups: readonly (readonly Candidate[])[],
): RenderedRows | { readonly reason: IcuPreviewFailure } {
  const budget = createIcuRenderBudget();
  const order = new Map(groups.flat().map((candidate, index) => [candidate, index]));
  const kept: { readonly index: number; readonly row: IcuPreviewRow }[] = [];
  const seen = new Set<string>();
  let truncated = false;
  for (const candidate of interleave(groups)) {
    if (kept.length === ICU_PREVIEW_MAX_ROWS) {
      truncated = true;
      break;
    }
    const result = renderPreparedIcuMessage(
      prepared,
      withSamples(base, candidate.solution),
      budget,
    );
    if (!result.valid) {
      if (kept.length === 0) {
        return { reason: result.reason };
      }
      truncated = true;
      break;
    }
    const signature = [
      `${candidate.supplied ? "supplied " : ""}${candidate.axis.kind}`,
      candidate.axis.argument,
      candidate.label,
      signatureOf(result.segments),
    ].join("\u0001");
    if (!seen.has(signature)) {
      seen.add(signature);
      kept.push({
        index: order.get(candidate) as number,
        row: {
          axis: candidate.axis.kind,
          argument: candidate.axis.argument,
          category: candidate.label,
          sample: candidate.sample,
          held: candidate.held,
          supplied: candidate.supplied,
          segments: result.segments,
        },
      });
    }
  }
  kept.sort((first, second) => first.index - second.index);
  return { rows: kept.map((entry) => entry.row), truncated };
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
    held: {},
    supplied: false,
    segments: result.segments,
  };
  return { rows: [row], truncated: false };
}

/**
 * Renders an ICU message for a locale, one row per arm: each plural category, exact arm and select
 * option, and each place one of them appears.
 *
 * Previews only the formats whose messages use ICU syntax, `next-intl-json` and `arb`; any other
 * format, including a `custom:` one, answers `supported: false`. The message is untrusted text and
 * the call never throws on it: an over-long, over-nested, malformed or otherwise unusable message,
 * or an unknown locale, comes back as `valid: false` with a reason. Numbers and dates are formatted
 * with this runtime's Node CLDR data, dates at a fixed instant in UTC unless a number in `args` sets the instant, so the text can differ from
 * what an application's own runtime prints. Nothing is read from or written to disk.
 *
 * Each row varies one argument and holds the others at `args` or a default. A row for an argument
 * nested inside another argument's arm also holds that enclosing argument at the arm, so the row
 * shows the arm it names; the `args` value for an argument a row varies or holds this way is
 * replaced in that row, and a value you give for a plural, ordinal or select argument adds one row of its own for each axis that argument drives, a plural, an ordinal or a select, placed after that axis's rows and marked `supplied`; its `category` is the arm the value selects at the first place it reaches one, and a value that reaches no arm of an axis adds no row for it. Text that is not a number selects `other` in a plural, where `#` stays `#`. `held` lists the enclosing arguments a row holds, so nested rows can be told apart. The supplied rows count toward the 24 rows and the output budget. An arm that appears in several places gets a row for each place, and rows with
 * the same label and the same text collapse into one. The rows share one output budget; when it runs
 * out, or more than 24 rows exist, the rest are left out and `truncated` is set.
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
  const groups = candidatesOf(axes, prepared.locale, input.args);
  const analysis = icuMessageArguments(input.value);
  const { defaults, names } = defaultSamples(analysis, axes, prepared.locale);
  const base = baseArguments(defaults, names, input.args);
  const outcome =
    groups.flat().length === 0
      ? renderUnvarying(prepared, base)
      : renderCandidates(prepared, base, groups);
  if ("reason" in outcome) {
    return { supported: true, valid: false, reason: outcome.reason };
  }
  return {
    supported: true,
    valid: true,
    arguments: describeIcuAnalysis(analysis),
    rows: outcome.rows,
    truncated: outcome.truncated,
  };
}
