import {
  type DateElement,
  type MessageFormatElement,
  type NumberElement,
  type PluralElement,
  type PluralOrSelectOption,
  parse,
  type SelectElement,
  type TagElement,
  type TimeElement,
  TYPE,
} from "@formatjs/icu-messageformat-parser";
import { type IcuRefusal, icuRefusal } from "./limits.js";

/** Which part of a rendered message a segment came from. */
export type IcuSegmentKind = "text" | "argument" | "tag";

/** One run of a rendered message. `text` is always plain text, never markup to interpret. */
export interface IcuSegment {
  /** Literal message text, a substituted or formatted argument, or a tag boundary. */
  readonly kind: IcuSegmentKind;
  /** The text of this run. */
  readonly text: string;
}

export type IcuSampleValue = string | number;

export type IcuRenderArguments = Readonly<Record<string, IcuSampleValue>>;

export type IcuRenderFailure = IcuRefusal | "invalid-message" | "unsupported-locale" | "too-large";

export type IcuRenderResult =
  | { readonly valid: true; readonly locale: string; readonly segments: readonly IcuSegment[] }
  | { readonly valid: false; readonly reason: IcuRenderFailure };

export const ICU_SAMPLE_INSTANT = Date.UTC(2024, 2, 15, 14, 30, 45);

export const ICU_MAX_SAMPLE_TEXT = 256;

export const ICU_MAX_LOCALE_LENGTH = 64;

export const ICU_MAX_OUTPUT_LENGTH = 100_000;

const NUMBER_STYLES: ReadonlyMap<string, Intl.NumberFormatOptions> = new Map([
  ["integer", { maximumFractionDigits: 0 }],
  ["percent", { style: "percent" }],
]);

const DATE_STYLES: ReadonlyMap<string, Intl.DateTimeFormatOptions> = new Map([
  ["short", { month: "numeric", day: "numeric", year: "2-digit" }],
  ["medium", { month: "short", day: "numeric", year: "numeric" }],
  ["long", { month: "long", day: "numeric", year: "numeric" }],
  ["full", { weekday: "long", month: "long", day: "numeric", year: "numeric" }],
]);

const TIME_STYLES: ReadonlyMap<string, Intl.DateTimeFormatOptions> = new Map([
  ["short", { hour: "numeric", minute: "numeric" }],
  ["medium", { hour: "numeric", minute: "numeric", second: "numeric" }],
  ["long", { hour: "numeric", minute: "numeric", second: "numeric", timeZoneName: "short" }],
  ["full", { hour: "numeric", minute: "numeric", second: "numeric", timeZoneName: "short" }],
]);

const DEFAULT_TIME_STYLE = TIME_STYLES.get("medium");

interface RenderContext {
  readonly locale: string;
  readonly args: IcuRenderArguments;
  readonly segments: IcuSegment[];
  readonly numberFormats: Map<string, Intl.NumberFormat>;
  readonly pluralRules: Map<string, Intl.PluralRules>;
  remaining: number;
}

export function resolveIcuLocale(locale: string): string | undefined {
  if (locale.length === 0 || locale.length > ICU_MAX_LOCALE_LENGTH) {
    return undefined;
  }
  try {
    return Intl.PluralRules.supportedLocalesOf([locale.replaceAll("_", "-")])[0];
  } catch {
    return undefined;
  }
}

function emit(context: RenderContext, kind: IcuSegment["kind"], text: string): void {
  if (text.length === 0) {
    return;
  }
  context.remaining -= text.length;
  if (context.remaining < 0) {
    return;
  }
  const last = context.segments.at(-1);
  if (kind === "text" && last?.kind === "text") {
    context.segments[context.segments.length - 1] = { kind, text: last.text + text };
    return;
  }
  context.segments.push({ kind, text });
}

function sampleOf(context: RenderContext, name: string): IcuSampleValue | undefined {
  if (!Object.hasOwn(context.args, name)) {
    return undefined;
  }
  const sample = context.args[name];
  return typeof sample === "string" || typeof sample === "number" ? sample : undefined;
}

function numberSampleOf(context: RenderContext, name: string): number | undefined {
  const sample = sampleOf(context, name);
  return typeof sample === "number" ? sample : undefined;
}

function placeholder(name: string): string {
  return `{${name}}`;
}

function formatNumber(
  context: RenderContext,
  value: number,
  options: Intl.NumberFormatOptions | undefined,
): string | undefined {
  const cacheKey = JSON.stringify(options ?? null);
  try {
    let format = context.numberFormats.get(cacheKey);
    if (format === undefined) {
      format = new Intl.NumberFormat(context.locale, options);
      context.numberFormats.set(cacheKey, format);
    }
    return format.format(value);
  } catch {
    return undefined;
  }
}

function formatInstant(
  context: RenderContext,
  instant: number,
  options: Intl.DateTimeFormatOptions | undefined,
): string | undefined {
  try {
    return new Intl.DateTimeFormat(context.locale, { ...options, timeZone: "UTC" }).format(instant);
  } catch {
    return undefined;
  }
}

function parsedStyle<T extends object>(style: unknown): T | undefined {
  return typeof style === "object" && style !== null && "parsedOptions" in style
    ? (style.parsedOptions as T)
    : undefined;
}

function numberOptionsOf(element: NumberElement): Intl.NumberFormatOptions | undefined {
  if (typeof element.style === "string") {
    return NUMBER_STYLES.get(element.style);
  }
  return parsedStyle<Intl.NumberFormatOptions>(element.style);
}

