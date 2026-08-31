import type { VerbatraConfig, WatchController, WatchInput, WatchRunResult } from "@verbatra/sdk";
import { renderErrorEnvelope, renderRunResultEnvelope } from "./json-envelope.js";
import {
  renderError,
  renderLockWait,
  renderProgress,
  renderRunResultHuman,
  toRenderableError,
} from "./render.js";
import { stoppableSession } from "./stoppable-session.js";
import type { CliDeps, Session, Streams } from "./types.js";

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

export function runWatch(options: WatchOptions, deps: CliDeps, streams: Streams): Session {
  const onRun = (result: WatchRunResult): void => {
    streams.out(
      options.json ? `${renderRunResultEnvelope(result)}\n` : `${renderRunResultHuman(result)}\n`,
    );
  };

  streams.err(
    `verbatra: watching ${options.config.sourceLocale} (${options.config.files.pattern}); running initial translation\n`,
  );

  const watchInput: WatchInput = {
    config: options.config,
    onRun,
    cwd: options.cwd,
    onLockWait: (event) => {
      streams.err(`${renderLockWait(event, options.json)}\n`);
    },
    onProgress: (event) => {
      streams.err(`${renderProgress(event, options.json)}\n`);
    },
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
    onFailure: (error) => {
      const renderable = toRenderableError(error);
      streams.err(`${renderError(renderable)}\n`);
      if (options.json) {
        streams.out(`${renderErrorEnvelope("watch", renderable)}\n`);
      }
      return 2;
    },
  });
}
