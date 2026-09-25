import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { redactingStreams } from "./redacting-streams.js";
import { renderError } from "./render.js";
import { CLEAR_LINE } from "./spinner.js";
import type { OutputMode, TerminalMode } from "./terminal-mode.js";
import { captureStreams, fakeClock } from "./test-support.js";
import { createUi, formatElapsed } from "./ui.js";

const ESC = "\x1b[";

function terminal(mode: OutputMode, overrides: Partial<TerminalMode> = {}): TerminalMode {
  return { mode, color: false, animate: false, stdinIsTty: false, ...overrides };
}

function steppedNow(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

const KEY = `sk-ant-api03-${"x".repeat(40)}`;

describe("formatElapsed", () => {
  it.each([
    [0, "0.0s"],
    [49, "0.0s"],
    [1234, "1.2s"],
    [59_940, "59.9s"],
    [60_000, "1m 0s"],
    [125_400, "2m 5s"],
    [-5, "0.0s"],
  ])("formats %d ms as %s", (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe("createUi: plain mode lines", () => {
  it("writes info, warn, status and hint lines to stderr, uncolored", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("plain"));

    ui.info("updated .gitignore");
    ui.warn("2 keys need a human translation");
    ui.status("ok", "config loaded");
    ui.status("skip", "network check");
    ui.hint("verbatra check", "confirm every locale is in sync");
    ui.hint("verbatra import handoff.xlsx");
    ui.line("verbatra: translating de");

    expect(cap.err()).toBe(
      [
        "verbatra: updated .gitignore",
        "verbatra: 2 keys need a human translation",
        "[ok] config loaded",
        "[skip] network check",
        "next: verbatra check (confirm every locale is in sync)",
        "next: verbatra import handoff.xlsx",
        "verbatra: translating de",
        "",
      ].join("\n"),
    );
    expect(cap.out()).toBe("");
  });

  it("renders an error exactly like renderError when color is off", () => {
    const cap = captureStreams();

    createUi(cap.streams, terminal("plain")).error({ code: "CONFIG_INVALID", message: "bad" });

    expect(cap.err()).toBe(`${renderError({ code: "CONFIG_INVALID", message: "bad" })}\n`);
  });

  it("names a wrapped cause's code exactly like renderError", () => {
    const cap = captureStreams();
    const error = {
      code: "PROVIDER_CONSTRUCTION_FAILED",
      message: "m",
      causeCode: "MISSING_API_KEY",
    };

    createUi(cap.streams, terminal("plain")).error(error);

    expect(cap.err()).toBe(`${renderError(error)}\n`);
    expect(cap.err()).toContain("(cause: MISSING_API_KEY)");
  });
});

describe("createUi: quiet and json modes", () => {
  it.each(["quiet", "json"] as const)(
    "%s drops info, status, hint, line and task output but keeps warnings and errors",
    (mode) => {
      const cap = captureStreams();
      const ui = createUi(cap.streams, terminal(mode));

      ui.info("notice");
      ui.status("ok", "done");
      ui.hint("verbatra check");
      ui.line("progress");
      const task = ui.task("loading config");
      task.update("x");
      task.succeed();
      task.fail();
      ui.warn("warning");
      ui.error({ code: "X", message: "y" });

      expect(cap.err()).toBe("verbatra: warning\nverbatra: error [X] y\n");
    },
  );
});

describe("createUi: color", () => {
  it("styles only the fixed labels, never the interpolated text", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("tty", { color: true }));

    ui.status("fail", "value [x]");
    ui.hint("verbatra check", "why");
    ui.error({ code: "CODE", message: "message text" });

    const err = cap.err();
    expect(err).toContain(`${ESC}31m[fail]${ESC}39m value [x]\n`);
    expect(err).toContain(`${ESC}36mnext:${ESC}39m verbatra check (why)\n`);
    expect(err).toContain(`verbatra: ${ESC}31merror${ESC}39m [CODE] message text\n`);
    expect(stripVTControlCharacters(err)).toBe(
      "[fail] value [x]\nnext: verbatra check (why)\nverbatra: error [CODE] message text\n",
    );
  });

  it("returns the text unchanged from label() when color is off", () => {
    expect(createUi(captureStreams().streams, terminal("tty")).label("red", "error")).toBe("error");
  });

  it("still redacts a key in a colored error line written through the redacting streams", () => {
    const cap = captureStreams();
    const ui = createUi(redactingStreams(cap.streams), terminal("tty", { color: true }));

    ui.error({ code: "PROVIDER_AUTH", message: `rejected ${KEY}` });
    ui.warn(`key ${KEY} was refused`);
    ui.status("fail", `sent ${KEY}`);

    expect(cap.err()).not.toContain(KEY);
    expect(cap.err()).toContain(`${ESC}31merror${ESC}39m`);
  });
});

describe("createUi: static tasks (plain mode or VERBATRA_NO_SPINNER)", () => {
  it("writes one 'label... done (time)' line", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("plain"), { now: steppedNow(1000, 2234) });

    const task = ui.task("loading config");
    task.update("ignored in plain mode");
    task.succeed("ignored summary");
    task.succeed();

    expect(cap.err()).toBe("verbatra: loading config... done (1.2s)\n");
  });

  it("writes 'failed' on failure", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("plain"), { now: steppedNow(0, 500) });

    ui.task("scanning").fail();

    expect(cap.err()).toBe("verbatra: scanning... failed (0.5s)\n");
  });

  it("ends the open line before any other output and repeats the label when it finishes", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("plain"), { now: steppedNow(0, 3000) });

    const task = ui.task("translating");
    ui.line("verbatra: translating de");
    ui.streams.out("result\n");
    task.succeed();

    expect(cap.err()).toBe(
      "verbatra: translating...\nverbatra: translating de\nverbatra: translating... done (3.0s)\n",
    );
    expect(cap.out()).toBe("result\n");
  });

  it("stays static on a terminal when animation is off", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("tty"), { now: steppedNow(0, 100) });

    ui.task("loading").succeed();

    expect(cap.err()).toBe("verbatra: loading... done (0.1s)\n");
  });
});

