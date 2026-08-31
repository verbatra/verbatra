import { renderError, toRenderableError } from "./render.js";
import { stoppableSession } from "./stoppable-session.js";
import type { Session, Streams } from "./types.js";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function isEnvValueTruthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

export function resolveBooleanFlag(explicit: boolean | undefined, envVar: string): boolean {
  if (explicit !== undefined) {
    return explicit;
  }
  return isEnvValueTruthy(process.env[envVar]);
}

export function isModuleMissing(error: unknown, specifierPattern: RegExp): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "ERR_MODULE_NOT_FOUND" && specifierPattern.test(error.message);
}

export async function step<T>(
  action: () => Promise<T>,
  streams: Streams,
  hint: (error: unknown) => string | undefined,
): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    streams.err(`${hint(error) ?? renderError(toRenderableError(error))}\n`);
    return undefined;
  }
}

export function failedSession(code: number): Session {
  return { done: Promise.resolve(code), requestStop: () => {} };
}

export function watchForStop(server: { close(): Promise<void> }, streams: Streams): Session {
  return stoppableSession({
    getController: () => Promise.resolve({ stop: () => server.close() }),
    onFailure: (error) => {
      streams.err(`${renderError(toRenderableError(error))}\n`);
      return 1;
    },
  });
}
