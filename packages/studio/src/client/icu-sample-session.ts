import type { SampleField } from "./icu-preview.js";

export interface SampleFocus {
  readonly name: string;
  readonly start: number | null;
  readonly end: number | null;
}

export interface SessionSamples {
  readonly inputs: ReadonlyMap<string, string>;
  readonly fields: readonly SampleField[];
}

export interface SampleSessions {
  samples(session: string): SessionSamples;
  setSamples(session: string, samples: SessionSamples): void;
  rememberFocus(session: string, focus: SampleFocus, now: number): void;
  takeFocus(session: string, now: number): SampleFocus | undefined;
  clear(): void;
}

const EMPTY: SessionSamples = { inputs: new Map(), fields: [] };

export const SAMPLE_FOCUS_WINDOW_MS = 1000;

export function createSampleSessions(limit: number): SampleSessions {
  const stored = new Map<string, SessionSamples>();
  let focus: {
    readonly session: string;
    readonly at: number;
    readonly target: SampleFocus;
  } | null = null;
  return {
    samples: (session) => stored.get(session) ?? EMPTY,
    setSamples(session, samples): void {
      stored.delete(session);
      stored.set(session, samples);
      const oldest = stored.keys().next();
      if (stored.size > limit && oldest.done !== true) {
        stored.delete(oldest.value);
      }
    },
    rememberFocus(session, target, now): void {
      focus = { session, at: now, target };
    },
    takeFocus(session, now): SampleFocus | undefined {
      const held = focus;
      focus = null;
      return held !== null && held.session === session && now - held.at < SAMPLE_FOCUS_WINDOW_MS
        ? held.target
        : undefined;
    },
    clear(): void {
      stored.clear();
      focus = null;
    },
  };
}
