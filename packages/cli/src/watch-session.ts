import type { VerbatraConfig, WatchController, WatchInput, WatchRunResult } from "@verbatra/sdk";
import { renderErrorEnvelope, renderRunResultEnvelope } from "./json-envelope.js";
import { createProgressPresenter } from "./progress-presenter.js";
import { renderHuman, renderLockWait, toRenderableError } from "./render.js";
import { PRESS_CTRL_C } from "./session-banners.js";
import { stoppableSession } from "./stoppable-session.js";
import type { CliDeps, Session } from "./types.js";
import type { Ui } from "./ui.js";

export interface WatchOptions {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly locales?: readonly string[];
  readonly debounceMs?: number;
  readonly lockAcquireTimeoutMs?: number;
  readonly concurrency?: number;
  readonly cache?: boolean;
  readonly json: boolean;
}

export const WAITING_FOR_CHANGES = "waiting for changes...";

export function runWatch(options: WatchOptions, deps: CliDeps, ui: Ui): Session {
  const streams = ui.streams;
  const onRun = (result: WatchRunResult): void => {
    if (options.json) {
      streams.out(`${renderRunResultEnvelope(result)}\n`);
    } else if (result.status === "succeeded") {
      streams.out(`${renderHuman(result.summary)}\n`);
    } else {
      ui.error(result.error);
    }
    ui.info(WAITING_FOR_CHANGES);
  };

  const watchInput: WatchInput = {
    config: options.config,
    onRun,
    onReady: () => {
      streams.err(
        `verbatra: watching ${options.config.sourceLocale} (${options.config.files.pattern}); running initial translation\n`,
      );
      if (ui.terminal.stdinIsTty) {
        ui.info(PRESS_CTRL_C);
      }
    },
    cwd: options.cwd,
    onLockWait: (event) => {
      streams.err(`${renderLockWait(event, options.json)}\n`);
    },
    onProgress: createProgressPresenter(ui, { json: options.json, base: process.cwd() }),
    ...(options.locales !== undefined ? { locales: options.locales } : {}),
    ...(options.debounceMs !== undefined ? { debounceMs: options.debounceMs } : {}),
    ...(options.lockAcquireTimeoutMs !== undefined
      ? { lockAcquireTimeoutMs: options.lockAcquireTimeoutMs }
      : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    ...(options.cache === false ? { cache: false } : {}),
  };

  return stoppableSession<WatchController>({
    getController: () => deps.watch(watchInput),
    onStopRequested: () => {
      streams.err("verbatra: stopping, finishing current run...\n");
    },
    onStopped: () => ui.info("stopped"),
    onFailure: (error) => {
      const renderable = toRenderableError(error);
      ui.error(renderable);
      if (options.json) {
        streams.out(`${renderErrorEnvelope("watch", renderable)}\n`);
      }
      return 2;
    },
  });
}
