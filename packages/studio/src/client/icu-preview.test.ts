import type { IcuPreviewFailure, MessageArguments } from "@verbatra/sdk";
import { previewIcuMessage, scaffoldingMetadata } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { baseStudioConfig } from "../server/test-support.js";
import {
  formatUsesIcu,
  ICU_FAILURE_COPY,
  ICU_PREVIEW_FIELD_LIMIT,
  prepareSamples,
  SAMPLE_PROBLEM_COPY,
  type SampleField,
  sampleFields,
  samplesKey,
} from "./icu-preview.js";

function inputs(entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

const NUMBER: readonly SampleField[] = [{ name: "n", type: "number" }];

describe("formatUsesIcu", () => {
  it("agrees with the sdk about every supported format", () => {
    for (const format of scaffoldingMetadata.supportedFormats) {
      const answer = previewIcuMessage({
        config: baseStudioConfig({ format }),
        locale: "en",
        value: "Hi",
      });

      expect(formatUsesIcu(format), format).toBe(answer.supported);
    }
  });

  it("says no to a custom format and to nonsense", () => {
    expect(formatUsesIcu("custom:mine")).toBe(false);
    expect(formatUsesIcu("")).toBe(false);
    expect(formatUsesIcu("constructor")).toBe(false);
  });
});

describe("ICU_FAILURE_COPY", () => {
  it("has a sentence for every failure reason the sdk can give", () => {
    const reasons: readonly IcuPreviewFailure[] = [
      "too-long",
      "too-complex",
      "invalid-message",
      "unsupported-locale",
      "too-large",
    ];

    expect(Object.keys(ICU_FAILURE_COPY).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      expect(ICU_FAILURE_COPY[reason].length).toBeGreaterThan(10);
    }
  });
});

describe("sampleFields", () => {
  it("lists named arguments with their types", () => {
    const described: MessageArguments = {
      style: "named",
      named: [
        { name: "n", type: "number" },
        { name: "who", type: "string" },
      ],
    };

    expect(sampleFields(described)).toEqual([
      { name: "n", type: "number" },
      { name: "who", type: "string" },
    ]);
  });

  it.each<MessageArguments>([
    { style: "none" },
    { style: "positional", positional: ["number"] },
    { style: "unresolved", reason: "invalid-message-syntax" },
  ])("offers no field for %j", (described) => {
    expect(sampleFields(described)).toEqual([]);
  });
});

describe("prepareSamples", () => {
  it("reads a typed 12 as the number 12", () => {
    const prepared = prepareSamples(NUMBER, inputs({ n: "12" }));

    expect(prepared.args).toEqual({ n: 12 });
    expect(typeof prepared.args?.n).toBe("number");
    expect(prepared.problems.size).toBe(0);
  });

  it.each([
    ["-3.5", -3.5],
    ["0", 0],
    [" 7 ", 7],
    ["1.25", 1.25],
  ])("accepts %j for a number", (text, expected) => {
    expect(prepareSamples(NUMBER, inputs({ n: text })).args).toEqual({ n: expected });
  });

  it.each([
    "abc",
    "0x10",
    "1e3",
    "Infinity",
    "-Infinity",
    "NaN",
    "1,5",
    ".5",
    "5.",
    "+5",
    "٣",
    "1 2",
    "9".repeat(400),
  ])("leaves %j unset and flags it for a number", (text) => {
    const prepared = prepareSamples(NUMBER, inputs({ n: text }));

    expect(prepared.args).toBeUndefined();
    expect(prepared.problems.get("n")).toBe("number");
  });

  it.each(["", "   ", "\n"])("treats %j as no sample, not as zero", (text) => {
    const prepared = prepareSamples(NUMBER, inputs({ n: text }));

    expect(prepared.args).toBeUndefined();
    expect(prepared.problems.size).toBe(0);
  });

  it("keeps good samples when another is invalid", () => {
    const fields: readonly SampleField[] = [
      { name: "n", type: "number" },
      { name: "who", type: "string" },
    ];

    const prepared = prepareSamples(fields, inputs({ n: "x", who: "Ada" }));

    expect(prepared.args).toEqual({ who: "Ada" });
    expect(prepared.problems.get("n")).toBe("number");
  });

  it("sends a string argument as text even when it looks numeric", () => {
    const fields: readonly SampleField[] = [{ name: "who", type: "string" }];

    expect(prepareSamples(fields, inputs({ who: "12" })).args).toEqual({ who: "12" });
  });

  it("reads a date argument as milliseconds and refuses other text", () => {
    const fields: readonly SampleField[] = [{ name: "when", type: "date" }];

    expect(prepareSamples(fields, inputs({ when: "86400000" })).args).toEqual({ when: 86400000 });
    expect(prepareSamples(fields, inputs({ when: "tomorrow" })).problems.get("when")).toBe("date");
  });

  it.each(["unknown", "date-or-string"] as const)(
    "reads numeric text as a number for %s",
    (type) => {
      const fields: readonly SampleField[] = [{ name: "x", type }];

      expect(prepareSamples(fields, inputs({ x: "5" })).args).toEqual({ x: 5 });
      expect(prepareSamples(fields, inputs({ x: "five" })).args).toEqual({ x: "five" });
    },
  );

  it("refuses text longer than the boundary accepts instead of sending it", () => {
    const fields: readonly SampleField[] = [{ name: "who", type: "string" }];

    const prepared = prepareSamples(fields, inputs({ who: "x".repeat(257) }));

    expect(prepared.args).toBeUndefined();
    expect(prepared.problems.get("who")).toBe("long");
    expect(prepareSamples(fields, inputs({ who: "x".repeat(256) })).args).toBeDefined();
  });

  it("keeps a hostile argument name as its own property of a prototype-free record", () => {
    const fields: readonly SampleField[] = [
      { name: "__proto__", type: "string" },
      { name: "constructor", type: "number" },
    ];

    const prepared = prepareSamples(
      fields,
      new Map([
        ["__proto__", "x"],
        ["constructor", "3"],
      ]),
    );

    expect(Object.getPrototypeOf(prepared.args)).toBeNull();
    expect(Object.keys(prepared.args ?? {}).sort()).toEqual(["__proto__", "constructor"]);
    expect(JSON.stringify(prepared.args)).toBe('{"__proto__":"x","constructor":3}');
    expect(prepared.args?.constructor).toBe(3);
  });

  it("looks only at the first fields it will show", () => {
    const fields: SampleField[] = Array.from(
      { length: ICU_PREVIEW_FIELD_LIMIT + 5 },
      (_, index) => ({
        name: `a${index}`,
        type: "number",
      }),
    );
    const all = new Map(fields.map((field) => [field.name, "1"]));

    const prepared = prepareSamples(fields, all);

    expect(Object.keys(prepared.args ?? {})).toHaveLength(ICU_PREVIEW_FIELD_LIMIT);
  });

  it("describes every problem in words", () => {
    for (const problem of ["number", "date", "long"] as const) {
      expect(SAMPLE_PROBLEM_COPY[problem].length).toBeGreaterThan(10);
    }
  });
});

describe("samplesKey", () => {
  it("is equal for equal samples and different when a value changes", () => {
    const first = prepareSamples(NUMBER, inputs({ n: "1" }));
    const same = prepareSamples(NUMBER, inputs({ n: " 1 " }));
    const other = prepareSamples(NUMBER, inputs({ n: "2" }));

    expect(samplesKey(first)).toBe(samplesKey(same));
    expect(samplesKey(first)).not.toBe(samplesKey(other));
    expect(samplesKey(prepareSamples(NUMBER, inputs({})))).toBe("[]");
  });
});
