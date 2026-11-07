import { describe, expect, it } from "vitest";
import type { RefreshEvent, RefreshKeyDelta } from "../shared/sse-events.js";
import {
  canTranslatePending,
  deriveRefreshToastView,
  handleRefreshEvent,
  nextToastSlot,
} from "./refresh-toast.js";

const AT = "2026-01-01T00:00:00.000Z";

function sourceEvent(delta: RefreshKeyDelta): RefreshEvent {
  return { reason: "source", at: AT, locale: "en", delta };
}

function targetsEvent(delta: RefreshKeyDelta): RefreshEvent {
  return { reason: "targets", at: AT, locale: "de", delta };
}

const lockEvent: RefreshEvent = { reason: "lock", at: AT };

describe("deriveRefreshToastView", () => {
  it("(a) a source-reason event with a nonzero delta sum is action-eligible", () => {
    const view = deriveRefreshToastView(sourceEvent({ added: 1, changed: 0, removed: 0 }));
    expect(view).toMatchObject({ category: "source", actionEligible: true });
  });

  it("(b) a targets-reason event is never action-eligible, nonzero delta or not", () => {
    const nonzero = deriveRefreshToastView(targetsEvent({ added: 0, changed: 3, removed: 0 }));
    expect(nonzero).toMatchObject({ category: "targets", actionEligible: false });
  });

  it("(c) a zero-sum delta renders no toast at all (undefined, not an empty view)", () => {
    expect(
      deriveRefreshToastView(sourceEvent({ added: 0, changed: 0, removed: 0 })),
    ).toBeUndefined();
    expect(
      deriveRefreshToastView(targetsEvent({ added: 0, changed: 0, removed: 0 })),
    ).toBeUndefined();
  });

  it("(c) a delta-absent event renders no toast at all", () => {
    expect(deriveRefreshToastView({ reason: "source", at: AT })).toBeUndefined();
    expect(deriveRefreshToastView({ reason: "targets", at: AT, locale: "de" })).toBeUndefined();
  });

  it("(d) a lock-reason event renders no toast", () => {
    expect(deriveRefreshToastView(lockEvent)).toBeUndefined();
  });

  it("builds a summary from only the nonzero delta fields, in added/changed/removed order", () => {
    const view = deriveRefreshToastView(sourceEvent({ added: 1, changed: 2, removed: 0 }));
    expect(view?.summary).toBe("1 added, 2 changed");
  });

  it("includes a nonzero removed count in the summary", () => {
    const view = deriveRefreshToastView(sourceEvent({ added: 0, changed: 0, removed: 4 }));
    expect(view?.summary).toBe("4 removed");
  });

  it("labels a source event without naming a locale, and a targets event with its locale", () => {
    const source = deriveRefreshToastView(sourceEvent({ added: 1, changed: 0, removed: 0 }));
    expect(source?.label).toBe("Source changed");

    const targets = deriveRefreshToastView(targetsEvent({ added: 0, changed: 1, removed: 0 }));
    expect(targets?.label).toBe("Target changed: de");
  });

  it("falls back to a generic label for a targets event with no locale (defensive: never happens on the real wire)", () => {
    const view = deriveRefreshToastView({
      reason: "targets",
      at: AT,
      delta: { added: 0, changed: 1, removed: 0 },
    });
    expect(view?.label).toBe("Target changed");
  });
});

describe("canTranslatePending", () => {
  it("is true only when the toast is action-eligible and both capabilities are true", () => {
    expect(canTranslatePending(true, { spend: true, writeToDisk: true })).toBe(true);
  });

  it("is false whenever any single input is false", () => {
    expect(canTranslatePending(false, { spend: true, writeToDisk: true })).toBe(false);
    expect(canTranslatePending(true, { spend: false, writeToDisk: true })).toBe(false);
    expect(canTranslatePending(true, { spend: true, writeToDisk: false })).toBe(false);
    expect(canTranslatePending(true, undefined)).toBe(false);
  });
});

describe("nextToastSlot", () => {
  it("two sequential eligible events leave only the second's view", () => {
    const first = nextToastSlot(undefined, {
      kind: "event",
      event: sourceEvent({ added: 1, changed: 0, removed: 0 }),
    });
    const second = nextToastSlot(first, {
      kind: "event",
      event: targetsEvent({ added: 0, changed: 5, removed: 0 }),
    });

    expect(second).toMatchObject({ category: "targets", summary: "5 changed" });
  });

  it("a dismiss action always clears to undefined regardless of the current view", () => {
    const current = nextToastSlot(undefined, {
      kind: "event",
      event: sourceEvent({ added: 1, changed: 0, removed: 0 }),
    });
    expect(current).not.toBeUndefined();

    expect(nextToastSlot(current, { kind: "dismiss" })).toBeUndefined();
    expect(nextToastSlot(undefined, { kind: "dismiss" })).toBeUndefined();
  });

  it("an event that itself derives to no toast clears the slot, matching the replace-on-refresh rule", () => {
    const current = nextToastSlot(undefined, {
      kind: "event",
      event: sourceEvent({ added: 1, changed: 0, removed: 0 }),
    });

    const cleared = nextToastSlot(current, { kind: "event", event: lockEvent });

    expect(cleared).toBeUndefined();
  });
});

describe("handleRefreshEvent", () => {
  it.each([
    ["a source event with a nonzero delta", sourceEvent({ added: 1, changed: 0, removed: 0 })],
    ["a targets event with a nonzero delta", targetsEvent({ added: 0, changed: 1, removed: 0 })],
    ["a zero-delta event", sourceEvent({ added: 0, changed: 0, removed: 0 })],
    ["a lock event", lockEvent],
  ] as const)(
    "reads every file event as a files refresh, independent of whether a toast is populated (%s)",
    (_label, event) => {
      expect(handleRefreshEvent(event).kind).toBe("files");
    },
  );

  it("carries the same toast deriveRefreshToastView would produce", () => {
    const event = sourceEvent({ added: 1, changed: 0, removed: 0 });
    expect(handleRefreshEvent(event)).toEqual({
      kind: "files",
      toast: deriveRefreshToastView(event),
    });
    expect(handleRefreshEvent(lockEvent)).toEqual({ kind: "files", toast: undefined });
  });

  it("reads a git event as a git refresh that carries no toast and never clears one", () => {
    const event: RefreshEvent = { reason: "git", at: "2026-05-04T10:00:00.000Z" };

    expect(handleRefreshEvent(event)).toEqual({ kind: "git" });
    expect(deriveRefreshToastView(event)).toBeUndefined();
  });
});
