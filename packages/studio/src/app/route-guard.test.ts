// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installRouteGuard,
  ROUTE_CHANGE_EVENT,
  type RouteGuard,
  routeChangeBlocked,
  setUnloadWarning,
  visibleHash,
  writeRoute,
} from "./route-guard.js";

let dirty = false;
const onBlock = vi.fn<(proceed: () => Promise<void>) => void>();
const guard: RouteGuard = { isDirty: () => dirty, onBlock };
let uninstall: () => void = () => {};

function idx(): unknown {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "idx" in state ? state.idx : null;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

function startAt(first: string, second: string): void {
  window.history.replaceState({ idx: 10 }, "", first);
  window.history.pushState({ idx: 11 }, "", second);
  uninstall = installRouteGuard(guard);
}

beforeEach(() => {
  dirty = false;
  onBlock.mockReset();
});

afterEach(() => {
  uninstall();
  setUnloadWarning(false);
});

describe("a held Back", () => {
  it("returns to the entry it left, with no lost and no duplicate entry", async () => {
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;

    window.history.back();
    await settle();

    expect(window.location.hash).toBe("#/b");
    expect(idx()).toBe(11);
    expect(window.history.length).toBe(length);
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("goes back for real once the held change is allowed to proceed", async () => {
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;
    window.history.back();
    await settle();

    onBlock.mock.calls[0]?.[0]();
    dirty = false;
    await settle();

    expect(window.location.hash).toBe("#/a");
    expect(idx()).toBe(10);
    expect(window.history.length).toBe(length);
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("keeps the router on the entry it was on while the undo is still in flight", async () => {
    startAt("#/a", "#/b");
    dirty = true;
    const seen: string[] = [];
    const record = (): void => {
      seen.push(visibleHash());
    };
    window.addEventListener("hashchange", record);

    window.history.back();
    await settle();
    window.removeEventListener("hashchange", record);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((hash) => hash === "#/b")).toBe(true);
  });
});

describe("a held Forward", () => {
  it("returns to the entry it left and goes forward for real on proceed", async () => {
    startAt("#/a", "#/b");
    window.history.back();
    await settle();
    expect(idx()).toBe(10);
    const length = window.history.length;
    dirty = true;

    window.history.forward();
    await settle();

    expect(window.location.hash).toBe("#/a");
    expect(window.history.length).toBe(length);

    onBlock.mock.calls[0]?.[0]();
    await settle();

    expect(window.location.hash).toBe("#/b");
    expect(idx()).toBe(11);
    expect(window.history.length).toBe(length);
  });
});

describe("an entry created outside the app", () => {
  it("is held as a push, and proceeding reaches it and stamps it", async () => {
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;

    window.location.hash = "#/typed";
    await settle();

    expect(window.location.hash).toBe("#/b");
    expect(onBlock).toHaveBeenCalledTimes(1);

    onBlock.mock.calls[0]?.[0]();
    dirty = false;
    await settle();

    expect(window.location.hash).toBe("#/typed");
    expect(idx()).toBe(12);
    expect(window.history.length).toBe(length + 1);
  });
});

describe("an entry without a position", () => {
  it("falls back to the unload confirmation alone and holds nothing", async () => {
    window.history.replaceState(null, "", "#/a");
    uninstall = installRouteGuard(guard);
    dirty = true;

    window.location.hash = "#/elsewhere";
    await settle();

    expect(window.location.hash).toBe("#/elsewhere");
    expect(onBlock).not.toHaveBeenCalled();
  });
});

describe("a clean traversal", () => {
  it("goes through and is then guarded from where it landed", async () => {
    startAt("#/a", "#/b");
    window.history.back();
    await settle();
    expect(window.location.hash).toBe("#/a");
    dirty = true;

    window.history.forward();
    await settle();

    expect(window.location.hash).toBe("#/a");
    expect(onBlock).toHaveBeenCalledTimes(1);
  });
});

describe("a held push or replace", () => {
  it("adds no entry while held, and exactly one when a push proceeds", () => {
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;

    expect(routeChangeBlocked("#/c", "push")).toBe(true);

    expect(window.history.length).toBe(length);
    expect(window.location.hash).toBe("#/b");

    onBlock.mock.calls[0]?.[0]();

    expect(window.history.length).toBe(length + 1);
    expect(window.location.hash).toBe("#/c");
    expect(idx()).toBe(12);
  });

  it("adds no entry at all when a replace proceeds", () => {
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;
    routeChangeBlocked("#/c", "replace");

    onBlock.mock.calls[0]?.[0]();

    expect(window.history.length).toBe(length);
    expect(window.location.hash).toBe("#/c");
    expect(idx()).toBe(11);
  });

  it("lets a change through while nothing is unsaved", () => {
    startAt("#/a", "#/b");

    expect(routeChangeBlocked("#/c", "push")).toBe(false);
    expect(onBlock).not.toHaveBeenCalled();
  });

  it("never holds a change to the address it is already on", () => {
    startAt("#/a", "#/b");
    dirty = true;

    expect(routeChangeBlocked("#/b", "push")).toBe(false);
  });

  it("holds nothing once the guard is gone", () => {
    startAt("#/a", "#/b");
    dirty = true;
    uninstall();

    expect(routeChangeBlocked("#/c", "push")).toBe(false);
  });

  it("keeps a newer guard when an older one is removed late", () => {
    startAt("#/a", "#/b");
    const newer = installRouteGuard({ isDirty: () => true, onBlock });
    uninstall();
    uninstall = newer;

    expect(routeChangeBlocked("#/c", "push")).toBe(true);
  });
});

describe("writeRoute", () => {
  it("pushes the next position, replaces the current one, and announces both", () => {
    startAt("#/a", "#/b");
    const announced = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, announced);
    const length = window.history.length;

    writeRoute("push", "#/c");
    writeRoute("replace", "#/d");
    window.removeEventListener(ROUTE_CHANGE_EVENT, announced);

    expect(window.history.length).toBe(length + 1);
    expect(idx()).toBe(12);
    expect(window.location.hash).toBe("#/d");
    expect(announced).toHaveBeenCalledTimes(2);
  });
});

describe("leaving the page", () => {
  function leave(): Event {
    const event = new Event("beforeunload", { cancelable: true });
    Object.defineProperty(event, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(event);
    return event;
  }

  it("asks the browser to confirm only while the warning is on", () => {
    setUnloadWarning(true);
    const warned = leave();
    setUnloadWarning(false);
    const quiet = leave();

    expect(warned.defaultPrevented).toBe(true);
    expect(Reflect.get(warned, "returnValue")).toBe("");
    expect(quiet.defaultPrevented).toBe(false);
  });

  it("switches the warning off when the guard goes away", () => {
    startAt("#/a", "#/b");
    setUnloadWarning(true);

    uninstall();

    expect(leave().defaultPrevented).toBe(false);
  });
});

describe("rapid traversals before the undo has landed", () => {
  let hashes: readonly string[] = [];
  let cursor = 0;
  let queue: number[] = [];

  function land(target: number): void {
    cursor = target;
    window.history.replaceState({ idx: 10 + target }, "", hashes[target]);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function userTraverses(delta: number): void {
    land(cursor + delta);
  }

  function drain(): void {
    for (let guardRail = 0; queue.length > 0; guardRail += 1) {
      expect(guardRail).toBeLessThan(50);
      const delta = queue.shift() ?? 0;
      const target = cursor + delta;
      if (target >= 0 && target < hashes.length) {
        land(target);
      }
    }
  }

  function startOn(entries: readonly string[], current: number): void {
    hashes = entries;
    cursor = current;
    queue = [];
    vi.spyOn(window.history, "go").mockImplementation((delta) => {
      queue.push(delta ?? 0);
    });
    window.history.replaceState({ idx: 10 + current }, "", entries[current]);
    uninstall = installRouteGuard(guard);
    dirty = true;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns to the held entry after a double Back, and then lets a clean Back through", () => {
    startOn(["#/a", "#/b", "#/c"], 2);

    userTraverses(-1);
    userTraverses(-1);
    drain();

    expect(window.location.hash).toBe("#/c");
    expect(idx()).toBe(12);
    expect(visibleHash()).toBe("#/c");
    expect(onBlock).toHaveBeenCalledTimes(1);

    dirty = false;
    userTraverses(-1);

    expect(window.location.hash).toBe("#/b");
    expect(visibleHash()).toBe("#/b");
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("returns to the held entry after a Back and a Forward before the echo", () => {
    startOn(["#/a", "#/b", "#/c", "#/d"], 2);

    userTraverses(-1);
    userTraverses(2);
    drain();

    expect(window.location.hash).toBe("#/c");
    expect(idx()).toBe(12);
    expect(visibleHash()).toBe("#/c");
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("returns to the held entry after three rapid Backs", () => {
    startOn(["#/a", "#/b", "#/c", "#/d"], 3);

    userTraverses(-1);
    userTraverses(-1);
    userTraverses(-1);
    drain();

    expect(window.location.hash).toBe("#/d");
    expect(idx()).toBe(13);
    expect(visibleHash()).toBe("#/d");
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("holds the next traversal again once the earlier one has settled", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);
    userTraverses(-1);
    drain();

    userTraverses(-1);
    drain();

    expect(window.location.hash).toBe("#/c");
    expect(onBlock).toHaveBeenCalledTimes(2);
  });
});
