// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOWCASE_CLI_COMMAND, showcaseRunLines } from "@/lib/showcase-cli";
import { runShowcaseScenario, showcaseRows, showcaseSeed } from "@/lib/showcase-scenarios";
import {
  SHOWCASE_BREAK_REPLIES,
  SHOWCASE_BREAKS,
  SHOWCASE_LOCK_FILE,
  SHOWCASE_PLACEHOLDER,
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

function rulesFor(selector: string): string {
  const sheet = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
  return sheet
    .split("}")
    .filter((rule) => rule.includes(selector))
    .join("}");
}
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
    expect(
      doc.querySelectorAll('textarea, input:not([type="radio"]), [contenteditable]'),
    ).toHaveLength(0);
  });

  it("reserves each file's height for its longest scenario, and the tallest file's on a phone", () => {
    const codes = [...markup().querySelectorAll<HTMLElement>(".vk-showcase-code")];
    expect(codes.map((code) => code.style.getPropertyValue("--showcase-rows"))).toEqual(
      [ROWS.source, ROWS.target, ROWS.lock].map(String),
    );
    const board = markup().querySelector<HTMLElement>(".vk-showcase-try");
    expect(board?.style.getPropertyValue("--showcase-rows-max")).toBe(
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

describe("TryIt: output pane", () => {
  function outputLines(root: ParentNode): ReadonlyArray<string | null> {
    return [...root.querySelectorAll(".vk-showcase-output-line")].map((line) => line.textContent);
  }

  it("server-renders what verbatra translate prints for the seed, headed by its own first line, without the print motion", () => {
    const doc = markup();
    const output = doc.querySelector(".vk-showcase-output");
    expect(output?.getAttribute("aria-label")).toBe("landing.showcase.tryIt.result.outputLabel");
    expect(output?.getAttribute("lang")).toBe("en");
    expect(output?.querySelector("figcaption")).toBeNull();
    expect(outputLines(doc)).toEqual(showcaseRunLines(SEED));
    expect(outputLines(doc)[0]).toBe(SHOWCASE_CLI_COMMAND);
    expect(outputLines(doc)).toContain("  de: 0 translated, 4 unchanged");
    const code = doc.querySelector<HTMLElement>(".vk-showcase-output-code");
    expect(code?.hasAttribute("data-printing")).toBe(false);
    expect(code?.style.getPropertyValue("--showcase-output-rows")).toBe(String(ROWS.output));
  });

  it("puts the savings line beside the one status sentence, outside the live region", () => {
    const doc = markup();
    const status = doc.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-atomic")).toBe("true");
    expect(status?.querySelectorAll("p")).toHaveLength(1);
    expect(status?.querySelectorAll("dl, dt, dd")).toHaveLength(0);
    expect(doc.querySelector(".vk-showcase-savings")?.textContent).toBe(
      'landing.showcase.tryIt.result.savings{"sent":0,"total":4}',
    );
  });

  it("keeps the output height fixed when a long line brings up a scrollbar", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    const rule = /\.vk-showcase-output-code \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("box-sizing: content-box;");
    expect(rule).toContain(
      "height: calc(var(--showcase-output-rows) * var(--showcase-line) + var(--showcase-scroll-reserve));",
    );
    expect(rule).not.toContain("min-height");
    expect(css).toMatch(/--showcase-scroll-reserve: 0\.75rem;/);
  });

  it("keeps every printed line under the 600ms print budget", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    const stagger = Number(/--print-stagger: (\d+)ms;/.exec(css)?.[1]);
    const fade = Number(/--duration-fast: (\d+)ms;/.exec(css)?.[1]);
    expect((ROWS.output - 1) * stagger + fade).toBeLessThanOrEqual(600);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s+\.vk-showcase-output-code\[data-printing\]/,
    );
  });
});

describe("TryIt: placeholder chips", () => {
  it("draws the source and target placeholder as the same locked chip", () => {
    const doc = markup();
    const chips = (pane: string) =>
      [...doc.querySelectorAll(`[data-pane="${pane}"] .vk-placeholder`)].map((chip) => [
        chip.textContent,
        chip.hasAttribute("data-broken"),
      ]);
    expect(chips("source")).toEqual([["{{amount}}", false]]);
    expect(chips("target")).toEqual([["{{amount}}", false]]);
    expect(chips("lock")).toEqual([]);
  });
});

