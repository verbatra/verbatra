import { styleText } from "node:util";
import type { RenderableError } from "./render.js";
import { createSpinner, type Spinner, type SpinnerClock, systemClock } from "./spinner.js";
import type { TerminalMode } from "./terminal-mode.js";
import type { Streams } from "./types.js";

export type LabelFormat = Parameters<typeof styleText>[0];

export type StatusWord = "ok" | "warn" | "fail" | "skip";

const STATUS_FORMATS: Record<StatusWord, LabelFormat> = {
  ok: "green",
  warn: "yellow",
  fail: "red",
  skip: "gray",
};

export interface Task {
  update(text: string): void;
  succeed(summary?: string): void;
  fail(summary?: string): void;
  stop(): void;
  isFinished(): boolean;
}

export interface Ui {
  readonly terminal: TerminalMode;
  readonly streams: Streams;
  label(format: LabelFormat, text: string): string;
  line(text: string): void;
  info(text: string): void;
  warn(text: string): void;
  error(error: RenderableError): void;
  status(word: StatusWord, text: string): void;
  hint(command: string, why?: string): void;
  task(label: string): Task;
}

export interface UiDeps {
  readonly clock?: SpinnerClock;
  readonly now?: () => number;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, ms) / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds.toFixed(1)}s`;
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / SECONDS_PER_MINUTE)}m ${whole % SECONDS_PER_MINUTE}s`;
}

const SILENT_TASK: Task = {
  update: () => {},
  succeed: () => {},
  fail: () => {},
  stop: () => {},
  isFinished: () => false,
};

interface Writer {
  readonly streams: Streams;
  settle(): void;
  openLine(text: string): void;
  isLineOpen(): boolean;
  closeLine(text: string): void;
  attachSpinner(spinner: Spinner): void;
  detachSpinner(spinner: Spinner): void;
  rawErr(text: string): void;
}

function coordinatedWriter(streams: Streams): Writer {
  let lineOpen = false;
  let spinner: Spinner | undefined;
  const settle = (): void => {
    spinner?.clear();
    if (lineOpen) {
      lineOpen = false;
      streams.err("\n");
    }
  };
  return {
    streams: {
      out: (text) => {
        settle();
        streams.out(text);
      },
      err: (text) => {
        settle();
        streams.err(text);
      },
    },
    settle,
    openLine: (text) => {
      settle();
      streams.err(text);
      lineOpen = true;
    },
    isLineOpen: () => lineOpen,
    closeLine: (text) => {
      lineOpen = false;
      streams.err(text);
    },
    attachSpinner: (next) => {
      spinner = next;
    },
    detachSpinner: (previous) => {
      if (spinner === previous) {
        spinner = undefined;
      }
    },
    rawErr: (text) => streams.err(text),
  };
}

function isSilent(terminal: TerminalMode): boolean {
  return terminal.mode === "quiet" || terminal.mode === "json";
}

export function createUi(streams: Streams, terminal: TerminalMode, deps: UiDeps = {}): Ui {
  const writer = coordinatedWriter(streams);
  const clock = deps.clock ?? systemClock;
  const now = deps.now ?? Date.now;
  let active: { readonly halt: () => void } | undefined;

  const stopSpinner = (): void => {
    active?.halt();
    active = undefined;
  };

  const label = (format: LabelFormat, text: string): string =>
    terminal.color ? styleText(format, text, { validateStream: false }) : text;

  const elapsedSuffix = (startedAt: number): string =>
    label("gray", `(${formatElapsed(now() - startedAt)})`);

  const status = (word: StatusWord, text: string): void => {
    if (!isSilent(terminal)) {
      writer.streams.err(`${label(STATUS_FORMATS[word], `[${word}]`)} ${text}\n`);
    }
  };

  const staticTask = (taskLabel: string): Task => {
    const startedAt = now();
    const opening = `verbatra: ${taskLabel}...`;
    writer.openLine(opening);
    let finished = false;
    const finish = (outcome: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      const tail = ` ${outcome} ${elapsedSuffix(startedAt)}\n`;
      if (writer.isLineOpen()) {
        writer.closeLine(tail);
      } else {
        writer.rawErr(`${opening}${tail}`);
      }
    };
    return {
      update: () => {},
      succeed: () => finish("done"),
      fail: () => finish(label("red", "failed")),
      stop: () => {
        if (!finished) {
          finished = true;
          writer.settle();
        }
      },
      isFinished: () => finished,
    };
  };

  const animatedTask = (taskLabel: string): Task => {
    const startedAt = now();
    writer.settle();
    const spinner = createSpinner(writer.rawErr, `${taskLabel}...`, clock);
    writer.attachSpinner(spinner);
    let finished = false;
    const halt = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      spinner.stop();
      writer.detachSpinner(spinner);
    };
    const finish = (word: StatusWord, summary: string | undefined): void => {
      if (finished) {
        return;
      }
      halt();
      writer.rawErr(
        `${label(STATUS_FORMATS[word], `[${word}]`)} ${summary ?? taskLabel} ${elapsedSuffix(startedAt)}\n`,
      );
    };
    active = { halt };
    return {
      update: (text) => {
        if (!finished) {
          spinner.update(text);
        }
      },
      succeed: (summary) => finish("ok", summary),
      fail: (summary) => finish("fail", summary),
      stop: halt,
      isFinished: () => finished,
    };
  };

  return {
    terminal,
    streams: writer.streams,
    label,
    line: (text) => {
      if (!isSilent(terminal)) {
        writer.streams.err(`${text}\n`);
      }
    },
    info: (text) => {
      if (!isSilent(terminal)) {
        writer.streams.err(`verbatra: ${text}\n`);
      }
    },
    warn: (text) => {
      writer.streams.err(`verbatra: ${text}\n`);
    },
    error: (error) => {
      stopSpinner();
      const cause = error.causeCode === undefined ? "" : ` (cause: ${error.causeCode})`;
      writer.streams.err(
        `verbatra: ${label("red", "error")} [${error.code}] ${error.message}${cause}\n`,
      );
    },
    status,
    hint: (command, why) => {
      if (!isSilent(terminal)) {
        const reason = why === undefined ? "" : ` (${why})`;
        writer.streams.err(`${label("cyan", "next:")} ${command}${reason}\n`);
      }
    },
    task: (taskLabel) => {
      stopSpinner();
      if (isSilent(terminal)) {
        return SILENT_TASK;
      }
      return terminal.animate ? animatedTask(taskLabel) : staticTask(taskLabel);
    },
  };
}
