// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import {
  installRouteGuard,
  ROUTE_CHANGE_EVENT,
  type RouteGuard,
  restoreHeldRoute,
  routeChangeBlocked,
  setUnloadWarning,
  visibleHash,
  writeRoute,
} from "./route-guard.js";
import { settleHistory as settle } from "./test-support.js";

let dirty = false;
const onBlock = vi.fn<(proceed: () => Promise<void>) => void>();
const onRelease = vi.fn<() => void>();
const guard: RouteGuard = { isDirty: () => dirty, onBlock, onRelease };
let uninstall: () => void = () => {};
let goSpy: MockInstance<History["go"]>;

function idx(): unknown {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "idx" in state ? state.idx : null;
}

function proceedOf(call: number): () => Promise<void> {
  const proceed = onBlock.mock.calls[call]?.[0];
  if (proceed === undefined) {
    throw new Error(`no hold number ${call}`);
  }
  return proceed;
}

function startAt(first: string, second: string): void {
  window.history.replaceState({ idx: 10 }, "", first);
  window.history.pushState({ idx: 11 }, "", second);
  uninstall = installRouteGuard(guard);
}

beforeEach(() => {
  dirty = false;
  onBlock.mockReset();
  onRelease.mockReset();
  goSpy = vi.spyOn(window.history, "go").mockImplementation(() => {});
});

afterEach(() => {
  uninstall();
  setUnloadWarning(false);
  vi.restoreAllMocks();
});

