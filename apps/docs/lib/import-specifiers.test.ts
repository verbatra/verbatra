import { describe, expect, it } from "vitest";
import { importSpecifiers } from "@/test-support/app-sources";

const skipping = (source: string): string[] => importSpecifiers(source, { skipTypeOnly: true });

describe("importSpecifiers", () => {
  it("counts every import shape by default, type-only ones included", () => {
    const source = [
      `import type { A } from "./a";`,
      `import type B from "./b";`,
      `export type { C } from "./c";`,
      `export type * from "./d";`,
      `import { type E } from "./e";`,
    ].join("\n");
    expect(importSpecifiers(source)).toEqual(["./a", "./b", "./c", "./d", "./e"]);
  });

  describe.each([
    ["import type with braces", `import type { A } from "./a";`],
    ["import type default", `import type A from "./a";`],
    ["import type namespace", `import type * as A from "./a";`],
    ["export type with braces", `export type { A } from "./a";`],
    ["export type star", `export type * from "./a";`],
    ["inline type on every specifier", `import { type A, type B } from "./a";`],
    ["multiline inline types", `import {\n  type A,\n  type B,\n} from "./a";`],
  ])("skips %s when asked", (_name, source) => {
    it("finds no edge", () => {
      expect(skipping(source)).toEqual([]);
    });
  });

  describe.each([
    ["a value import", `import { a } from "./a";`],
    ["a default import", `import a from "./a";`],
    ["a mixed inline import", `import { type A, b } from "./a";`],
    ["a default beside inline types", `import a, { type A } from "./a";`],
    ["a default import named type", `import type from "./a";`],
    ["a value import named type", `import { type } from "./a";`],
    ["a renamed value import named type", `import { type as t } from "./a";`],
    ["a side effect import", `import "./a";`],
    ["a re-export", `export { a } from "./a";`],
    ["a star re-export", `export * from "./a";`],
    ["a dynamic import", `const m = await import("./a");`],
    ["a require", `const m = require("./a");`],
  ])("keeps %s", (_name, source) => {
    it("finds the edge", () => {
      expect(skipping(source)).toEqual(["./a"]);
    });
  });

  it("keeps a value edge that follows a type-only statement", () => {
    expect(skipping(`import type { A } from "./a";\nimport { b } from "./b";`)).toEqual(["./b"]);
  });
});
