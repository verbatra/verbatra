// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitHash,
  installRouteGuard,
  ROUTE_CHANGE_EVENT,
  type RouteGuard,
  routeChangeBlocked,
} from "./route-guard.js";

const EDITOR = "#/translations?key=app.title";
const OTHER_KEY = "#/translations?key=app.body";

let dirty = false;
const onBlock = vi.fn<(proceed: () => void) => void>();
const guard: RouteGuard = { isDirty: () => dirty, onBlock };
let uninstall: () => void = () => {};

async function hashChange(next: string): Promise<void> {
  const settled = new Promise<void>((resolve) => {
    window.addEventListener("hashchange", () => resolve(), { once: true });
  });
  window.location.hash = next;
  await settled;
}

beforeEach(() => {
  dirty = false;
  onBlock.mockReset();
  window.history.replaceState(null, "", EDITOR);
  uninstall = installRouteGuard(guard);
});

afterEach(() => {
  uninstall();
  window.history.replaceState(null, "", "#/");
});

describe("routeChangeBlocked", () => {
  it("lets any change through while nothing is unsaved", () => {
    expect(routeChangeBlocked(OTHER_KEY)).toBe(false);
    expect(onBlock).not.toHaveBeenCalled();
  });

  it("blocks a change while edits are unsaved, and hands over a way to apply it later", () => {
    dirty = true;

    expect(routeChangeBlocked(OTHER_KEY)).toBe(true);
    expect(window.location.hash).toBe(EDITOR);
    const proceed = onBlock.mock.calls[0]?.[0];
    proceed?.();
    expect(window.location.hash).toBe(OTHER_KEY);
  });

  it("never blocks a change to the address it is already on", () => {
    dirty = true;

    expect(routeChangeBlocked(EDITOR)).toBe(false);
  });

  it("blocks nothing once the guard is gone", () => {
    dirty = true;
    uninstall();

    expect(routeChangeBlocked(OTHER_KEY)).toBe(false);
  });

  it("keeps a newer guard when an older one is removed late", () => {
    const newer = installRouteGuard({ isDirty: () => true, onBlock });
    uninstall();
    uninstall = newer;

    expect(routeChangeBlocked(OTHER_KEY)).toBe(true);
  });
});

describe("hash changes made outside the app", () => {
  it("restores the address and blocks while edits are unsaved", async () => {
    dirty = true;
    const announced = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, announced);

    await hashChange("#/review");

    expect(window.location.hash).toBe(EDITOR);
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(announced).toHaveBeenCalled();
    window.removeEventListener(ROUTE_CHANGE_EVENT, announced);
  });

  it("restores the address before listeners registered after the module loaded get to read it", async () => {
    dirty = true;
    const seen: string[] = [];
    const early = (): void => {
      seen.push(window.location.hash);
    };
    window.addEventListener("hashchange", early);

    await hashChange("#/review");
    window.removeEventListener("hashchange", early);

    expect(seen).toEqual([EDITOR]);
  });

  it("applies the address that was reached when the caller proceeds", async () => {
    dirty = true;
    await hashChange("#/review");

    onBlock.mock.calls[0]?.[0]();

    expect(window.location.hash).toBe("#/review");
  });

  it("follows the address and stays out of the way while nothing is unsaved", async () => {
    await hashChange("#/review");
    dirty = true;
    window.history.replaceState(null, "", "#/review");

    await hashChange("#/glossary");

    expect(window.location.hash).toBe("#/review");
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("follows a clean address change made by the app itself", () => {
    window.history.replaceState(null, "", OTHER_KEY);
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
    dirty = true;
    window.location.hash = OTHER_KEY;

    expect(routeChangeBlocked("#/review")).toBe(true);
  });

  it("restores to the address the app last committed, not the one it started on", async () => {
    dirty = true;
    commitHash(OTHER_KEY);

    await hashChange("#/review");

    expect(window.location.hash).toBe(OTHER_KEY);
  });
});

describe("commitHash", () => {
  it("replaces the address without adding a history entry, and announces it", () => {
    const length = window.history.length;
    const announced = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, announced);

    commitHash(OTHER_KEY);

    expect(window.location.hash).toBe(OTHER_KEY);
    expect(window.history.length).toBe(length);
    expect(announced).toHaveBeenCalledTimes(1);
    window.removeEventListener(ROUTE_CHANGE_EVENT, announced);
  });
});
