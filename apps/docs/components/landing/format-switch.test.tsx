// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";

vi.mock("@/lib/umami", () => ({ trackUmamiEvent: vi.fn() }));

const chunk = vi.hoisted(() => ({ failures: 0, imports: 0 }));

vi.mock("./format-pane", async (importOriginal) => {
  chunk.imports += 1;
  if (chunk.failures > 0) {
    chunk.failures -= 1;
    throw new Error("chunk failed");
  }
  return importOriginal();
});

vi.mock("@/lib/retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/retry")>();
  return {
    ...actual,
    retrying: <T,>(load: () => Promise<T>) => actual.retrying(load, [0]),
  };
});

const { FormatSwitch } = await import("./format-switch");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const [, SECOND] = SUPPORTED_FORMAT_IDS;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
});

function mount(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <FormatSwitch
        labels={{ frameworks: "Frameworks", formats: "Formats" }}
        frameworks={[]}
        formats={SUPPORTED_FORMAT_IDS.map((id) => ({
          id,
          label: FORMAT_DISPLAY[id].label,
          file: FORMAT_SAMPLES[id].file,
        }))}
        initialPane={<p data-initial>initial</p>}
        sizer={null}
      />,
    ),
  );
  mounted = { container, root };
  return container;
}

function activePanel(container: HTMLElement): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')].find(
    (panel) => panel.dataset.active === "true",
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

function selectSecond(container: HTMLElement): void {
  const tab = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
  act(() => tab?.click());
}

describe("FormatSwitch", () => {
  it("retries a failed chunk, keeps the caption without a busy state when it gives up, and loads again on the next intent", async () => {
    chunk.failures = 2;
    const container = mount();
    selectSecond(container);
    await vi.waitFor(async () => {
      await settle();
      expect(activePanel(container)?.querySelector("section")?.hasAttribute("aria-busy")).toBe(
        false,
      );
    });
    expect(chunk.imports).toBe(2);
    const failed = activePanel(container);
    expect(failed?.querySelector("figcaption")?.textContent).toBe(
      FORMAT_SAMPLES[SECOND ?? "xliff"].file,
    );
    expect(failed?.querySelector("section")?.hasAttribute("aria-busy")).toBe(false);
    expect(failed?.querySelector("pre")).toBeNull();
    act(() => {
      container
        .querySelector(".vk-formats-switch")
        ?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await vi.waitFor(async () => {
      await settle();
      expect(activePanel(container)?.querySelector("pre")).not.toBeNull();
    });
    expect(chunk.imports).toBe(3);
  });

  it("shows the chosen file's caption at once and the pane once its chunk arrives", async () => {
    if (!SECOND) throw new Error("needs two formats");
    const container = mount();
    selectSecond(container);
    const waiting = activePanel(container);
    expect(waiting?.querySelector("figcaption")?.textContent).toBe(FORMAT_SAMPLES[SECOND].file);
    expect(waiting?.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
    await vi.waitFor(async () => {
      await settle();
      expect(activePanel(container)?.querySelector("pre")?.textContent).toBe(
        FORMAT_SAMPLES[SECOND].text.replace(/\n$/, ""),
      );
    });
  });

  it("shares one request between every intent", async () => {
    const { loadFormatPanes } = await import("./format-switch");
    expect(loadFormatPanes()).toBe(loadFormatPanes());
  });
});
