import { describe, expect, it } from "vitest";
import { createSampleSessions, SAMPLE_FOCUS_WINDOW_MS } from "./icu-sample-session.js";

describe("createSampleSessions", () => {
  it("keeps samples per session and answers an empty map for an unknown one", () => {
    const sessions = createSampleSessions(5);

    sessions.setSamples("a", { inputs: new Map([["n", "12"]]), fields: [] });

    expect(sessions.samples("a").inputs.get("n")).toBe("12");
    expect(sessions.samples("b").inputs.size).toBe(0);
  });

  it("forgets the least recently written session past its limit", () => {
    const sessions = createSampleSessions(2);

    sessions.setSamples("a", { inputs: new Map([["n", "1"]]), fields: [] });
    sessions.setSamples("b", { inputs: new Map([["n", "2"]]), fields: [] });
    sessions.setSamples("a", { inputs: new Map([["n", "3"]]), fields: [] });
    sessions.setSamples("c", { inputs: new Map([["n", "4"]]), fields: [] });

    expect(sessions.samples("a").inputs.get("n")).toBe("3");
    expect(sessions.samples("b").inputs.size).toBe(0);
    expect(sessions.samples("c").inputs.get("n")).toBe("4");
  });

  it("hands a remembered focus back once, to its own session, while it is fresh", () => {
    const sessions = createSampleSessions(5);
    const target = { name: "n", start: 1, end: 2 };

    sessions.rememberFocus("a", target, 1000);

    expect(sessions.takeFocus("b", 1001)).toBeUndefined();
    sessions.rememberFocus("a", target, 1000);
    expect(sessions.takeFocus("a", 1001)).toEqual(target);
    expect(sessions.takeFocus("a", 1002)).toBeUndefined();
  });

  it("lets a remembered focus go stale", () => {
    const sessions = createSampleSessions(5);

    sessions.rememberFocus("a", { name: "n", start: null, end: null }, 0);

    expect(sessions.takeFocus("a", SAMPLE_FOCUS_WINDOW_MS)).toBeUndefined();
  });

  it("clears everything", () => {
    const sessions = createSampleSessions(5);
    sessions.setSamples("a", { inputs: new Map([["n", "1"]]), fields: [] });
    sessions.rememberFocus("a", { name: "n", start: 0, end: 0 }, 0);

    sessions.clear();

    expect(sessions.samples("a").inputs.size).toBe(0);
    expect(sessions.takeFocus("a", 1)).toBeUndefined();
  });
});
