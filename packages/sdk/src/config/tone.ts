import type { Tone } from "@verbatra/ai-providers";
import { z } from "zod";
import { caseInsensitiveRepeats, didYouMeanHint } from "./case-insensitive.js";

const DEFAULT_TONE_KEY = "default";

const toneSchema = z.enum(["formal", "informal", "neutral"]);

const TONE_NAMES = toneSchema.options;

function offendingEntries(input: unknown): readonly string[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [];
  }
  return Object.entries(input)
    .filter(([, value]) => !(TONE_NAMES as readonly unknown[]).includes(value))
    .map(([key, value]) => `tone.${key} is ${JSON.stringify(value)}`);
}

export const toneConfigSchema = z.union([toneSchema, z.record(z.string(), toneSchema)], {
  error: (issue) => {
    const offenders = offendingEntries(issue.input);
    const where = offenders.length === 0 ? "" : ` (${offenders.join(", ")})`;
    return (
      `tone must be formal, informal or neutral, or a map from a target locale (or ` +
      `"${DEFAULT_TONE_KEY}") to one of them${where}`
    );
  },
});

/**
 * The `tone` setting: one {@link Tone} for every target locale, or a map from a target locale (spelled
 * exactly as in `targetLocales`) to its own tone. The reserved key `default` covers every target
 * locale the map does not name. Read it per locale through {@link toneForLocale}.
 */
export type ToneConfig = z.infer<typeof toneConfigSchema>;

/**
 * Resolves the {@link Tone} that applies to one target locale. A scalar tone applies to every
 * locale. A map answers with the entry for that exact locale, then with its `default` entry, then
 * with `undefined`. Locale keys are matched exactly, with no base-language fallback.
 *
 * @param tone - The configured `tone`, scalar or map, or `undefined` when none is set.
 * @param locale - A target locale, spelled as in `targetLocales`.
 * @returns The tone for that locale, or `undefined` when none applies.
 */
export function toneForLocale(tone: ToneConfig | undefined, locale: string): Tone | undefined {
  if (tone === undefined || typeof tone === "string") {
    return tone;
  }
  if (Object.hasOwn(tone, locale)) {
    return tone[locale];
  }
  return Object.hasOwn(tone, DEFAULT_TONE_KEY) ? tone[DEFAULT_TONE_KEY] : undefined;
}

interface ToneScope {
  readonly targetLocales: readonly string[];
  readonly tone?: ToneConfig | undefined;
}

interface ToneMapIssue {
  readonly path: readonly string[];
  readonly message: string;
}

function unknownKeyMessage(key: string, targets: readonly string[]): string {
  const hint = didYouMeanHint(key, [DEFAULT_TONE_KEY, ...targets]);
  return (
    `"${key}" is not a target locale: a tone map key must be "${DEFAULT_TONE_KEY}" or one of ` +
    `targetLocales, spelled as configured${hint}`
  );
}

export function findToneMapIssues(scope: ToneScope): readonly ToneMapIssue[] {
  const { tone } = scope;
  if (tone === undefined || typeof tone === "string") {
    return [];
  }
  const keys = Object.keys(tone);
  if (keys.length === 0) {
    return [
      {
        path: [],
        message: `a tone map must name at least one target locale or "${DEFAULT_TONE_KEY}"`,
      },
    ];
  }
  const repeats = new Set(caseInsensitiveRepeats(keys));
  return keys.flatMap((key): readonly ToneMapIssue[] => {
    if (repeats.has(key)) {
      return [
        { path: [key], message: `"${key}" repeats another tone map key that differs only in case` },
      ];
    }
    if (key === DEFAULT_TONE_KEY || scope.targetLocales.includes(key)) {
      return [];
    }
    return [{ path: [key], message: unknownKeyMessage(key, scope.targetLocales) }];
  });
}
