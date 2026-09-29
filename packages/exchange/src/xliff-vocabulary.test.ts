import { describe, expect, it } from "vitest";
import { ExchangeError } from "./errors.js";
import {
  lowestState,
  stateFromXliff2,
  stateFromXliff12,
  xliff12State,
  xliffFileName,
} from "./xliff-vocabulary.js";

describe("xliff12State", () => {
  it.each([
    ["initial", false, "new"],
    ["initial", true, "needs-translation"],
    ["translated", true, "translated"],
    ["reviewed", true, "signed-off"],
    ["final", true, "final"],
  ] as const)("spells %s (target %s) as %s", (state, hasTarget, expected) => {
    expect(xliff12State(state, hasTarget)).toBe(expected);
  });

  it("reads back every state it writes", () => {
    for (const state of ["initial", "translated", "reviewed", "final"] as const) {
      expect(stateFromXliff12(xliff12State(state, true))).toBe(state);
    }
  });
});

describe("state readers", () => {
  it("treats an inherited object key as no known state", () => {
    expect(stateFromXliff12("constructor")).toBe("initial");
    expect(stateFromXliff2("toString")).toBe("initial");
  });

  it("reads an absent state as initial", () => {
    expect(stateFromXliff12(null)).toBe("initial");
    expect(stateFromXliff2(null)).toBe("initial");
  });
});

describe("lowestState", () => {
  it("picks the least advanced state", () => {
    expect(lowestState(["final", "reviewed", "translated"])).toBe("translated");
    expect(lowestState(["final", "initial"])).toBe("initial");
    expect(lowestState(["final"])).toBe("final");
  });
});

describe("xliffFileName", () => {
  it("names one .xlf file per locale", () => {
    expect(xliffFileName("pt-BR")).toBe("pt-BR.xlf");
  });

  it.each(["", "..", "de/x"])("refuses %j as XLIFF_INVALID", (locale) => {
    expect(() => xliffFileName(locale)).toThrow(ExchangeError);
    try {
      xliffFileName(locale);
    } catch (error) {
      expect((error as ExchangeError).code).toBe("XLIFF_INVALID");
    }
  });
});
