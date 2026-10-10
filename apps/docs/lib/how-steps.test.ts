import { describe, expect, it } from "vitest";
import { CHECK_CLI_COMMAND, CHECK_EXIT_CODE, CHECK_RUN_LINES } from "@/lib/check-demo";
import { GATE_CLI_COMMAND, GATE_RUN_LINES } from "@/lib/gate-demo";
import {
  HOW_COMMANDS,
  HOW_OUTPUTS,
  HOW_TITLE,
  HOW_TOTAL_LINES,
  howStepCopy,
  howStepStates,
} from "@/lib/how-steps";
import { HOW_STEP_KEYS } from "@/lib/landing-sections";
import en from "../messages/en.json";

const CHECK_TYPED_AT = 1 + GATE_RUN_LINES.length;

describe("the How session", () => {
  it("replays translate, then check, each with its real output", () => {
    expect(HOW_COMMANDS).toEqual([GATE_CLI_COMMAND, CHECK_CLI_COMMAND]);
    expect(HOW_OUTPUTS).toEqual({ 0: GATE_RUN_LINES, 1: CHECK_RUN_LINES });
    expect(HOW_TITLE).toBe("verbatra translate && verbatra check");
    expect(HOW_TOTAL_LINES).toBe(2 + GATE_RUN_LINES.length + CHECK_RUN_LINES.length);
  });

  it("has three steps: set up, translate what changed, fail the pull request", () => {
    expect(HOW_STEP_KEYS).toEqual(["setup", "translate", "check"]);
  });
});

describe("howStepStates", () => {
  const current = (lines: number, typing = false) =>
    howStepStates({ lines, typing }).indexOf("current");

  it("marks no step before the replay starts", () => {
    expect(howStepStates({ lines: 0, typing: false })).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("holds set up while the first command types, then translate while it prints", () => {
    expect(current(0, true)).toBe(0);
    expect(current(1)).toBe(1);
    expect(current(CHECK_TYPED_AT)).toBe(1);
    expect(howStepStates({ lines: 2, typing: false })).toEqual(["complete", "current", "upcoming"]);
  });

  it("moves to check as the second command types and holds it while check prints", () => {
    expect(current(CHECK_TYPED_AT, true)).toBe(2);
    expect(current(CHECK_TYPED_AT + 1)).toBe(2);
    expect(current(HOW_TOTAL_LINES - 1)).toBe(2);
  });

  it("shows every step complete once the whole session is on screen", () => {
    expect(howStepStates({ lines: HOW_TOTAL_LINES, typing: false })).toEqual([
      "complete",
      "complete",
      "complete",
    ]);
  });
});

describe("howStepCopy", () => {
  it("reads each step's title and body, passing the real check exit code", () => {
    const calls: Array<[string, Record<string, number> | undefined]> = [];
    const copy = howStepCopy((key, values) => {
      calls.push([key, values]);
      return key;
    });
    expect(copy.map((step) => step.key)).toEqual([...HOW_STEP_KEYS]);
    expect(calls.filter(([key]) => key.endsWith(".body")).map(([, values]) => values)).toEqual(
      HOW_STEP_KEYS.map(() => ({ code: CHECK_EXIT_CODE })),
    );
  });

  it("names the exit code in the English check step", () => {
    expect(en.landing.how.steps.check.body).toContain("{code}");
    expect(Object.keys(en.landing.how.steps)).toEqual([...HOW_STEP_KEYS]);
  });
});
