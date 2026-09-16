import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, declaredMembers, makeTempDir, readTextFile } from "../test-support.js";
import { DEFAULT_TYPES_PATH, generateTypes } from "./generate-types.js";
import { describeMessageArguments } from "./message-arguments.js";

const BOUND = 64;

async function seedJson(catalog: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeFile(join(dir, "locales", "en.json"), JSON.stringify(catalog, null, 2), "utf8");
  return dir;
}

async function seedStrings(body: string): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeFile(join(dir, "locales", "en.strings"), body, "utf8");
  return dir;
}

const vue = baseConfig({ format: "vue-i18n-json" });

const strings = baseConfig({
  format: "apple-strings",
  files: { pattern: "locales/{locale}.strings" },
});

async function declarationIn(dir: string): Promise<string> {
  return readTextFile(join(dir, DEFAULT_TYPES_PATH));
}

describe("the placeholder index bound, at its edges", () => {
  it("accepts the highest in-range index and declares exactly that many slots", async () => {
    const dir = await seedJson({ edge: `Value {${BOUND - 1}} here` });

    const result = await generateTypes({ config: vue, cwd: dir });
    const member = declaredMembers(await declarationIn(dir))[0] ?? "";

    expect(result.unresolved).toEqual([]);
    expect(member.match(/VerbatraArgument/g) ?? []).toHaveLength(BOUND);
    expect(member.startsWith('  "edge": readonly [')).toBe(true);
  });

  it("refuses the first out-of-range index and claims nothing about that message", async () => {
    const dir = await seedJson({ edge: `Value {${BOUND}} here` });

    const result = await generateTypes({ config: vue, cwd: dir });

    expect(result.unresolved).toEqual([{ key: "edge", reason: "argument-index-out-of-range" }]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "edge": VerbatraUnknownArguments;',
    ]);
  });

  it("reports one index-out-of-range entry, not one per offending token", async () => {
    const dir = await seedJson({ many: "A {90} B {100000} C {2147483647} D {70}" });

    const result = await generateTypes({ config: vue, cwd: dir });

    expect(result.unresolved).toEqual([{ key: "many", reason: "argument-index-out-of-range" }]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "many": VerbatraUnknownArguments;',
    ]);
  });

  it("reports the mixed styles first when an out-of-range index sits beside a named argument", async () => {
    const dir = await seedJson({ blend: "Hi {name}, value {99999} here" });

    const result = await generateTypes({ config: vue, cwd: dir });

    expect(result.unresolved).toEqual([{ key: "blend", reason: "mixed-argument-styles" }]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "blend": VerbatraUnknownArguments;',
    ]);
    expect(await declarationIn(dir)).not.toContain('readonly "name"');
  });

  it("leaves an unrelated key fully declared when a sibling is out of range", async () => {
    const dir = await seedJson({ ok: "Hi {name}", boom: "Value {5000} here" });

    const result = await generateTypes({ config: vue, cwd: dir });

    expect(result.unresolved).toEqual([{ key: "boom", reason: "argument-index-out-of-range" }]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "ok": { readonly "name": VerbatraArgument };',
      '  "boom": VerbatraUnknownArguments;',
    ]);
  });
});

