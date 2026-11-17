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
  error: "Could not save your choice. Please try again.",
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

class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
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

  it("marks the page while it shows, so the stylesheet can clear space and lift the back-to-top button", async () => {
    const container = await render();
    expect(document.documentElement.hasAttribute("data-analytics-prompt")).toBe(true);
    stubPost("default");
    await click(container, "No thanks");
    expect(document.documentElement.hasAttribute("data-analytics-prompt")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--analytics-prompt-clearance")).toBe(
      "",
    );
  });

  it("removes the page mark when it unmounts", async () => {
    await render();
    act(() => mounted?.root.unmount());
    mounted = undefined;
    expect(document.documentElement.hasAttribute("data-analytics-prompt")).toBe(false);
  });

  it("hides on Escape for this page view without storing or announcing a choice", async () => {
    const post = stubPost("default");
    const listener = vi.fn();
    window.addEventListener(CHOICE_EVENT, listener);
    const container = await render();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    window.removeEventListener(CHOICE_EVENT, listener);
    expect(container.querySelector("section")).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("verbatra_analytics=");
    expect(document.documentElement.hasAttribute("data-analytics-prompt")).toBe(false);
  });

  it("ignores other keys", async () => {
    const container = await render();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(container.querySelector("section")).not.toBeNull();
  });

  it("gives every button a 44px touch target and styles the link like the site's links", async () => {
    const container = await render();
    for (const button of container.querySelectorAll("button")) {
      expect(button.className.split(" ")).toContain("min-h-11");
    }
    expect(container.querySelector("a")?.className.split(" ")).toContain("vk-prose-link");
  });

  it("says so in a status line when the choice could not be saved, and clears it on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const container = await render();
    await click(container, "No thanks");
    expect(container.querySelector("[role='status']")?.textContent).toBe(LABELS.error);
    stubPost("default");
    await click(container, "No thanks");
    expect(container.querySelector("section")).toBeNull();
  });

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
