import { z } from "zod";

export const PLAYGROUND_MAX_VALUE_LENGTH = 80;

export const PLAYGROUND_TEMPERATURE_NOTE = "provider default";

const PLACEHOLDER_PATTERN = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const BRACE_PATTERN = /[{}]/;
const LINE_BREAK_PATTERN = /[\n\r\u2028\u2029]/;
const CONTROL_PATTERN = /\p{Cc}/u;
const FORMAT_CHARACTER_PATTERN = /\p{Cf}/u;
const HTML_PATTERN = /[<>]|&[A-Za-z#][A-Za-z0-9]*;/;
const MARKDOWN_PATTERN = /[`*_~]|\[[^\]]*\]\(|^\s*(#|>|[-+]\s)/;
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:|[a-z0-9-]+\.[a-z]{2,}\b/i;

export function placeholdersOf(text: string): string[] {
  return text.match(PLACEHOLDER_PATTERN) ?? [];
}

function codePointLength(text: string): number {
  return [...text].length;
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function placeholderProblems(source: string, value: string): string[] {
  const expected = new Set(placeholdersOf(source));
  const problems: string[] = [];
  for (const placeholder of expected) {
    const seen = count(value, placeholder);
    if (seen !== 1) {
      problems.push(`placeholder ${placeholder} appears ${seen} times, expected once`);
    }
  }
  const stray = value.replaceAll(PLACEHOLDER_PATTERN, (match) =>
    expected.has(match) ? "" : match,
  );
  if (BRACE_PATTERN.test(stray)) {
    problems.push("contains a placeholder or brace that is not in the source");
  }
  return problems;
}

function shapeProblems(value: string): string[] {
  const checks: ReadonlyArray<readonly [boolean, string]> = [
    [value.trim().length === 0, "is empty"],
    [LINE_BREAK_PATTERN.test(value), "is not a single line"],
    [
      codePointLength(value) > PLAYGROUND_MAX_VALUE_LENGTH,
      `is longer than ${PLAYGROUND_MAX_VALUE_LENGTH} characters`,
    ],
    [CONTROL_PATTERN.test(value), "contains a control character"],
    [FORMAT_CHARACTER_PATTERN.test(value), "contains a bidi or zero-width format character"],
    [HTML_PATTERN.test(value), "contains HTML"],
    [MARKDOWN_PATTERN.test(value), "contains markdown or a code fence"],
    [URL_PATTERN.test(value), "contains a URL"],
  ];
  return checks.filter(([failed]) => failed).map(([, message]) => message);
}

export function translationProblems(source: string, value: string, sameAllowed: boolean): string[] {
  const problems = [...shapeProblems(value), ...placeholderProblems(source, value)];
  if (!sameAllowed && value === source) {
    problems.push("is identical to the source");
  }
  return problems;
}

export const playgroundItemSchema = z.strictObject({
  id: z.string().regex(/^[a-z][A-Za-z]*$/),
  text: z.string().min(1),
  sameAllowed: z.boolean().optional(),
});

export const playgroundMetadataSchema = z.strictObject({
  sdkVersion: z.string().min(1),
  provider: z.literal("gemini"),
  model: z.string().min(1),
  generatedAt: z.iso.datetime(),
  temperature: z.literal(PLAYGROUND_TEMPERATURE_NOTE),
});

export const playgroundOutputSchema = z
  .strictObject({
    items: z.array(playgroundItemSchema).min(1),
    translations: z.record(z.string(), z.record(z.string(), z.string())),
    metadata: playgroundMetadataSchema,
  })
  .superRefine((output, context) => {
    for (const [language, values] of Object.entries(output.translations)) {
      const ids = new Set(Object.keys(values));
      for (const item of output.items) {
        const value = values[item.id];
        if (value === undefined) {
          context.addIssue({ code: "custom", message: `${language}.${item.id} is missing` });
          continue;
        }
        ids.delete(item.id);
        for (const problem of translationProblems(item.text, value, item.sameAllowed === true)) {
          context.addIssue({ code: "custom", message: `${language}.${item.id} ${problem}` });
        }
      }
      for (const unknown of ids) {
        context.addIssue({
          code: "custom",
          message: `${language}.${unknown} is not a source item`,
        });
      }
    }
  });

export type PlaygroundItem = z.infer<typeof playgroundItemSchema>;
export type PlaygroundMetadata = z.infer<typeof playgroundMetadataSchema>;
export type PlaygroundOutput = z.infer<typeof playgroundOutputSchema>;
