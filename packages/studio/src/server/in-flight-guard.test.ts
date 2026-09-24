import { describe, expect, it } from "vitest";
import { createRpcInFlightGuard } from "./in-flight-guard.js";

const METHOD = "translation.translatePending";

describe("createRpcInFlightGuard", () => {
  it("allows the first call for a guarded method and rejects a second call while it is still marked in flight", () => {
    const guard = createRpcInFlightGuard(new Set([METHOD]));

    expect(guard.tryEnter(METHOD)).toBe(true);
    expect(guard.tryEnter(METHOD)).toBe(false);
  });

  it("allows a later call once the first has left", () => {
    const guard = createRpcInFlightGuard(new Set([METHOD]));

    expect(guard.tryEnter(METHOD)).toBe(true);
    guard.leave(METHOD);
    expect(guard.tryEnter(METHOD)).toBe(true);
  });

  it("never blocks a method outside guardedMethods, and never records it", () => {
    const guard = createRpcInFlightGuard(new Set([METHOD]));

    expect(guard.tryEnter("project.snapshot")).toBe(true);
    expect(guard.tryEnter("project.snapshot")).toBe(true);
  });

  it("leave is a no-op when the method is not currently marked", () => {
    const guard = createRpcInFlightGuard(new Set([METHOD]));

    expect(() => guard.leave(METHOD)).not.toThrow();
    expect(guard.tryEnter(METHOD)).toBe(true);
  });

  it("tracks each guarded method independently", () => {
    const guard = createRpcInFlightGuard(new Set([METHOD, "translation.retranslateEntry"]));

    expect(guard.tryEnter(METHOD)).toBe(true);
    expect(guard.tryEnter("translation.retranslateEntry")).toBe(true);
    expect(guard.tryEnter(METHOD)).toBe(false);
    expect(guard.tryEnter("translation.retranslateEntry")).toBe(false);
  });

  it("two independent guard instances never share state", () => {
    const first = createRpcInFlightGuard(new Set([METHOD]));
    const second = createRpcInFlightGuard(new Set([METHOD]));

    expect(first.tryEnter(METHOD)).toBe(true);
    expect(second.tryEnter(METHOD)).toBe(true);
  });

  it("with a key, blocks a second call for the same method and key but not a different key", () => {
    const guard = createRpcInFlightGuard(new Set(["translation.retranslateEntry"]));

    expect(guard.tryEnter("translation.retranslateEntry", "de:greeting")).toBe(true);
    expect(guard.tryEnter("translation.retranslateEntry", "de:greeting")).toBe(false);
    expect(guard.tryEnter("translation.retranslateEntry", "de:farewell")).toBe(true);
  });

  it("leave with a key only frees that key, leaving other in-flight keys blocked", () => {
    const guard = createRpcInFlightGuard(new Set(["translation.retranslateEntry"]));

    guard.tryEnter("translation.retranslateEntry", "de:greeting");
    guard.tryEnter("translation.retranslateEntry", "de:farewell");
    guard.leave("translation.retranslateEntry", "de:greeting");

    expect(guard.tryEnter("translation.retranslateEntry", "de:greeting")).toBe(true);
    expect(guard.tryEnter("translation.retranslateEntry", "de:farewell")).toBe(false);
  });

  it("treats a keyed call and a keyless call for the same method as independent locks", () => {
    const guard = createRpcInFlightGuard(new Set(["translation.retranslateEntry"]));

    expect(guard.tryEnter("translation.retranslateEntry")).toBe(true);
    expect(guard.tryEnter("translation.retranslateEntry", "de:greeting")).toBe(true);
  });
});

describe("createRpcInFlightGuard: entries", () => {
  it("lists the entries of every call still in flight with the time since it started", () => {
    let clock = 1_000;
    const guard = createRpcInFlightGuard(
      new Set(["translation.retranslateEntry", "translation.retranslateEntries"]),
      () => clock,
    );
    guard.tryEnter("translation.retranslateEntry", "de:a", [{ locale: "de", key: "a" }]);
    clock = 3_500;
    guard.tryEnter("translation.retranslateEntries", undefined, [
      { locale: "fr", key: "b" },
      { locale: "fr", key: "c" },
    ]);
    clock = 4_000;

    expect(guard.entries()).toEqual([
      { method: "translation.retranslateEntry", locale: "de", key: "a", elapsedMs: 3_000 },
      { method: "translation.retranslateEntries", locale: "fr", key: "b", elapsedMs: 500 },
      { method: "translation.retranslateEntries", locale: "fr", key: "c", elapsedMs: 500 },
    ]);

    guard.leave("translation.retranslateEntry", "de:a");
    expect(guard.entries().map((entry) => entry.key)).toEqual(["b", "c"]);
  });

  it("records nothing for a call made without entries or to an unguarded method", () => {
    const guard = createRpcInFlightGuard(new Set(["translation.translatePending"]));
    guard.tryEnter("translation.translatePending");
    guard.tryEnter("project.snapshot", undefined, [{ locale: "de", key: "a" }]);

    expect(guard.entries()).toEqual([]);
  });
});

describe("createRpcInFlightGuard: entry-exclusive methods", () => {
  const SINGLE = "translation.retranslateEntry";
  const BATCH = "translation.retranslateEntries";
  const guarded = new Set([SINGLE, BATCH, "review.approve"]);

  function guard() {
    return createRpcInFlightGuard(guarded, () => 0, new Set([SINGLE, BATCH]));
  }

  it("refuses a single call for an entry a running batch holds, in either order", () => {
    const first = guard();
    first.tryEnter(BATCH, undefined, [{ locale: "de", key: "a" }]);
    expect(first.tryEnter(SINGLE, "a", [{ locale: "de", key: "a" }])).toBe(false);
    expect(first.tryEnter(SINGLE, "b", [{ locale: "de", key: "b" }])).toBe(true);

    const second = guard();
    second.tryEnter(SINGLE, "a", [{ locale: "de", key: "a" }]);
    expect(second.tryEnter(BATCH, undefined, [{ locale: "de", key: "a" }])).toBe(false);
  });

  it("does not treat the same key in another locale as a clash", () => {
    const instance = guard();
    instance.tryEnter(BATCH, undefined, [{ locale: "de", key: "a" }]);

    expect(instance.tryEnter(SINGLE, "a", [{ locale: "fr", key: "a" }])).toBe(true);
  });

  it("frees the entries once the batch leaves", () => {
    const instance = guard();
    instance.tryEnter(BATCH, undefined, [{ locale: "de", key: "a" }]);
    instance.leave(BATCH);

    expect(instance.tryEnter(SINGLE, "a", [{ locale: "de", key: "a" }])).toBe(true);
  });

  it("leaves methods outside the exclusive set unaffected by overlapping entries", () => {
    const instance = guard();
    instance.tryEnter(BATCH, undefined, [{ locale: "de", key: "a" }]);

    expect(instance.tryEnter("review.approve", "a", [{ locale: "de", key: "a" }])).toBe(true);
  });
});
