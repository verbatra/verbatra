export const TYPE_MS = 38;

export const SEND_DELAY_MS = 450;

export const STAGGER_MS = 280;

export const DECODE_MS = 900;

export const HOLD_MS = 2800;

export const TICK_MS = 70;

export const SCRAMBLE_TICK_MS = 60;

export const SETTLED = Number.POSITIVE_INFINITY;

const PLACEHOLDER = /\{[^{}]+\}/gu;

const NON_LATIN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export const LATIN_POOL = "abcdefghijklmnopqrstuvwxyz";

export type Segment = { readonly text: string; readonly placeholder: boolean };

export type PlaygroundPhase = "typing" | "running" | "done";

export type Frame = {
  readonly typed: number;
  readonly phase: PlaygroundPhase;
  readonly progress: ReadonlyArray<number>;
  readonly active: number;
  readonly run: number;
};

export type CycleState = {
  readonly item: number;
  readonly elapsed: number;
  readonly playing: boolean;
  readonly touched: boolean;
  readonly selected: string | null;
};

export type CycleAction =
  | { readonly type: "tick"; readonly dt: number }
  | { readonly type: "start" }
  | { readonly type: "pick-item"; readonly index: number; readonly instant?: boolean }
  | { readonly type: "pick-language"; readonly code: string }
  | { readonly type: "toggle-play" }
  | { readonly type: "settle" };

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function splitPlaceholders(text: string): ReadonlyArray<Segment> {
  const segments: Segment[] = [];
  let from = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > from) {
      segments.push({ text: text.slice(from, match.index), placeholder: false });
    }
    segments.push({ text: match[0], placeholder: true });
    from = match.index + match[0].length;
  }
  if (from < text.length) segments.push({ text: text.slice(from), placeholder: false });
  return segments;
}

export function placeholdersIn(text: string): ReadonlyArray<string> {
  return text.match(PLACEHOLDER) ?? [];
}

export function intactPlaceholders(
  source: string,
  translations: ReadonlyArray<string>,
): { readonly intact: number; readonly total: number } {
  const expected = placeholdersIn(source);
  const intact = translations.reduce(
    (sum, translation) =>
      sum + expected.filter((placeholder) => translation.includes(placeholder)).length,
    0,
  );
  return { intact, total: expected.length * translations.length };
}

export function scramblePool(text: string): string {
  if (!NON_LATIN_SCRIPT.test(text)) return LATIN_POOL;
  return [...new Set(text.replace(PLACEHOLDER, "").replace(/\s/gu, ""))].join("");
}

export function sendAt(sourceLength: number): number {
  return sourceLength * TYPE_MS + SEND_DELAY_MS;
}

export function sceneEnd(sourceLength: number, languageCount: number): number {
  return sendAt(sourceLength) + Math.max(0, languageCount - 1) * STAGGER_MS + DECODE_MS;
}

export function frameAt(elapsed: number, sourceLength: number, languageCount: number): Frame {
  const send = sendAt(sourceLength);
  const progress = Array.from({ length: languageCount }, (_, index) =>
    clamp((elapsed - (send + index * STAGGER_MS)) / DECODE_MS, 0, 1),
  );
  const done = elapsed >= sceneEnd(sourceLength, languageCount);
  const started = progress.some((value) => value > 0);
  const total = sceneEnd(sourceLength, languageCount) - send;
  return {
    typed: clamp(Math.floor(elapsed / TYPE_MS), 0, sourceLength),
    phase: done ? "done" : started ? "running" : "typing",
    progress,
    active: progress.findIndex((value) => value > 0 && value < 1),
    run: clamp((elapsed - send) / total, 0, 1),
  };
}

export function decodeSegments(
  final: string,
  progress: number,
  tick: number,
  pool: string,
): ReadonlyArray<Segment> {
  const segments = splitPlaceholders(final);
  const letters = segments.reduce(
    (sum, segment) => sum + (segment.placeholder ? 0 : segment.text.length),
    0,
  );
  const reveal = Math.floor(progress * letters);
  let seen = 0;
  return segments.map((segment) => {
    if (segment.placeholder) return segment;
    let text = "";
    for (const character of segment.text) {
      const index = seen;
      seen += 1;
      const revealed = progress >= 1 || index < reveal || /\s/u.test(character);
      text += revealed
        ? character
        : pool.charAt((index * 7 + tick * 13) % pool.length) || character;
    }
    return { text, placeholder: false };
  });
}

export function initialCycle(item: number): CycleState {
  return { item, elapsed: SETTLED, playing: false, touched: false, selected: null };
}

export function cycleRunning(state: CycleState, durations: ReadonlyArray<number>): boolean {
  return state.playing || state.elapsed < (durations[state.item] ?? 0);
}

function tickState(state: CycleState, dt: number, durations: ReadonlyArray<number>): CycleState {
  if (!cycleRunning(state, durations)) return state;
  const duration = durations[state.item] ?? 0;
  const elapsed = state.elapsed + dt;
  if (state.playing && elapsed >= duration + HOLD_MS) {
    return { ...state, item: (state.item + 1) % durations.length, elapsed: 0, selected: null };
  }
  if (!state.playing && elapsed >= duration) return { ...state, elapsed: SETTLED };
  return { ...state, elapsed };
}

function togglePlay(state: CycleState, duration: number): CycleState {
  if (state.playing) return { ...state, playing: false, touched: true, elapsed: SETTLED };
  return { ...state, playing: true, touched: true, elapsed: Math.min(state.elapsed, duration) };
}

export function cycleReducer(
  state: CycleState,
  action: CycleAction,
  durations: ReadonlyArray<number>,
): CycleState {
  const duration = durations[state.item] ?? 0;
  switch (action.type) {
    case "tick":
      return tickState(state, action.dt, durations);
    case "start":
      if (state.touched || state.playing) return state;
      return { ...state, playing: true, elapsed: duration };
    case "pick-item":
      return {
        item: clamp(action.index, 0, durations.length - 1),
        elapsed: action.instant === true ? SETTLED : 0,
        playing: false,
        touched: true,
        selected: null,
      };
    case "pick-language":
      return {
        ...state,
        playing: false,
        touched: true,
        selected: state.selected === action.code ? null : action.code,
      };
    case "toggle-play":
      return togglePlay(state, duration);
    case "settle":
      return { ...state, playing: false, elapsed: SETTLED };
  }
}
