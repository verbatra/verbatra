import { describe, expect, it } from "vitest";
import {
  type CycleState,
  cycleReducer,
  cycleRunning,
  DECODE_MS,
  decodeSegments,
  frameAt,
  HOLD_MS,
  initialCycle,
  intactPlaceholders,
  LATIN_POOL,
  placeholdersIn,
  SETTLED,
  STAGGER_MS,
  sceneEnd,
  scramblePool,
  sendAt,
  splitPlaceholders,
  TYPE_MS,
} from "./playground-cycle";

const DURATIONS = [3000, 4000];

function run(state: CycleState, ...actions: Parameters<typeof cycleReducer>[1][]): CycleState {
  return actions.reduce((current, action) => cycleReducer(current, action, DURATIONS), state);
}

describe("splitPlaceholders", () => {
  it("separates each placeholder from the text around it", () => {
    expect(splitPlaceholders("Hi {name}, {count}!")).toEqual([
      { text: "Hi ", placeholder: false },
      { text: "{name}", placeholder: true },
      { text: ", ", placeholder: false },
      { text: "{count}", placeholder: true },
      { text: "!", placeholder: false },
    ]);
  });

  it("returns a single plain segment without placeholders and nothing for empty text", () => {
    expect(splitPlaceholders("Settings")).toEqual([{ text: "Settings", placeholder: false }]);
    expect(splitPlaceholders("")).toEqual([]);
  });

  it("lists the placeholders of a string", () => {
    expect(placeholdersIn("a {x} b {y}")).toEqual(["{x}", "{y}"]);
    expect(placeholdersIn("none")).toEqual([]);
  });
});

describe("intactPlaceholders", () => {
  it("counts every placeholder that survives in each translation", () => {
    expect(intactPlaceholders("Hi {name}", ["Hallo {name}", "Hola {name}"])).toEqual({
      intact: 2,
      total: 2,
    });
  });

  it("does not count a placeholder a translation dropped or renamed", () => {
    expect(intactPlaceholders("Hi {name}", ["Hallo {name}", "Hola {nombre}"])).toEqual({
      intact: 1,
      total: 2,
    });
  });

  it("is zero of zero for a string without placeholders", () => {
    expect(intactPlaceholders("Settings", ["Einstellungen"])).toEqual({ intact: 0, total: 0 });
  });
});

describe("scramblePool", () => {
  it("scrambles Latin text with the Latin alphabet", () => {
    expect(scramblePool("Willkommen")).toBe(LATIN_POOL);
  });

  it("scrambles Japanese with its own characters, never a placeholder or a space", () => {
    const pool = scramblePool("{count}件の 新しい");
    expect(pool).toBe("件の新しい");
  });
});

describe("frameAt", () => {
  const length = 10;
  const languages = 4;

  it("types the source before anything is sent", () => {
    const frame = frameAt(TYPE_MS * 4, length, languages);
    expect(frame.typed).toBe(4);
    expect(frame.phase).toBe("typing");
    expect(frame.progress).toEqual([0, 0, 0, 0]);
    expect(frame.active).toBe(-1);
  });

  it("starts the languages one stagger apart", () => {
    const frame = frameAt(sendAt(length) + DECODE_MS + STAGGER_MS / 2, length, languages);
    expect(frame.phase).toBe("running");
    expect(frame.progress[0]).toBe(1);
    expect(frame.progress[1]).toBeCloseTo((DECODE_MS + STAGGER_MS / 2 - STAGGER_MS) / DECODE_MS);
    expect(frame.progress[3]).toBeGreaterThan(0);
    expect(frame.progress[3]).toBeLessThan(frame.progress[2] ?? 0);
    expect(frame.active).toBe(1);
    expect(frame.run).toBeGreaterThan(0);
    expect(frame.run).toBeLessThan(1);
  });

  it("is done at the end of the scene and at the settled state", () => {
    const end = sceneEnd(length, languages);
    expect(end).toBe(sendAt(length) + 3 * STAGGER_MS + DECODE_MS);
    for (const elapsed of [end, SETTLED]) {
      const frame = frameAt(elapsed, length, languages);
      expect(frame.phase).toBe("done");
      expect(frame.typed).toBe(length);
      expect(frame.progress).toEqual([1, 1, 1, 1]);
      expect(frame.run).toBe(1);
      expect(frame.active).toBe(-1);
    }
  });
});

describe("decodeSegments", () => {
  const final = "Willkommen, {name}!";

  it("always shows the placeholder verbatim", () => {
    for (const progress of [0.01, 0.3, 0.9]) {
      const placeholders = decodeSegments(final, progress, 3, LATIN_POOL).filter(
        (segment) => segment.placeholder,
      );
      expect(placeholders).toEqual([{ text: "{name}", placeholder: true }]);
    }
  });

  it("keeps spaces and the text length while scrambling", () => {
    const text = decodeSegments(final, 0, 5, LATIN_POOL)
      .map((segment) => segment.text)
      .join("");
    expect(text).toHaveLength(final.length);
    expect(text.indexOf(" ")).toBe(final.indexOf(" "));
    expect(text.startsWith("Willkommen")).toBe(false);
  });

  it("reveals the text from the start as progress grows and finishes exact", () => {
    const half = decodeSegments(final, 0.5, 0, LATIN_POOL)
      .map((segment) => segment.text)
      .join("");
    expect(half.startsWith("Willko")).toBe(true);
    const done = decodeSegments(final, 1, 9, LATIN_POOL)
      .map((segment) => segment.text)
      .join("");
    expect(done).toBe(final);
  });

  it("is deterministic for one tick", () => {
    expect(decodeSegments(final, 0.4, 7, LATIN_POOL)).toEqual(
      decodeSegments(final, 0.4, 7, LATIN_POOL),
    );
  });
});