describe("createUi: stopping a task without a status line", () => {
  it("closes an open static line and writes nothing more, even when finished later", () => {
    const cap = captureStreams();
    const ui = createUi(cap.streams, terminal("plain"), { now: steppedNow(0, 100) });

    const task = ui.task("translating");
    task.stop();
    task.stop();
    task.succeed();

    expect(cap.err()).toBe("verbatra: translating...\n");
  });

  it("clears an animated spinner and stops it ticking", () => {
    const cap = captureStreams();
    const clock = fakeClock();
    const ui = createUi(cap.streams, terminal("tty", { animate: true }), { clock });

    const task = ui.task("translating");
    clock.fireDelay();
    task.stop();
    clock.tick();
    task.succeed();

    expect(cap.err()).toBe(`${CLEAR_LINE}| translating...${CLEAR_LINE}`);
  });

  it("stops a running spinner before an error line so it never redraws over it", () => {
    const cap = captureStreams();
    const clock = fakeClock();
    const ui = createUi(cap.streams, terminal("tty", { animate: true }), { clock });

    ui.task("translating");
    clock.fireDelay();
    ui.error({ code: "X", message: "boom" });
    clock.tick();

    expect(cap.err()).toBe(`${CLEAR_LINE}| translating...${CLEAR_LINE}verbatra: error [X] boom\n`);
  });

  it("marks the task an error stopped as finished, so its owner knows to start a new one", () => {
    const cap = captureStreams();
    const clock = fakeClock();
    const ui = createUi(cap.streams, terminal("tty", { animate: true }), { clock });

    const task = ui.task("translating");
    expect(task.isFinished()).toBe(false);
    ui.error({ code: "X", message: "boom" });
    task.succeed();

    expect(task.isFinished()).toBe(true);
    expect(cap.err()).toBe("verbatra: error [X] boom\n");
  });

  it("reports a plain task finished once it succeeds or stops", () => {
    const ui = createUi(captureStreams().streams, terminal("plain"));
    const succeeded = ui.task("a");
    const stopped = ui.task("b");

    succeeded.succeed();
    stopped.stop();

    expect(succeeded.isFinished()).toBe(true);
    expect(stopped.isFinished()).toBe(true);
    expect(ui.task("c").isFinished()).toBe(false);
  });

  it("never reports a silent task finished", () => {
    const task = createUi(captureStreams().streams, terminal("quiet")).task("a");
    task.succeed();

    expect(task.isFinished()).toBe(false);
  });
});

describe("createUi: animated tasks", () => {
  function animated(color = false) {
    const cap = captureStreams();
    const clock = fakeClock();
    const ui = createUi(cap.streams, terminal("tty", { animate: true, color }), {
      clock,
      now: steppedNow(0, 1500, 3000, 4500),
    });
    return { cap, clock, ui };
  }

  it("prints only the [ok] line when the task ends before the spinner delay", () => {
    const { cap, ui } = animated();

    ui.task("loading config").succeed();

    expect(cap.err()).toBe("[ok] loading config (1.5s)\n");
  });

  it("spins after the delay, shows updates, and replaces the frame with the final line", () => {
    const { cap, clock, ui } = animated();

    const task = ui.task("translating");
    clock.fireDelay();
    task.update("de batch 2/5");
    task.succeed("translated 3 locales");
    task.update("after the end");

    expect(cap.err()).toBe(
      `${CLEAR_LINE}| translating...${CLEAR_LINE}| de batch 2/5${CLEAR_LINE}[ok] translated 3 locales (1.5s)\n`,
    );
  });

  it("marks a failure with [fail]", () => {
    const { cap, ui } = animated();

    ui.task("exporting").fail("export failed");

    expect(cap.err()).toBe("[fail] export failed (1.5s)\n");
  });

  it("clears the frame before another line, then keeps spinning", () => {
    const { cap, clock, ui } = animated();

    const task = ui.task("translating");
    clock.fireDelay();
    ui.line("verbatra: translating de");
    clock.tick();
    task.succeed();

    expect(cap.err()).toBe(
      `${CLEAR_LINE}| translating...${CLEAR_LINE}verbatra: translating de\n${CLEAR_LINE}/ translating...${CLEAR_LINE}[ok] translating (1.5s)\n`,
    );
  });

  it("stops the previous spinner silently when a new task starts, and ignores its late outcome", () => {
    const { cap, clock, ui } = animated();

    const first = ui.task("first");
    clock.fireDelay();
    const second = ui.task("second");
    first.succeed();
    clock.fireDelay();
    ui.line("between");
    expect(first.isFinished()).toBe(true);
    second.succeed();

    expect(cap.err()).toBe(
      [
        `${CLEAR_LINE}| first...${CLEAR_LINE}`,
        `${CLEAR_LINE}| second...${CLEAR_LINE}between\n`,
        "[ok] second (1.5s)\n",
      ].join(""),
    );
  });

  it("colors the status word and the timing when color is on", () => {
    const { cap, ui } = animated(true);

    ui.task("loading").succeed();

    expect(cap.err()).toBe(`${ESC}32m[ok]${ESC}39m loading ${ESC}90m(1.5s)${ESC}39m\n`);
  });
});