describe("spellings of an index that are not an index", () => {
  it("treats a fractional token as a named argument rather than an index", () => {
    expect(describeMessageArguments(["{1.5}"])).toEqual({
      style: "named",
      named: [{ name: "1.5", type: "unknown" }],
    });
  });

  it("treats an exponent-shaped token as a named argument rather than reading 1000", () => {
    expect(describeMessageArguments(["{1e3}"])).toEqual({
      style: "named",
      named: [{ name: "1e3", type: "unknown" }],
    });
  });

  it("treats a signed token as a named argument rather than a negative index", () => {
    expect(describeMessageArguments(["{-1}"])).toEqual({
      style: "named",
      named: [{ name: "-1", type: "unknown" }],
    });
    expect(describeMessageArguments(["{+64}"])).toEqual({
      style: "named",
      named: [{ name: "+64", type: "unknown" }],
    });
  });

  it.each([
    ["arabic-indic", "٣٢"],
    ["fullwidth", "３２"],
    ["devanagari", "३२"],
  ])("treats a %s numeral as a named argument, never as an index", (_label, digits) => {
    expect(describeMessageArguments([`{${digits}}`])).toEqual({
      style: "named",
      named: [{ name: digits, type: "unknown" }],
    });
  });

  it("declares a non-ASCII numeral name verbatim as a quoted member", async () => {
    const dir = await seedJson({ counter: "Value {{٣٢}} here" });

    const result = await generateTypes({ config: baseConfig(), cwd: dir });

    expect(result.unresolved).toEqual([]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "counter": { readonly "٣٢": VerbatraArgument };',
    ]);
  });

  it("does not read an out-of-range ASCII index out of its non-ASCII lookalike", async () => {
    const ascii = await seedJson({ counter: "Value {64} here" });
    const arabic = await seedJson({ counter: "Value {٦٤} here" });
    const config = baseConfig({ format: "next-intl-json" });

    const refused = await generateTypes({ config, cwd: ascii });
    const named = await generateTypes({ config, cwd: arabic });

    expect(refused.unresolved).toEqual([{ key: "counter", reason: "argument-index-out-of-range" }]);
    expect(named.unresolved).toEqual([]);
    expect(declaredMembers(await declarationIn(arabic))).toEqual([
      '  "counter": { readonly "٦٤": VerbatraArgument };',
    ]);
  });

  it("still reads a padded and a space-wrapped ASCII index as that index", () => {
    expect(describeMessageArguments(["{064}"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
    expect(describeMessageArguments(["{ 64 }"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
    expect(describeMessageArguments(["{063}"])).toMatchObject({ style: "positional" });
  });

  it("refuses an index past the safe-integer range instead of allocating from it", () => {
    expect(describeMessageArguments(["{9007199254740993}"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });
});

describe("nothing the declaration allocates scales with a catalog value", () => {
  it("renders an index that would have sized a three-million-element tuple in under 2 KB", async () => {
    const dir = await seedJson({ boom: "Value {3000000} here" });

    await generateTypes({ config: vue, cwd: dir });

    expect(Buffer.byteLength(await declarationIn(dir), "utf8")).toBeLessThan(2048);
  });

  it("keeps the declaration the same size whichever out-of-range index the value names", async () => {
    const small = await seedJson({ boom: "Value {64} here" });
    const huge = await seedJson({ boom: "Value {2147483647} here" });

    await generateTypes({ config: vue, cwd: small });
    await generateTypes({ config: vue, cwd: huge });

    expect(await declarationIn(huge)).toBe(await declarationIn(small));
  });

  it("caps the widest tuple any single value can produce at the bound", async () => {
    const dir = await seedJson({
      a: `Value {${BOUND - 1}} here`,
      b: `Value {${BOUND - 1}} and {${BOUND - 1}} again`,
    });

    await generateTypes({ config: vue, cwd: dir });

    for (const member of declaredMembers(await declarationIn(dir))) {
      expect((member.match(/VerbatraArgument/g) ?? []).length).toBeLessThanOrEqual(BOUND);
    }
  });

  it("does not throw a raw RangeError for any index a catalog can spell", async () => {
    for (const index of ["64", "65536", "3000000", "2147483647", "9007199254740991"]) {
      const dir = await seedJson({ boom: `Value {${index}} here` });

      const result = await generateTypes({ config: vue, cwd: dir });

      expect(result.unresolved).toEqual([{ key: "boom", reason: "argument-index-out-of-range" }]);
    }
  });
});

describe("a printf index below the first position", () => {
  it("is reported out of range rather than silently dropped from the tuple", async () => {
    const dir = await seedStrings('"zero" = "Hi %0$@";\n"mix" = "Hi %0$@ and %1$@";\n');

    const result = await generateTypes({ config: strings, cwd: dir });

    expect(result.unresolved).toEqual([
      { key: "zero", reason: "argument-index-out-of-range" },
      { key: "mix", reason: "argument-index-out-of-range" },
    ]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "zero": VerbatraUnknownArguments;',
      '  "mix": VerbatraUnknownArguments;',
    ]);
  });

  it("leaves the lowest position a message may legitimately name working", async () => {
    const dir = await seedStrings('"ok" = "Hi %1$@ and %2$d";\n');

    const result = await generateTypes({ config: strings, cwd: dir });

    expect(result.unresolved).toEqual([]);
    expect(declaredMembers(await declarationIn(dir))).toEqual([
      '  "ok": readonly [VerbatraArgument, number];',
    ]);
  });

  it("allocates nothing from it, so a below-range index can never size the output", async () => {
    const dir = await seedStrings('"zero" = "Hi %0$@";\n');

    await generateTypes({ config: strings, cwd: dir });

    expect(Buffer.byteLength(await declarationIn(dir), "utf8")).toBeLessThan(2048);
  });
});