describe("cycleReducer", () => {
  it("starts settled, idle and untouched", () => {
    const state = initialCycle(1);
    expect(state).toEqual({
      item: 1,
      elapsed: SETTLED,
      playing: false,
      touched: false,
      selected: null,
    });
    expect(cycleRunning(state, DURATIONS)).toBe(false);
  });

  it("ignores ticks while settled and idle", () => {
    const state = initialCycle(0);
    expect(run(state, { type: "tick", dt: 100 })).toBe(state);
  });

  it("start holds the settled item, then advances to the next after the hold", () => {
    const started = run(initialCycle(0), { type: "start" });
    expect(started).toMatchObject({ playing: true, elapsed: 3000 });
    expect(cycleRunning(started, DURATIONS)).toBe(true);
    const held = run(started, { type: "tick", dt: HOLD_MS - 1 });
    expect(held.item).toBe(0);
    const next = run(held, { type: "tick", dt: 1 });
    expect(next).toMatchObject({ item: 1, elapsed: 0, playing: true });
  });

  it("wraps from the last item to the first", () => {
    const state: CycleState = { ...initialCycle(1), playing: true, elapsed: 4000 + HOLD_MS - 1 };
    expect(run(state, { type: "tick", dt: 5 }).item).toBe(0);
  });

  it("does not start again once the visitor touched anything", () => {
    const touched = run(initialCycle(0), { type: "pick-language", code: "de" });
    expect(run(touched, { type: "start" })).toBe(touched);
    const playing = run(initialCycle(0), { type: "start" });
    expect(run(playing, { type: "start" })).toBe(playing);
  });

  it("a picked item plays once from the top and then settles without cycling", () => {
    const picked = run(initialCycle(0), { type: "start" }, { type: "pick-item", index: 1 });
    expect(picked).toMatchObject({ item: 1, elapsed: 0, playing: false, touched: true });
    expect(cycleRunning(picked, DURATIONS)).toBe(true);
    const mid = run(picked, { type: "tick", dt: 2000 });
    expect(mid.elapsed).toBe(2000);
    const settled = run(mid, { type: "tick", dt: 2000 });
    expect(settled.elapsed).toBe(SETTLED);
    expect(cycleRunning(settled, DURATIONS)).toBe(false);
  });

  it("an instant pick settles at once and never runs the ticker", () => {
    const picked = run(initialCycle(0), { type: "pick-item", index: 1, instant: true });
    expect(picked).toMatchObject({ item: 1, elapsed: SETTLED, playing: false, touched: true });
    expect(cycleRunning(picked, DURATIONS)).toBe(false);
  });

  it("settles a playing cycle where it stands", () => {
    const playing = run(initialCycle(0), { type: "start" });
    const settled = run(playing, { type: "settle" });
    expect(settled).toMatchObject({ playing: false, elapsed: SETTLED });
    expect(cycleRunning(settled, DURATIONS)).toBe(false);
  });

  it("clamps a picked index into the list", () => {
    expect(run(initialCycle(0), { type: "pick-item", index: 9 }).item).toBe(1);
    expect(run(initialCycle(1), { type: "pick-item", index: -3 }).item).toBe(0);
  });

  it("selecting a language stops the cycle, toggles the selection and clears on a new item", () => {
    const playing = run(initialCycle(0), { type: "start" });
    const selected = run(playing, { type: "pick-language", code: "ja" });
    expect(selected).toMatchObject({ playing: false, selected: "ja", touched: true });
    expect(run(selected, { type: "pick-language", code: "ja" }).selected).toBeNull();
    expect(run(selected, { type: "pick-language", code: "de" }).selected).toBe("de");
    expect(run(selected, { type: "pick-item", index: 1 }).selected).toBeNull();
  });

  it("pause settles the scene and play resumes with the hold before the next item", () => {
    const playing = run(initialCycle(0), { type: "start" }, { type: "tick", dt: 500 });
    const paused = run(playing, { type: "toggle-play" });
    expect(paused).toMatchObject({ playing: false, elapsed: SETTLED, touched: true });
    expect(run(paused, { type: "tick", dt: 9999 })).toBe(paused);
    const resumed = run(paused, { type: "toggle-play" });
    expect(resumed).toMatchObject({ playing: true, elapsed: 3000 });
  });

  it("play during a picked item's animation keeps its progress", () => {
    const picked = run(initialCycle(0), { type: "pick-item", index: 1 }, { type: "tick", dt: 700 });
    expect(run(picked, { type: "toggle-play" })).toMatchObject({ playing: true, elapsed: 700 });
  });

  it("clears the language selection when the cycle moves on", () => {
    const state: CycleState = {
      ...initialCycle(0),
      playing: true,
      elapsed: 3000 + HOLD_MS - 1,
      selected: "fr",
    };
    expect(run(state, { type: "tick", dt: 5 }).selected).toBeNull();
  });
});
