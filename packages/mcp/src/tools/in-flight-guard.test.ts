import { describe, expect, it } from "vitest";
import { createMcpInFlightGuard } from "./in-flight-guard.js";

const NAME = "translation.retranslateEntry";

describe("createMcpInFlightGuard", () => {
  it("allows the first call for a guarded tool and rejects a second call while it is still marked in flight", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    expect(guard.tryEnter(NAME)).toBe(true);
    expect(guard.tryEnter(NAME)).toBe(false);
  });

  it("allows a later call once the first has left", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    expect(guard.tryEnter(NAME)).toBe(true);
    guard.leave(NAME);
    expect(guard.tryEnter(NAME)).toBe(true);
  });

  it("never blocks a tool outside guardedTools, and never records it", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    expect(guard.tryEnter("status.check")).toBe(true);
    expect(guard.tryEnter("status.check")).toBe(true);
  });

  it("leave is a no-op when the tool is not currently marked", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    expect(() => guard.leave(NAME)).not.toThrow();
    expect(guard.tryEnter(NAME)).toBe(true);
  });

  it("two independent guard instances never share state", () => {
    const first = createMcpInFlightGuard(new Set([NAME]));
    const second = createMcpInFlightGuard(new Set([NAME]));

    expect(first.tryEnter(NAME)).toBe(true);
    expect(second.tryEnter(NAME)).toBe(true);
  });

  it("with a key, blocks a second call for the same tool and key but not a different key", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    expect(guard.tryEnter(NAME, "de:greeting")).toBe(true);
    expect(guard.tryEnter(NAME, "de:greeting")).toBe(false);
    expect(guard.tryEnter(NAME, "de:farewell")).toBe(true);
  });

  it("leave with a key only frees that key, leaving other in-flight keys blocked", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    guard.tryEnter(NAME, "de:greeting");
    guard.tryEnter(NAME, "de:farewell");
    guard.leave(NAME, "de:greeting");

    expect(guard.tryEnter(NAME, "de:greeting")).toBe(true);
    expect(guard.tryEnter(NAME, "de:farewell")).toBe(false);
  });

  it("treats a keyed call and a keyless call for the same tool as independent locks", () => {
    const guard = createMcpInFlightGuard(new Set([NAME]));

    expect(guard.tryEnter(NAME)).toBe(true);
    expect(guard.tryEnter(NAME, "de:greeting")).toBe(true);
  });
});
