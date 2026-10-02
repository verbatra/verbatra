import { type ProgressEvent, type ProgressListener, redact } from "@verbatra/sdk";

export const PROGRESS_MIN_INTERVAL_MS = 250;

export interface ProgressUpdate {
  readonly progress: number;
  readonly total: number;
  readonly message: string;
}

export interface ProgressReporterOptions {
  readonly send: (update: ProgressUpdate) => Promise<void>;
  readonly onLog?: (line: string) => void;
  readonly minIntervalMs?: number;
}

export interface ProgressReporter {
  readonly onProgress: ProgressListener;
  close(): void;
}

export function createProgressReporter(options: ProgressReporterOptions): ProgressReporter {
  const minIntervalMs = options.minIntervalMs ?? PROGRESS_MIN_INTERVAL_MS;
  let plannedBatches = 0;
  let finishedBatches = 0;
  let message = "";
  let sentProgress = 0;
  let lastSentAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function logFailure(error: unknown): void {
    options.onLog?.(redact(`Sending a progress notification failed: ${String(error)}`));
  }

  function emit(): void {
    if (finishedBatches <= sentProgress) {
      return;
    }
    sentProgress = finishedBatches;
    lastSentAt = Date.now();
    const update: ProgressUpdate = {
      progress: finishedBatches,
      total: Math.max(plannedBatches, finishedBatches),
      message,
    };
    try {
      options.send(update).catch(logFailure);
    } catch (error) {
      logFailure(error);
    }
  }

  function schedule(): void {
    if (timer !== undefined) {
      return;
    }
    const wait = lastSentAt === undefined ? 0 : lastSentAt + minIntervalMs - Date.now();
    if (wait <= 0) {
      emit();
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      emit();
    }, wait);
    timer.unref?.();
  }

  function onProgress(event: ProgressEvent): void {
    if (closed) {
      return;
    }
    if (event.type === "locale-planned") {
      plannedBatches += event.batches;
      return;
    }
    if (event.type === "batch-finished") {
      finishedBatches += 1;
      message = `${event.locale}: batch ${event.batchIndex}/${event.totalBatches}`;
      schedule();
    }
  }

  function close(): void {
    if (closed) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    emit();
    closed = true;
  }

  return { onProgress, close };
}
