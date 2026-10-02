import type { ReviewFlag } from "@verbatra/ai-providers";
import {
  type FormatId,
  foreignPlaceholderTokens,
  isCustomFormatId,
  type LocaleResource,
  missingForeignPlaceholders,
  type PlaceholderSyntax,
  type SupportedFormat,
} from "@verbatra/core";
import type { SdkNotice } from "./summary.js";

const BRACE_WRAPPED: readonly PlaceholderSyntax[] = ["single-brace", "ruby", "dollar-brace"];

export const NATIVE_PLACEHOLDER_SYNTAXES: Readonly<
  Record<SupportedFormat, readonly PlaceholderSyntax[]>
> = {
  "i18next-json": ["double-brace"],
  "vue-i18n-json": BRACE_WRAPPED,
  "next-intl-json": BRACE_WRAPPED,
  "ngx-translate-json": ["double-brace"],
  xliff: ["double-brace", ...BRACE_WRAPPED],
  yaml: ["double-brace"],
  arb: BRACE_WRAPPED,
  properties: BRACE_WRAPPED,
  "apple-strings": ["printf"],
  "apple-xcstrings": ["printf"],
  "android-xml": ["printf"],
  "gettext-po": ["printf", "python-named"],
  ini: BRACE_WRAPPED,
  resx: ["double-brace", ...BRACE_WRAPPED],
};

const NOTICE_KEY_LIMIT = 5;

function nativeSyntaxesOf(format: FormatId): readonly PlaceholderSyntax[] | undefined {
  return isCustomFormatId(format) ? undefined : NATIVE_PLACEHOLDER_SYNTAXES[format];
}

export function droppedForeignPlaceholders(
  format: FormatId,
  source: string,
  target: string,
): readonly string[] {
  const native = nativeSyntaxesOf(format);
  return native === undefined ? [] : missingForeignPlaceholders(source, target, native);
}

export function withDroppedPlaceholderReason(
  flag: ReviewFlag | undefined,
  dropped: readonly string[],
): ReviewFlag | undefined {
  if (dropped.length === 0) {
    return flag;
  }
  return { status: "review", reasons: [...(flag?.reasons ?? []), "FOREIGN_PLACEHOLDER_CHANGED"] };
}

export function withForeignPlaceholderReason(
  flag: ReviewFlag | undefined,
  format: FormatId,
  source: string,
  target: string,
): ReviewFlag | undefined {
  return withDroppedPlaceholderReason(flag, droppedForeignPlaceholders(format, source, target));
}

function keysWithForeignPlaceholders(
  source: LocaleResource,
  keys: readonly string[],
  native: readonly PlaceholderSyntax[],
): readonly string[] {
  return keys.filter((key) => {
    const value = source.entries.get(key)?.value;
    return value !== undefined && foreignPlaceholderTokens(value, native).length > 0;
  });
}

function noticeMessage(format: SupportedFormat, keys: readonly string[]): string {
  const shown = keys.slice(0, NOTICE_KEY_LIMIT).map((key) => JSON.stringify(key));
  const more = keys.length > shown.length ? `, and ${keys.length - shown.length} more` : "";
  const count = keys.length === 1 ? "1 source value holds" : `${keys.length} source values hold`;
  return (
    `${count} a placeholder-like token that ${format} does not protect: ` +
    `${shown.join(", ")}${more}. These tokens are not protected during translation, so review ` +
    "the translations, or switch the syntax if your library does not interpolate them."
  );
}

export function sourceForeignPlaceholderNotice(
  format: FormatId,
  source: LocaleResource,
  pendingKeys: readonly string[],
): SdkNotice | undefined {
  if (isCustomFormatId(format)) {
    return undefined;
  }
  const keys = keysWithForeignPlaceholders(
    source,
    pendingKeys,
    NATIVE_PLACEHOLDER_SYNTAXES[format],
  );
  return keys.length === 0
    ? undefined
    : { code: "SOURCE_FOREIGN_PLACEHOLDERS", message: noticeMessage(format, keys) };
}