describe("a stack with forward entries", () => {
  let hashes: readonly string[] = [];
  let cursor = 0;

  function land(target: number): void {
    cursor = target;
    window.history.replaceState({ idx: 10 + target }, "", hashes[target]);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function userTraverses(delta: number): void {
    const target = cursor + delta;
    if (target >= 0 && target < hashes.length) {
      land(target);
    }
  }

  function hashPush(hash: string): void {
    cursor += 1;
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function startOn(entries: readonly string[], current: number): void {
    hashes = entries;
    cursor = current;
    window.history.replaceState({ idx: 10 + current }, "", entries[current]);
    uninstall = installRouteGuard(guard);
    dirty = true;
  }

  it("holds a run of Backs and Forwards, unstamped landings included, without ever calling go", () => {
    startOn(["#/a", "#/b", "#/c", "#/d", "#/e", "#/f", "#/g"], 2);

    userTraverses(-1);
    userTraverses(-1);
    userTraverses(3);
    userTraverses(-2);
    hashPush("#/x");
    userTraverses(1);

    expect(goSpy).not.toHaveBeenCalled();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(visibleHash()).toBe("#/c");
  });

  it("gives one hold for a landing delivered as popstate and hashchange", () => {
    startOn(["#/a", "#/b", "#/c"], 2);

    userTraverses(-1);

    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(visibleHash()).toBe("#/c");
    expect(window.location.hash).toBe("#/b");
  });

  it("restores a Back Back with exactly one go, never go(0), and then lets a clean Back through", () => {
    startOn(["#/a", "#/b", "#/c", "#/d", "#/e"], 2);
    userTraverses(-1);
    userTraverses(-1);

    restoreHeldRoute();
    restoreHeldRoute();

    expect(goSpy).toHaveBeenCalledTimes(1);
    expect(goSpy).toHaveBeenCalledWith(2);

    land(2);
    expect(onRelease).not.toHaveBeenCalled();
    dirty = false;
    userTraverses(-1);

    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(visibleHash()).toBe("#/b");
    expect(goSpy).toHaveBeenCalledTimes(1);
  });

  it("never calls go(0) when the held landing is the position itself", () => {
    startOn(["#/a", "#/b", "#/c"], 2);

    restoreHeldRoute();

    expect(goSpy).not.toHaveBeenCalled();
  });

  it("opens a new hold for a Back queued before the restore lands, and issues no further go", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);

    restoreHeldRoute();
    userTraverses(-1);
    land(1);

    expect(onBlock).toHaveBeenCalledTimes(2);
    expect(goSpy).toHaveBeenCalledTimes(1);
    expect(goSpy).toHaveBeenCalledWith(1);
  });

  it("stamps a landing nobody stamped as the last position plus one, and restores it with replaceState alone", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);

    hashPush("#/x");

    expect(idx()).toBe(12);
    expect(visibleHash()).toBe("#/c");

    restoreHeldRoute();

    expect(goSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/c");
    expect(idx()).toBe(12);
    expect(visibleHash()).toBe("#/c");
  });

  it("keeps the hold when the hashchange echo of an unstamped landing reads the stamp it just got", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);

    hashPush("#/x");

    expect(onRelease).not.toHaveBeenCalled();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(visibleHash()).toBe("#/c");
  });

  it("restores a Back Back and a hash push from d with replaceState alone, never an out-of-range go", () => {
    startOn(["#/a", "#/b", "#/c", "#/d"], 3);
    userTraverses(-1);
    userTraverses(-1);
    hashPush("#/x");
    userTraverses(-1);

    restoreHeldRoute();

    expect(goSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/d");
    expect(visibleHash()).toBe("#/d");
  });

  it("does not treat the entry that replaced the position as the position, even with the same index", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);
    hashPush("#/x");
    userTraverses(-1);

    userTraverses(1);

    expect(onRelease).not.toHaveBeenCalled();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(visibleHash()).toBe("#/c");
    expect(goSpy).not.toHaveBeenCalled();
  });

  it("adopts the current entry when a proceed follows two Backs", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);
    userTraverses(-1);

    proceedOf(0)();

    expect(visibleHash()).toBe("#/a");
    expect(window.location.hash).toBe("#/a");
    expect(idx()).toBe(10);
  });

  it("restores an unstamped push that sits after the position with a go back", () => {
    startOn(["#/a", "#/b", "#/c"], 2);

    hashPush("#/x");
    restoreHeldRoute();

    expect(idx()).toBe(13);
    expect(goSpy).toHaveBeenCalledTimes(1);
    expect(goSpy).toHaveBeenCalledWith(-1);
  });

  it("clears the hold and tells the guard when a landing returns to the position", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);

    userTraverses(1);

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(goSpy).not.toHaveBeenCalled();
    expect(visibleHash()).toBe("#/c");
    restoreHeldRoute();
    expect(goSpy).not.toHaveBeenCalled();
  });

  it("resolves a proceed in the same tick, with the router on the real address and the position moved", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);

    const resolved = proceedOf(0)();

    expect(visibleHash()).toBe(window.location.hash);
    expect(visibleHash()).toBe("#/b");
    expect(goSpy).not.toHaveBeenCalled();
    userTraverses(1);
    expect(onBlock).toHaveBeenCalledTimes(2);
    return expect(resolved).resolves.toBeUndefined();
  });

  it("chains an in-app push made during a hold from the held entry, adding exactly one entry", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);
    const length = window.history.length;

    expect(routeChangeBlocked("#/n", "push")).toBe(true);
    proceedOf(1)();

    expect(window.history.length).toBe(length + 1);
    expect(window.location.hash).toBe("#/n");
    expect(idx()).toBe(12);
    expect(goSpy).not.toHaveBeenCalled();
    expect(visibleHash()).toBe("#/n");
  });

  it("drops the hold and the unload warning when the guard goes away, without any go", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);
    setUnloadWarning(true);

    uninstall();

    expect(visibleHash()).toBe(window.location.hash);
    expect(goSpy).not.toHaveBeenCalled();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    userTraverses(-1);
    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it("adopts a clean traversal and never prompts", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    dirty = false;

    userTraverses(-1);
    userTraverses(-1);

    expect(onBlock).not.toHaveBeenCalled();
    expect(visibleHash()).toBe("#/a");
    expect(idx()).toBe(10);
  });

  it("adopts a landing once the draft is no longer dirty, dropping the hold", () => {
    startOn(["#/a", "#/b", "#/c"], 2);
    userTraverses(-1);
    dirty = false;

    userTraverses(-1);

    expect(visibleHash()).toBe("#/a");
    expect(onBlock).toHaveBeenCalledTimes(1);
    restoreHeldRoute();
    expect(goSpy).not.toHaveBeenCalled();
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

describe("a real back in the browser model", () => {
  it("is held, shows the target while held, and goes back for real on restore", async () => {
    goSpy.mockRestore();
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;

    window.history.back();
    await settle();

    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/a");
    expect(visibleHash()).toBe("#/b");

    restoreHeldRoute();
    await settle();

    expect(window.location.hash).toBe("#/b");
    expect(idx()).toBe(11);
    expect(window.history.length).toBe(length);
    expect(visibleHash()).toBe("#/b");
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

    proceedOf(0)();

    expect(window.history.length).toBe(length + 1);
    expect(window.location.hash).toBe("#/c");
    expect(idx()).toBe(12);
  });

  it("adds no entry at all when a replace proceeds", () => {
    startAt("#/a", "#/b");
    const length = window.history.length;
    dirty = true;
    routeChangeBlocked("#/c", "replace");

    proceedOf(0)();

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