function dateOptionsOf(
  element: DateElement | TimeElement,
  styles: ReadonlyMap<string, Intl.DateTimeFormatOptions>,
  fallback: Intl.DateTimeFormatOptions | undefined,
): Intl.DateTimeFormatOptions | undefined {
  if (typeof element.style === "string") {
    return styles.get(element.style);
  }
  return parsedStyle<Intl.DateTimeFormatOptions>(element.style) ?? fallback;
}

function renderNumber(context: RenderContext, element: NumberElement): void {
  const value = numberSampleOf(context, element.value);
  if (value === undefined) {
    emit(context, "argument", placeholder(element.value));
    return;
  }
  const options = numberOptionsOf(element);
  const scale = (options as { scale?: number } | undefined)?.scale;
  const scaled = typeof scale === "number" ? value * scale : value;
  const text = formatNumber(context, scaled, options) ?? formatNumber(context, scaled, undefined);
  emit(context, "argument", text ?? String(scaled));
}

function renderDate(context: RenderContext, element: DateElement | TimeElement): void {
  const options =
    element.type === TYPE.date
      ? dateOptionsOf(element, DATE_STYLES, undefined)
      : dateOptionsOf(element, TIME_STYLES, DEFAULT_TIME_STYLE);
  const instant = numberSampleOf(context, element.value) ?? ICU_SAMPLE_INSTANT;
  emit(context, "argument", formatInstant(context, instant, options) ?? placeholder(element.value));
}

function renderArgument(context: RenderContext, name: string): void {
  const sample = sampleOf(context, name);
  emit(
    context,
    "argument",
    sample === undefined ? placeholder(name) : String(sample).slice(0, ICU_MAX_SAMPLE_TEXT),
  );
}

function ownOption(
  options: Readonly<Record<string, PluralOrSelectOption>>,
  selector: string,
): PluralOrSelectOption | undefined {
  return Object.hasOwn(options, selector) ? options[selector] : undefined;
}

function pluralCategoryOf(context: RenderContext, element: PluralElement, count: number): string {
  const type = element.pluralType === "ordinal" ? "ordinal" : "cardinal";
  let rules = context.pluralRules.get(type);
  if (rules === undefined) {
    rules = new Intl.PluralRules(context.locale, { type });
    context.pluralRules.set(type, rules);
  }
  return rules.select(count - element.offset);
}

function pluralArm(
  context: RenderContext,
  element: PluralElement,
  count: number,
): PluralOrSelectOption | undefined {
  return (
    ownOption(element.options, `=${count}`) ??
    ownOption(element.options, pluralCategoryOf(context, element, count)) ??
    ownOption(element.options, "other")
  );
}

function renderPlural(context: RenderContext, element: PluralElement): void {
  const count = numberSampleOf(context, element.value);
  const arm =
    count === undefined ? ownOption(element.options, "other") : pluralArm(context, element, count);
  if (arm !== undefined) {
    renderElements(context, arm.value, count === undefined ? undefined : count - element.offset);
  }
}

function renderSelect(
  context: RenderContext,
  element: SelectElement,
  pound: number | undefined,
): void {
  const sample = sampleOf(context, element.value);
  const arm =
    (sample === undefined ? undefined : ownOption(element.options, String(sample))) ??
    ownOption(element.options, "other");
  if (arm !== undefined) {
    renderElements(context, arm.value, pound);
  }
}

function renderTag(context: RenderContext, element: TagElement, pound: number | undefined): void {
  emit(context, "tag", `<${element.value}>`);
  renderElements(context, element.children, pound);
  emit(context, "tag", `</${element.value}>`);
}

function renderPound(context: RenderContext, pound: number | undefined): void {
  const text = pound === undefined ? undefined : formatNumber(context, pound, undefined);
  emit(context, "argument", text ?? "#");
}

function renderElement(
  context: RenderContext,
  element: MessageFormatElement,
  pound: number | undefined,
): void {
  switch (element.type) {
    case TYPE.literal:
      emit(context, "text", element.value);
      break;
    case TYPE.argument:
      renderArgument(context, element.value);
      break;
    case TYPE.number:
      renderNumber(context, element);
      break;
    case TYPE.date:
    case TYPE.time:
      renderDate(context, element);
      break;
    case TYPE.select:
      renderSelect(context, element, pound);
      break;
    case TYPE.plural:
      renderPlural(context, element);
      break;
    case TYPE.pound:
      renderPound(context, pound);
      break;
    case TYPE.tag:
      renderTag(context, element, pound);
      break;
  }
}

function renderElements(
  context: RenderContext,
  elements: readonly MessageFormatElement[],
  pound: number | undefined,
): void {
  for (const element of elements) {
    renderElement(context, element, pound);
  }
}

function parseOrUndefined(value: string, locale: string): MessageFormatElement[] | undefined {
  try {
    return parse(value, { locale: new Intl.Locale(locale) });
  } catch {
    return undefined;
  }
}

export function renderIcuMessage(
  value: string,
  locale: string,
  args: IcuRenderArguments,
): IcuRenderResult {
  const refusal = icuRefusal(value);
  if (refusal !== undefined) {
    return { valid: false, reason: refusal };
  }
  const resolved = resolveIcuLocale(locale);
  if (resolved === undefined) {
    return { valid: false, reason: "unsupported-locale" };
  }
  const ast = parseOrUndefined(value, resolved);
  if (ast === undefined) {
    return { valid: false, reason: "invalid-message" };
  }
  const context: RenderContext = {
    locale: resolved,
    args,
    segments: [],
    numberFormats: new Map(),
    pluralRules: new Map(),
    remaining: ICU_MAX_OUTPUT_LENGTH,
  };
  renderElements(context, ast, undefined);
  return context.remaining < 0
    ? { valid: false, reason: "too-large" }
    : { valid: true, locale: resolved, segments: context.segments };
}
