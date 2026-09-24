import type { ProgressEvent, ProviderRetryEvent, ScanProgressEvent } from "@verbatra/sdk";
import { displayPath, renderProgressHuman, renderProgressJson } from "./render.js";
import type { Task, Ui } from "./ui.js";
import { formatElapsed } from "./ui.js";

export interface ProgressPresenterOptions {
  readonly json: boolean;
  readonly base: string;
}

function retryText(event: ProviderRetryEvent): string {
  const status = event.status === undefined ? "" : `, status ${event.status}`;
  const delay = event.delayMs === undefined ? "" : ` in ${formatElapsed(event.delayMs)}`;
  return `retrying the provider call (attempt ${event.attempt}${status})${delay}`;
}

export function spinnerText(event: ProgressEvent): string | undefined {
  switch (event.type) {
    case "locale-started":
      return `${event.locale}: starting (${event.localeIndex + 1}/${event.totalLocales})`;
    case "locale-planned":
      return `${event.locale}: ${event.keys} to send in ${event.batches} ${event.batches === 1 ? "batch" : "batches"}, ${event.cacheHits} from memory`;
    case "sub-batch":
      return `${event.locale}: batch ${event.batchIndex}/${event.totalBatches}`;
    case "batch-finished":
      return `${event.locale}: batch ${event.batchIndex}/${event.totalBatches} done in ${formatElapsed(event.durationMs)}`;
    case "provider-retry":
      return retryText(event);
    case "repair":
      return `${event.locale}: asking again for ${event.keys} missing ${event.keys === 1 ? "key" : "keys"}`;
    case "split-retry":
      return `${event.locale}: output cut off, retrying ${event.keys} keys in halves`;
    case "writing":
      return `${event.locale}: writing`;
    default:
      return undefined;
  }
}

function writeJson(ui: Ui, event: ProgressEvent): void {
  const line = renderProgressJson(event);
  if (line !== undefined) {
    ui.streams.err(`${line}\n`);
  }
}

export function createProgressPresenter(
  ui: Ui,
  options: ProgressPresenterOptions,
): (event: ProgressEvent) => void {
  let task: Task | undefined;

  const finishRun = (): void => {
    task?.stop();
    task = undefined;
  };

  const animate = (event: ProgressEvent): void => {
    if (event.type === "locale-finished") {
      ui.line(renderProgressHuman(event) ?? "");
      return;
    }
    if (event.type === "run-finished") {
      finishRun();
      return;
    }
    const text = spinnerText(event);
    if (text === undefined) {
      return;
    }
    task ??= ui.task("translating");
    task.update(text);
  };

  return (event) => {
    if (options.json) {
      writeJson(ui, event);
      return;
    }
    if (event.type === "change-detected") {
      const paths = event.paths.map((path) => displayPath(path, options.base)).join(", ");
      ui.info(`change detected: ${paths}`);
      return;
    }
    if (ui.terminal.animate) {
      animate(event);
      return;
    }
    const line = renderProgressHuman(event);
    if (line !== undefined) {
      ui.line(line);
    }
  };
}

export function scanProgressReporter(task: Task): (event: ScanProgressEvent) => void {
  return (event) => task.update(`scanned ${event.scanned}/${event.total} files`);
}
