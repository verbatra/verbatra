import { describe, expect, it } from "vitest";
import { inSourceOrder } from "./source-order.js";

describe("inSourceOrder", () => {
  it("orders the values by the source keys, whatever order they arrived in", () => {
    const values = new Map([
      ["nested.link", 1],
      ["b", 2],
      ["nested.title", 3],
    ]);

    expect(inSourceOrder(["b", "nested.title", "nested.link"], values)).toEqual([
      ["b", 2],
      ["nested.title", 3],
      ["nested.link", 1],
    ]);
  });

  it("skips source keys without a value and keeps a key the source lacks at the end", () => {
    const values = new Map([
      ["orphan", 9],
      ["a", 1],
    ]);

    expect(inSourceOrder(["x", "a"], values)).toEqual([
      ["a", 1],
      ["orphan", 9],
    ]);
  });
});
