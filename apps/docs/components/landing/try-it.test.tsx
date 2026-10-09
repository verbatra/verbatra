// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showcaseRows, showcaseSeed } from "@/lib/showcase-scenarios";
import {
  SHOWCASE_LOCK_FILE,
  SHOWCASE_SCENARIOS,
  SHOWCASE_SOURCE_FILE,
  SHOWCASE_TARGET_FILE,
} from "@/lib/showcase-seed";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) =>
    `${namespace}.${key}${values ? JSON.stringify(values) : ""}`,
}));

const trackUmamiEvent = vi.fn();
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

const { TryIt } = await import("./try-it");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SEED = showcaseSeed();
const ROWS = showcaseRows();

function markup(): Document {
  const html = renderToStaticMarkup(<TryIt seed={SEED} rows={ROWS} />);
  return new DOMParser().parseFromString(html, "text/html");
}

describe("TryIt: server-rendered seed", () => {
  it("renders the three files, the seed result and no pressed scenario", () => {
    const doc = markup();
    expect(
      [...doc.querySelectorAll(".vk-showcase-file-name")].map((node) => node.textContent),
    ).toEqual([SHOWCASE_SOURCE_FILE, SHOWCASE_TARGET_FILE, SHOWCASE_LOCK_FILE]);
    expect(doc.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
    expect(doc.querySelector(".vk-showcase-result-title")?.textContent).toBe(
      "landing.showcase.tryIt.result.seed",
    );
    expect(doc.querySelectorAll('.vk-showcase-scenario[aria-pressed="true"]')).toHaveLength(0);
    expect(doc.querySelector<HTMLButtonElement>(".vk-showcase-reset")?.hasAttribute("hidden")).toBe(
      true,
    );
    expect(doc.querySelectorAll("textarea, input, [contenteditable]")).toHaveLength(0);
  });

  it("reserves each file's height for its longest scenario, and the tallest file's on a phone", () => {
    const codes = [...markup().querySelectorAll<HTMLElement>(".vk-showcase-code")];
    expect(codes.map((code) => code.style.getPropertyValue("--showcase-rows"))).toEqual(
      [ROWS.source, ROWS.target, ROWS.lock].map(String),
    );
    const files = markup().querySelector<HTMLElement>(".vk-showcase-files");
    expect(files?.style.getPropertyValue("--showcase-rows-max")).toBe(
      String(Math.max(ROWS.source, ROWS.target, ROWS.lock)),
    );
  });

  it("offers exactly the four scenarios in a labelled group", () => {
    const group = markup().querySelector("fieldset");
    expect(group?.querySelector("legend")?.textContent).toBe(
      "landing.showcase.tryIt.scenariosLabel",
    );
    expect(
      [...(group?.querySelectorAll("button") ?? [])].map((button) => button.textContent),
    ).toEqual(SHOWCASE_SCENARIOS.map((id) => `landing.showcase.tryIt.scenarios.${id}`));
  });
});

describe("TryIt: layout hooks", () => {
  it("names each pane so the stylesheet can give the lock file its own row", () => {
    const panes = [...markup().querySelectorAll<HTMLElement>(".vk-showcase-file")];
    expect(panes.map((pane) => pane.dataset.pane)).toEqual(["source", "target", "lock"]);
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).toContain('.vk-showcase-file[data-pane="lock"] {\n    grid-column: 1 / -1;');
  });
});

describe("TryIt: scenarios", () => {
  let mounted: { container: HTMLDivElement; root: Root } | undefined;

  function render(): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<TryIt seed={SEED} rows={ROWS} />);
    });
    mounted = { container, root };
    return container;
  }

  async function settle(): Promise<void> {
    for (let tick = 0; tick < 500; tick += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      if (!document.querySelector('[role="status"][aria-busy="true"]')) return;
    }
    throw new Error("the scenario load never settled");
  }

  async function click(target: Element | null | undefined): Promise<void> {
    await act(async () => {
      target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
  }

  function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll("button")].find((node) => node.textContent === label);
  }

  beforeEach(() => {
    trackUmamiEvent.mockReset();
  });

  afterEach(() => {
    if (mounted) {
      const { container, root } = mounted;
      act(() => root.unmount());
      container.remove();
      mounted = undefined;
    }
  });

  it("announces what verbatra would translate for a scenario, then resets to the seed", async () => {
    const container = render();
    const status = container.querySelector('[role="status"]');
    await click(button(container, "landing.showcase.tryIt.scenarios.edit"));
    expect(status?.querySelector(".vk-showcase-result-title")?.textContent).toBe(
      'landing.showcase.tryIt.result.headline{"count":1}',
    );
    expect(status?.textContent).toContain('staleKey{"key":"cart.checkout"}');
    expect(
      button(container, "landing.showcase.tryIt.scenarios.edit")?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(trackUmamiEvent).toHaveBeenCalledWith("run-scenario", {
      scenario: "edit",
      location: "showcase",
    });
    expect(container.querySelector('[data-mark="edited"]')?.textContent).toContain(
      "Go to checkout",
    );

    await click(button(container, "landing.showcase.tryIt.reset"));
    expect(trackUmamiEvent).toHaveBeenLastCalledWith("reset-showcase", { location: "showcase" });
    expect(status?.querySelector(".vk-showcase-result-title")?.textContent).toBe(
      "landing.showcase.tryIt.result.seed",
    );
    expect(container.querySelectorAll("[data-mark]")).toHaveLength(0);
  });

  it("switches the one open file on a phone without touching the scenario", async () => {
    const container = render();
    const open = () =>
      [...container.querySelectorAll<HTMLElement>('.vk-showcase-file[data-open="true"]')].map(
        (pane) => pane.dataset.pane,
      );
    expect(open()).toEqual(["source"]);
    await click(button(container, SHOWCASE_LOCK_FILE));
    expect(open()).toEqual(["lock"]);
    expect(trackUmamiEvent).not.toHaveBeenCalled();
    expect(button(container, SHOWCASE_LOCK_FILE)?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".vk-showcase-file-switch legend")?.textContent).toBe(
      "landing.showcase.tryIt.filesLabel",
    );
  });

  it("shows the refusal for a broken placeholder in the danger tone", async () => {
    const container = render();
    await click(button(container, "landing.showcase.tryIt.scenarios.break"));
    const refused = container.querySelector("dd[data-refused]");
    expect(refused?.textContent).toContain('"details":"-{{amount}} +{{betrag}}"');
    const whole = [...(refused?.querySelectorAll(".whitespace-nowrap") ?? [])].map(
      (token) => token.textContent,
    );
    expect(whole.some((token) => token?.includes("-{{amount}}"))).toBe(true);
    expect(whole.some((token) => token?.includes("+{{betrag}}"))).toBe(true);
    expect(container.querySelector('[data-mark="refused"]')?.textContent).toContain(
      "Fällig: {{betrag}}",
    );
    expect(trackUmamiEvent).toHaveBeenCalledWith("run-scenario", {
      scenario: "break",
      location: "showcase",
    });
  });

  it("names the orphaned key and changes no lock hash when a key is removed", async () => {
    const container = render();
    await click(button(container, "landing.showcase.tryIt.scenarios.remove"));
    const text = container.querySelector('[role="status"]')?.textContent ?? "";
    expect(text).toContain('orphanedKey{"key":"account.orders"}');
    expect(text).toContain("landing.showcase.tryIt.result.lockNone");
  });
});
