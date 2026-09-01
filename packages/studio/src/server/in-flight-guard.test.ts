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
