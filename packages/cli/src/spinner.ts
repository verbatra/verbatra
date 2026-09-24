export const SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;

export const SPINNER_DELAY_MS = 300;

export const SPINNER_INTERVAL_MS = 100;

export const CLEAR_LINE = "\r\x1b[2K";

export interface TimerHandle {
  unref?(): unknown;
}

export interface SpinnerClock {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

export const systemClock: SpinnerClock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface Spinner {
  update(text: string): void;
  clear(): void;
  stop(): void;
}

function unref(handle: TimerHandle): TimerHandle {
  handle.unref?.();
  return handle;
}

export function createSpinner(
  write: (text: string) => void,
  initialText: string,
  clock: SpinnerClock = systemClock,
): Spinner {
  let text = initialText;
  let frame = 0;
  let drawn = false;
  let stopped = false;
  let interval: TimerHandle | undefined;

  const draw = (): void => {
    write(`${CLEAR_LINE}${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${text}`);
    drawn = true;
  };

  const tick = (): void => {
    frame += 1;
    draw();
  };

  const delay = unref(
    clock.setTimeout(() => {
      if (stopped) {
        return;
      }
      draw();
      interval = unref(clock.setInterval(tick, SPINNER_INTERVAL_MS));
    }, SPINNER_DELAY_MS),
  );

  const clear = (): void => {
    if (drawn) {
      write(CLEAR_LINE);
      drawn = false;
    }
  };

  return {
    update: (next) => {
      text = next;
      if (drawn && !stopped) {
        draw();
      }
    },
    clear,
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clock.clearTimeout(delay);
      if (interval !== undefined) {
        clock.clearInterval(interval);
      }
      clear();
    },
  };
}
