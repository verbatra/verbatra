// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { CodeFrame } = await import("./code-frame");

beforeAll(preloadRegisteredIslands);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: Promise<React.ReactNode>): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const resolved = await node;
  act(() => createRoot(container).render(resolved));
  return container;
}

describe("CodeFrame", () => {
  it("captions a file and puts its copy button in the caption row", async () => {
    const container = await mount(
      CodeFrame({
        code: "name: i18n\n",
        lang: "yaml",
        filename: ".github/workflows/i18n.yml",
        copy: { label: "Copy code" },
      }),
    );
    const caption = container.querySelector("figcaption");
    expect(caption?.textContent).toBe(".github/workflows/i18n.yml");
    expect(caption?.parentElement?.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Copy code",
    );
  });

  it("renders no caption and no button when neither is given", async () => {
    const container = await mount(CodeFrame({ code: "{}", lang: "json" }));
    expect(container.querySelector("figcaption")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("pre.shiki")).not.toBeNull();
  });

  it("copies the raw code, not the highlighted markup", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const code = "npx @verbatra/cli check\n";
    const container = await mount(CodeFrame({ code, lang: "bash", copy: { label: "Copy code" } }));
    const button = container.querySelector("button");
    await act(async () => button?.click());
    expect(writeText).toHaveBeenCalledWith(code);
    expect(button?.textContent).toBe(en.landing.install.copied);
  });

  it("fades the end edge of a long line like the terminal does, in a neutral shade, never a violet bar", () => {
    const rules = docsStylesheetRules();
    const frame = rulesFor(rules, ".vk-code-frame-body pre.shiki");
    const terminal = rulesFor(rules, ".vk-terminal-scroll");
    const base = frame.find((rule) => rule.media === "")?.declarations;
    expect(base?.["overflow-x"]).toBe("auto");
    expect(base?.background).toContain("var(--scroll-shade)");
    expect(base?.background).not.toContain("--v-glow");
    expect(frame.map((rule) => rule.declarations)).toEqual(
      terminal.map((rule) => rule.declarations),
    );
    const timeline = frame.find((rule) => rule.declarations["animation-timeline"]);
    expect(timeline?.declarations["mask-image"]).toContain("var(--vk-edge-fade)");
  });

  it("draws every scroll fade from one mask rule and drops the mask while the ring shows, so no focus ring is faded", () => {
    const rules = docsStylesheetRules();
    const faded = [
      ".vk-terminal-scroll",
      ".vk-code-frame-body pre.shiki",
      ".vk-scroll-fade",
      ".vk-edge-fade",
      '.vk-docs-tabs > [role="tablist"]',
    ];
    const masks = rules.filter((rule) =>
      rule.declarations["mask-image"]?.includes("--vk-edge-fade"),
    );
    const shared = masks.find((rule) =>
      faded.every((selector) => rulesFor([rule], selector).length),
    );
    expect(shared?.media).toBe("@supports (animation-timeline: scroll())");
    for (const selector of faded) {
      expect(masks.filter((rule) => rulesFor([rule], selector).length)).toHaveLength(1);
    }
    const focused = [
      ".vk-terminal-scroll:focus-visible",
      ".vk-code-frame-body pre.shiki:focus-visible",
      ".vk-scroll-fade:focus-visible",
      ".vk-edge-fade:has(:focus-visible)",
      '.vk-docs-tabs > [role="tablist"]:has(:focus-visible)',
    ];
    for (const selector of focused) {
      const rule = rulesFor(rules, selector).at(-1);
      expect(rule?.declarations["mask-image"]).toBe("none");
      expect(rules.indexOf(rule as (typeof rules)[number])).toBeGreaterThan(
        Math.max(...masks.map((mask) => rules.indexOf(mask))),
      );
    }
  });
});
