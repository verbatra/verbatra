// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { Route } from "../client/routes.js";
import { render } from "./test-support.js";
import { navigateToPage, replaceRoute, useAliasRedirect, useRoute } from "./use-route.js";

function RouteProbe({ onRoute }: { readonly onRoute: (route: Route) => void }): null {
  onRoute(useRoute());
  useAliasRedirect();
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
    const probe = mountProbe();

    act(() => replaceRoute({ page: "review", params: { locale: "de" } }));

    expect(probe.latest().page).toBe("review");
  });

  it("follows a navigation to another page", () => {
    window.history.replaceState(null, "", "#/translations");
    const probe = mountProbe();

    act(() => navigateToPage("glossary"));

    expect(probe.latest().page).toBe("glossary");
    expect(window.location.hash).toBe("#/glossary");
  });
});

describe("useAliasRedirect", () => {
  it("rewrites #/activity to #/overview without adding a history entry", () => {
    window.history.replaceState(null, "", "#/activity");
    const entries = window.history.length;

    const probe = mountProbe();

    expect(window.location.hash).toBe("#/overview");
    expect(window.history.length).toBe(entries);
    expect(probe.latest().page).toBe("overview");
  });

  it("leaves a canonical hash alone", () => {
    window.history.replaceState(null, "", "#/review?locale=de");

    mountProbe();

    expect(window.location.hash).toBe("#/review?locale=de");
  });
});