describe("TryIt: two-by-two playground", () => {
  const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

  it("lays the files and the output out two by two under the scenario bar from 40rem", () => {
    const panes = [...markup().querySelectorAll<HTMLElement>(".vk-showcase-file")];
    expect(panes.map((pane) => pane.dataset.pane)).toEqual(["source", "target", "lock"]);
    expect(css).toContain(
      '"bar bar"\n      "breaks breaks"\n      "source target"\n      "lock outcome";',
    );
    for (const pane of ["source", "target", "lock"]) {
      expect(css).toContain(`.vk-showcase-file[data-pane="${pane}"] {\n    grid-area: ${pane};`);
    }
  });

  it("keeps Reset right after the scenarios at every width, so focus order matches the layout", () => {
    const doc = markup();
    const bar = doc.querySelector(".vk-showcase-bar");
    expect([...(bar?.children ?? [])].map((child) => child.className)).toEqual([
      "vk-showcase-scenarios",
      "vk-showcase-actions",
    ]);
    expect(bar?.querySelector(".vk-showcase-actions .vk-showcase-reset")).not.toBeNull();
    expect(css).not.toContain("display: contents");
    expect(css).toContain('"bar"\n    "breaks"\n    "switch"\n    "file"\n    "outcome";');
    expect(css).toMatch(
      /\.vk-showcase-actions:not\(:has\(> :not\(\[hidden\]\)\)\) \{\s+display: none;/,
    );
  });

  it("keeps the output outside the file switch, so it shows under whichever file is open", () => {
    const doc = markup();
    const output = doc.querySelector(".vk-showcase-outcome");
    expect(output?.closest(".vk-showcase-file")).toBeNull();
    expect(output?.hasAttribute("data-open")).toBe(false);
    expect(output?.querySelector(".vk-showcase-output")).not.toBeNull();
  });

  it("reserves every pane's rows plus room for a sideways scrollbar", () => {
    const flat = css.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
    expect(flat).toContain(
      "min-height: calc(var(--showcase-rows-max) * var(--showcase-line) + var(--showcase-scroll-reserve));",
    );
    expect(flat).toContain(
      "min-height: calc(var(--showcase-rows) * var(--showcase-line) + var(--showcase-scroll-reserve));",
    );
  });

  it("leaves the reveal to the panel, never to its interior", () => {
    expect(markup().querySelector("[data-reveal]")).toBeNull();
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
      'landing.showcase.tryIt.result.summary{"written":1,"withheld":"no","orphaned":"no"}',
    );
    expect(container.querySelector(".vk-showcase-savings")?.textContent).toBe(
      'landing.showcase.tryIt.result.savings{"sent":1,"total":4}',
    );
    expect(
      [...container.querySelectorAll(".vk-showcase-output-line")].map((line) => line.textContent),
    ).toEqual(showcaseRunLines(runShowcaseScenario("edit")));
    expect(container.querySelector(".vk-showcase-output-code")?.hasAttribute("data-printing")).toBe(
      true,
    );
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
    expect(document.activeElement).toBe(
      button(container, `landing.showcase.tryIt.scenarios.${SHOWCASE_SCENARIOS[0]}`),
    );
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
    expect(container.querySelector(".vk-showcase-result-title")?.textContent).toBe(
      'landing.showcase.tryIt.result.summary{"written":0,"withheld":"yes","orphaned":"no"}',
    );
    const refusal = [...container.querySelectorAll(".vk-showcase-output-line")].find((line) =>
      line.textContent?.includes("cart.total: placeholder"),
    );
    expect(refusal?.textContent).toBe("      cart.total: placeholder (-{{amount}}, +{{betrag}})");
    expect(
      [...(refusal?.querySelectorAll(".vk-placeholder") ?? [])].map((chip) => [
        chip.textContent,
        chip.hasAttribute("data-broken"),
      ]),
    ).toEqual([
      ["{{amount}}", false],
      ["{{betrag}}", true],
    ]);
    expect(container.querySelector('[data-mark="refused"]')?.textContent).toContain(
      "Fällig: {{betrag}}",
    );
    const refusedChips = [
      ...(container.querySelector('[data-mark="refused"]')?.querySelectorAll(".vk-placeholder") ??
        []),
    ];
    expect(
      refusedChips.map((chip) => [chip.textContent, chip.hasAttribute("data-broken")]),
    ).toEqual([["{{betrag}}", true]]);
    expect(
      [...container.querySelectorAll('[data-pane="source"] .vk-placeholder')].map((chip) =>
        chip.hasAttribute("data-broken"),
      ),
    ).toEqual([false]);
    expect(trackUmamiEvent).toHaveBeenCalledWith("run-scenario", {
      scenario: "break",
      location: "showcase",
      break: "rename",
    });
  });

  it("offers three ways to break the placeholder as one radio group", () => {
    const container = render();
    const group = container.querySelector("fieldset.vk-showcase-breaks");
    expect(group?.querySelector("legend")?.textContent).toBe("landing.showcase.tryIt.breaksLabel");
    const radios = [...(group?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])];
    expect(radios.map((radio) => radio.value)).toEqual([...SHOWCASE_BREAKS]);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios.filter((radio) => radio.checked)).toEqual([]);
    expect(
      [...(group?.querySelectorAll(".vk-showcase-break") ?? [])].map((label) => label.textContent),
    ).toEqual(
      SHOWCASE_BREAKS.map(
        (id) =>
          `landing.showcase.tryIt.breaks.${id}${JSON.stringify({
            token: SHOWCASE_BREAK_REPLIES[id].token,
            placeholder: SHOWCASE_PLACEHOLDER,
          })}`,
      ),
    );
  });

  it("checks a reply only while the break scenario is on screen", async () => {
    const container = render();
    const checked = () =>
      [...container.querySelectorAll<HTMLInputElement>(".vk-showcase-break-input")]
        .filter((radio) => radio.checked)
        .map((radio) => radio.value);
    await click(button(container, "landing.showcase.tryIt.scenarios.edit"));
    expect(checked()).toEqual([]);
    await click(button(container, "landing.showcase.tryIt.scenarios.break"));
    expect(checked()).toEqual(["rename"]);
  });

  it("runs the default rename reply from its radio when no break is on screen", async () => {
    const container = render();
    await click(container.querySelector<HTMLInputElement>('input[value="rename"]'));
    expect(trackUmamiEvent).toHaveBeenCalledWith("run-scenario", {
      scenario: "break",
      location: "showcase",
      break: "rename",
    });
    expect(container.querySelector<HTMLInputElement>('input[value="rename"]')?.checked).toBe(true);
    expect(
      [...container.querySelectorAll(".vk-showcase-output-line")].map((line) => line.textContent),
    ).toEqual(showcaseRunLines(runShowcaseScenario("break", "rename")));
  });

  it("replays the last chosen reply when the break scenario comes back", async () => {
    const container = render();
    await click(container.querySelector<HTMLInputElement>('input[value="drop"]'));
    await click(button(container, "landing.showcase.tryIt.scenarios.edit"));
    trackUmamiEvent.mockReset();
    await click(button(container, "landing.showcase.tryIt.scenarios.break"));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["run-scenario", { scenario: "break", location: "showcase", break: "drop" }],
    ]);
    expect(container.querySelector<HTMLInputElement>('input[value="drop"]')?.checked).toBe(true);
    expect(
      [...container.querySelectorAll(".vk-showcase-output-line")].map((line) => line.textContent),
    ).toEqual(showcaseRunLines(runShowcaseScenario("break", "drop")));
  });

  it.each([
    ["drop", "-{{amount}}"],
    ["add", "+{{tax}}"],
  ] as const)(
    "runs the break scenario when the reply %ss the placeholder",
    async (reply, detail) => {
      const container = render();
      const radio = container.querySelector<HTMLInputElement>(`input[value="${reply}"]`);
      await click(radio);
      expect(radio?.checked).toBe(true);
      expect(trackUmamiEvent).toHaveBeenCalledWith("run-scenario", {
        scenario: "break",
        location: "showcase",
        break: reply,
      });
      expect(
        [...container.querySelectorAll(".vk-showcase-output-line")].map((line) => line.textContent),
      ).toEqual(showcaseRunLines(runShowcaseScenario("break", reply)));
      expect(
        [...container.querySelectorAll(".vk-showcase-output-line")].some((line) =>
          line.textContent?.includes(detail),
        ),
      ).toBe(true);
      expect(
        button(container, "landing.showcase.tryIt.scenarios.break")?.getAttribute("aria-pressed"),
      ).toBe("true");

      await click(button(container, "landing.showcase.tryIt.reset"));
      expect(container.querySelector<HTMLInputElement>(`input[value="${reply}"]`)?.checked).toBe(
        false,
      );
      await click(button(container, "landing.showcase.tryIt.scenarios.break"));
      expect(container.querySelector<HTMLInputElement>('input[value="rename"]')?.checked).toBe(
        true,
      );
    },
  );

  it("shows the lock hash before and after an edit on the lock pane", async () => {
    const container = render();
    await click(button(container, "landing.showcase.tryIt.scenarios.edit"));
    const marked = [
      ...container.querySelectorAll<HTMLElement>('[data-pane="lock"] [data-mark]'),
    ].map((line) => [line.dataset.mark, line.querySelector("code")?.textContent?.trim()]);
    const edited = runShowcaseScenario("edit").lockHashes["cart.checkout"];
    expect(marked).toEqual([
      ["replaced", `"cart.checkout": "${SEED.lockHashes["cart.checkout"]}"`],
      ["changes", `"cart.checkout": "${edited}",`],
    ]);
    expect(rulesFor(".vk-showcase-line-text")).toContain('[data-mark="replaced"]');
  });

  it("reports the orphaned key and changes no lock hash when a key is removed", async () => {
    const container = render();
    await click(button(container, "landing.showcase.tryIt.scenarios.remove"));
    const text = container.querySelector('[role="status"]')?.textContent ?? "";
    expect(text).toBe(
      'landing.showcase.tryIt.result.summary{"written":0,"withheld":"no","orphaned":"yes"}',
    );
    expect(
      [...container.querySelectorAll(".vk-showcase-output-line")].map((line) => line.textContent),
    ).toContain("  de: 0 translated, 3 unchanged, 1 orphaned");
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-pane="lock"] [data-mark]')].map(
        (line) => line.dataset.mark,
      ),
    ).toEqual(["kept"]);
  });
});
