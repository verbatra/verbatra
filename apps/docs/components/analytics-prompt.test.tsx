// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHOICE_EVENT } from "@/lib/analytics-client";
import { clearDocumentCookie, setDocumentCookie } from "../test-support/document-cookie";
import { AnalyticsPrompt, type AnalyticsPromptLabels } from "./analytics-prompt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: AnalyticsPromptLabels = {
  label: "Analytics choice",
  title: "Help us improve the docs?",
  body: "Replays and heatmaps, inputs masked.",
  allow: "Allow",
  decline: "No thanks",
  privacy: "Privacy policy and settings",
};

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function render(locale: "en" | "de" = "en"): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AnalyticsPrompt locale={locale} labels={LABELS} />);
  });
  mounted = { container, root };
  return container;
}

function stubPost(cookie: string | undefined): ReturnType<typeof vi.fn> {
  const post = vi.fn(async () => {
    if (cookie !== undefined) setDocumentCookie("verbatra_analytics", cookie);
    return new Response(null, { status: 303 });
  });
  vi.stubGlobal("fetch", post);
  return post;
}

function click(container: HTMLElement, name: string): Promise<void> {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === name,
  );
  if (!button) throw new Error(`no button ${name}`);
  return act(async () => {
    button.click();
  });
}

beforeEach(() => {
  clearDocumentCookie("verbatra_analytics");
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "globalPrivacyControl");
  Reflect.deleteProperty(navigator, "doNotTrack");
  clearDocumentCookie("verbatra_analytics");
});

describe("AnalyticsPrompt", () => {
  it("renders nothing on the server, so prerendered pages carry no prompt", () => {
    expect(renderToStaticMarkup(<AnalyticsPrompt locale="en" labels={LABELS} />)).toBe("");
  });

  it("shows a labelled region with equal Allow and No thanks buttons when undecided", async () => {
    const container = await render();
    const region = container.querySelector("section");
    expect(region?.getAttribute("aria-label")).toBe("Analytics choice");
    expect(region?.className.split(" ")).toContain("rr-block");
    expect(region?.textContent).toContain("Help us improve the docs?");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["Allow", "No thanks"]);
    expect(new Set(buttons.map((button) => button.className)).size).toBe(1);
  });

  it("links to the localized privacy settings", async () => {
    const container = await render("de");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/de/privacy#analytics");
    expect((await render("en")).querySelector("a")?.getAttribute("href")).toBe(
      "/privacy#analytics",
    );
  });

  it.each(["full", "default", "off"])("stays hidden once the choice %s exists", async (value) => {
    setDocumentCookie("verbatra_analytics", value);
    const container = await render();
    expect(container.querySelector("section")).toBeNull();
  });

  it.each([
    ["global privacy control", { globalPrivacyControl: true }],
    ["do not track", { doNotTrack: "1" }],
  ])("stays hidden under %s", async (_name, values) => {
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(navigator, name, { value, configurable: true });
    }
    const container = await render();
    expect(container.querySelector("section")).toBeNull();
  });

  it.each([
    ["Allow", "full"],
    ["No thanks", "default"],
  ])(
    "%s posts the choice %s to the opt-out route, hides, and announces it",
    async (name, choice) => {
      const post = stubPost(choice);
      const listener = vi.fn();
      window.addEventListener(CHOICE_EVENT, listener);
      const container = await render("de");
      await click(container, name);
      window.removeEventListener(CHOICE_EVENT, listener);

      expect(post).toHaveBeenCalledTimes(1);
      const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/analytics");
      expect(init.method).toBe("POST");
      expect(init.redirect).toBe("manual");
      expect(init.credentials).toBe("same-origin");
      expect(new Headers(init.headers).get("content-type")).toBe(
        "application/x-www-form-urlencoded",
      );
      expect(String(init.body)).toBe(`choice=${choice}&lang=de`);
      expect(container.querySelector("section")).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    },
  );

  it("stays visible and silent when the cookie was not stored", async () => {
    stubPost(undefined);
    const listener = vi.fn();
    window.addEventListener(CHOICE_EVENT, listener);
    const container = await render();
    await click(container, "Allow");
    window.removeEventListener(CHOICE_EVENT, listener);
    expect(container.querySelector("section")).not.toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("stays visible when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const container = await render();
    await click(container, "No thanks");
    expect(container.querySelector("section")).not.toBeNull();
  });
});
