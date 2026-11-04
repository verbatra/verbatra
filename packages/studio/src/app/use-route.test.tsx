// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Route } from "../client/routes.js";
import { render } from "./test-support.js";
import { navigateToPage, replaceRoute, useCanonicalHash, useRoute } from "./use-route.js";

function RouteProbe({ onRoute }: { readonly onRoute: (route: Route) => void }): null {
  onRoute(useRoute());
  useCanonicalHash();
  return null;
}

function mountProbe(): { readonly latest: () => Route } {
  let latest: Route = { page: "translations", params: {} };
  render(<RouteProbe onRoute={(route) => (latest = route)} />);
  return { latest: () => latest };
}

describe("useRoute", () => {
  it("reads the route from the current hash", () => {
    window.history.replaceState(null, "", "#/review?locale=de");

    const probe = mountProbe();

    expect(probe.latest()).toEqual({ page: "review", params: { locale: "de" } });
  });

  it("updates when the route is replaced and leaves the history length alone", () => {
    window.history.replaceState(null, "", "#/translations");
    const probe = mountProbe();
    const entries = window.history.length;

    act(() => replaceRoute({ page: "translations", params: { locale: "fr" } }));

    expect(probe.latest().params).toEqual({ locale: "fr" });
    expect(window.location.hash).toBe("#/translations?locale=fr");
    expect(window.history.length).toBe(entries);
  });

  it("does not touch history when the route already matches", () => {
    window.history.replaceState(null, "", "#/review?locale=de");
    mountProbe();
    const replaceState = vi.spyOn(window.history, "replaceState");

    act(() => replaceRoute({ page: "review", params: { locale: "de" } }));

    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it("keeps filters, key and history when the active page is chosen again", () => {
    window.history.replaceState(null, "", "#/translations?locale=de&key=a.b");
    const probe = mountProbe();
    const entries = window.history.length;

    act(() => navigateToPage("translations"));

    expect(window.location.hash).toBe("#/translations?locale=de&key=a.b");
    expect(probe.latest().params).toEqual({ locale: "de", key: "a.b" });
    expect(window.history.length).toBe(entries);
  });

  it("follows a navigation to another page", () => {
    window.history.replaceState(null, "", "#/translations");
    const probe = mountProbe();

    act(() => navigateToPage("glossary"));

    expect(probe.latest().page).toBe("glossary");
    expect(window.location.hash).toBe("#/glossary");
  });
});

describe("useCanonicalHash", () => {
  it("rewrites #/activity to #/overview without adding a history entry", () => {
    window.history.replaceState(null, "", "#/activity");
    const entries = window.history.length;

    const probe = mountProbe();

    expect(window.location.hash).toBe("#/overview");
    expect(window.history.length).toBe(entries);
    expect(probe.latest().page).toBe("overview");
  });

  it("canonicalizes an unknown page to the default page and drops its params", () => {
    window.history.replaceState(null, "", "#/nonsense?locale=de&key=x");
    const entries = window.history.length;

    const probe = mountProbe();

    expect(window.location.hash).toBe("#/overview");
    expect(window.history.length).toBe(entries);
    expect(probe.latest().params).toEqual({});
  });

  it("leaves a canonical hash alone", () => {
    window.history.replaceState(null, "", "#/review?locale=de");

    mountProbe();

    expect(window.location.hash).toBe("#/review?locale=de");
  });
});
