import { createElement, lazy, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { sameValue } from "./same-value";

const LAZY = Symbol.for("react.lazy");

class FlightChunk {
  constructor(
    readonly status: string,
    readonly value: unknown,
  ) {}
}

function readChunk(chunk: FlightChunk): unknown {
  return chunk.value;
}

function flightLazy(status: string, value: unknown): ReactNode {
  return { $$typeof: LAZY, _payload: new FlightChunk(status, value), _init: readChunk } as never;
}

function Icon() {
  return null;
}

describe("sameValue", () => {
  it("compares plain objects, arrays and elements structurally", () => {
    expect(sameValue({ a: [1, { b: "c" }] }, { a: [1, { b: "c" }] })).toBe(true);
    expect(sameValue({ a: [1] }, { a: [2] })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(
      sameValue(
        createElement("i", { className: "icon" }, "x"),
        createElement("i", { className: "icon" }, "x"),
      ),
    ).toBe(true);
    expect(sameValue(createElement("i", { key: "a" }), createElement("i", { key: "b" }))).toBe(
      false,
    );
    expect(sameValue(createElement("i"), createElement("b"))).toBe(false);
  });

  it("never treats two different functions or class instances as equal", () => {
    expect(sameValue({ on: () => 1 }, { on: () => 1 })).toBe(false);
    expect(sameValue(new Date(0), new Date(0))).toBe(false);
  });

  it("terminates on equal cyclic props and tells unequal cyclic props apart", () => {
    const next: Record<string, unknown> = { label: "a" };
    next.self = next;
    const previous: Record<string, unknown> = { label: "a" };
    previous.self = previous;
    expect(sameValue(next, previous)).toBe(true);
    const other: Record<string, unknown> = { label: "b" };
    other.self = other;
    expect(sameValue(next, other)).toBe(false);
  });

  it("treats a refreshed RSC payload as equal when its lazy references resolve to equal values", () => {
    const before = createElement("p", null, flightLazy("fulfilled", createElement(Icon)));
    const after = createElement("p", null, flightLazy("fulfilled", createElement(Icon)));
    expect(sameValue({ children: before }, { children: after })).toBe(true);
  });

  it("treats an element whose type is a fresh lazy client reference to the same component as equal", () => {
    const before = createElement(flightLazy("fulfilled", Icon) as never, { label: "a" });
    const after = createElement(flightLazy("fulfilled", Icon) as never, { label: "a" });
    expect(sameValue(before, after)).toBe(true);
  });

  it("tells lazy references apart when their resolved values differ or they have not resolved", () => {
    expect(sameValue(flightLazy("fulfilled", "a"), flightLazy("fulfilled", "b"))).toBe(false);
    expect(sameValue(flightLazy("pending", "a"), flightLazy("pending", "a"))).toBe(false);
  });

  it("compares a resolved React.lazy by its loaded module", async () => {
    const module = { default: Icon };
    const first = lazy(async () => module);
    const second = lazy(async () => module);
    for (const wrapper of [first, second]) {
      const payload = (wrapper as unknown as { _payload: { _status: number; _result: unknown } })
        ._payload;
      Object.assign(payload, { _status: 1, _result: module });
    }
    expect(sameValue(createElement(first), createElement(second))).toBe(true);
  });
});
