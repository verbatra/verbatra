import { checkPlaceholders, type SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "./default-registry.js";

const FORMATS: readonly SupportedFormat[] = ["vue-i18n-json", "properties", "ini"];

const NAMES = ["número", "名前", "nom_é", "नाम"] as const;

function adapterFor(format: SupportedFormat) {
  const resolution = createDefaultRegistry().resolve("", { format });
  if (resolution.status !== "resolved") {
    throw new Error(`${format} adapter did not resolve`);
  }
  return resolution.adapter;
}

const CASES = FORMATS.flatMap((format) => NAMES.map((name) => [format, name] as const));

describe("a placeholder name written in a non-Latin or accented script", () => {
  it.each(CASES)("%s extracts {%s}, spaced or not", (format, name) => {
    const adapter = adapterFor(format);

    expect(adapter.extractPlaceholders(`Hi {${name}}!`)).toEqual([`{${name}}`]);
    expect(adapter.extractPlaceholders(`Hi { ${name} }!`)).toEqual([`{${name}}`]);
  });

  it.each(CASES)("%s refuses a translation that renames {%s}", (format, name) => {
    const adapter = adapterFor(format);
    const result = checkPlaceholders(
      adapter.extractPlaceholders(`Hi {${name}}!`),
      adapter.extractPlaceholders("Hallo {renamed}!"),
    );

    expect(result.matches).toBe(false);
    expect(result.missing).toEqual([`{${name}}`]);
  });

  it.each(FORMATS)("%s does not read a dotted name as one placeholder", (format) => {
    expect(adapterFor(format).extractPlaceholders("Hi {user.name}!")).not.toContain("{user.name}");
  });
});
