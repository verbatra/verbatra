// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics-client")>()),
  reloadPage: vi.fn(),
}));

const { AnalyticsLoader, BEFORE_SEND_NAME, RECORDER_ID, TRACKER_ID } = await import(
  "./analytics-loader"
);
const { CHOICE_EVENT, reloadPage } = await import("@/lib/analytics-client");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function mount(): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AnalyticsLoader />);
  });
  mounted = { container, root };
}

function setChoice(value: string): void {
  document.cookie = `verbatra_analytics=${value}; Path=/`;
}

function script(id: string): HTMLScriptElement | null {
  return document.getElementById(id) as HTMLScriptElement | null;
}

beforeEach(() => {
  document.cookie = "verbatra_analytics=; Max-Age=0; Path=/";
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  for (const element of document.querySelectorAll("script")) element.remove();
  Reflect.deleteProperty(window, BEFORE_SEND_NAME);
  Reflect.deleteProperty(navigator, "globalPrivacyControl");
  Reflect.deleteProperty(navigator, "doNotTrack");
  document.cookie = "verbatra_analytics=; Max-Age=0; Path=/";
  vi.clearAllMocks();
});

describe("AnalyticsLoader", () => {
  it("renders no markup, so prerendered pages carry no script tag", () => {
    expect(renderToStaticMarkup(<AnalyticsLoader />)).toBe("");
  });

  it.each([
    ["no choice", undefined],
    ["the default choice", "default"],
    ["the off choice", "off"],
    ["an unknown value", "maybe"],
  ])("injects nothing with %s", async (_name, value) => {
    if (value !== undefined) setChoice(value);
    await mount();
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it.each([
    ["global privacy control", { globalPrivacyControl: true }],
    ["do not track", { doNotTrack: "1" }],
  ])("injects nothing under %s even with the full choice", async (_name, values) => {
    setChoice("full");
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(navigator, name, { value, configurable: true });
    }
    await mount();
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("injects the tracker and then the recorder from the Umami origin after the full choice", async () => {
    setChoice("full");
    await mount();
    const scripts = Array.from(document.querySelectorAll("script"));
    expect(scripts.map((element) => element.id)).toEqual([TRACKER_ID, RECORDER_ID]);
    expect(scripts.map((element) => element.src)).toEqual([
      "https://umami.kreitz-webdev.de/script.js",
      "https://umami.kreitz-webdev.de/recorder.js",
    ]);
    expect(scripts.every((element) => element.defer)).toBe(true);
  });

  it("configures the tracker for one site, no hash pageviews and the sanitiser", async () => {
    setChoice("full");
    await mount();
    const tracker = script(TRACKER_ID);
    expect(tracker?.dataset.websiteId).toBe("fcf007b7-4579-4486-881c-e8686d61d63d");
    expect(tracker?.dataset.excludeHash).toBe("true");
    expect(tracker?.dataset.domains).toBe("verbatra.kreitz-webdev.de");
    expect(tracker?.dataset.beforeSend).toBe(BEFORE_SEND_NAME);
    expect(Array.from(tracker?.attributes ?? [], (attribute) => attribute.name).sort()).toEqual([
      "data-before-send",
      "data-domains",
      "data-exclude-hash",
      "data-website-id",
      "defer",
      "id",
      "src",
    ]);
  });

  it("gives the recorder only the website id", async () => {
    setChoice("full");
    await mount();
    const recorder = script(RECORDER_ID);
    expect(Array.from(recorder?.attributes ?? [], (attribute) => attribute.name).sort()).toEqual([
      "data-website-id",
      "defer",
      "id",
      "src",
    ]);
  });

  it("defines the sanitiser before the tracker is injected", async () => {
    setChoice("full");
    await mount();
    const beforeSend = Reflect.get(window, BEFORE_SEND_NAME) as (
      type: string,
      payload: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(beforeSend("event", { screen: "1x1", url: "/docs?q=1", website: "id" })).toEqual({
      url: "/docs",
      website: "id",
    });
  });

  it("injects once, however often the effect runs", async () => {
    setChoice("full");
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event(CHOICE_EVENT));
    });
    expect(document.querySelectorAll("script")).toHaveLength(2);
  });

  it("injects without a reload when the full choice is announced", async () => {
    await mount();
    setChoice("full");
    await act(async () => {
      window.dispatchEvent(new Event(CHOICE_EVENT));
    });
    expect(document.querySelectorAll("script")).toHaveLength(2);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("reloads when a choice other than full is announced after the scripts loaded", async () => {
    setChoice("full");
    await mount();
    setChoice("off");
    await act(async () => {
      window.dispatchEvent(new Event(CHOICE_EVENT));
    });
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it("does nothing when a non-full choice is announced and nothing was injected", async () => {
    await mount();
    setChoice("default");
    await act(async () => {
      window.dispatchEvent(new Event(CHOICE_EVENT));
    });
    expect(reloadPage).not.toHaveBeenCalled();
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("stops listening when it unmounts", async () => {
    await mount();
    act(() => mounted?.root.unmount());
    setChoice("full");
    window.dispatchEvent(new Event(CHOICE_EVENT));
    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  it("reads and writes no storage", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    setChoice("full");
    await mount();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
