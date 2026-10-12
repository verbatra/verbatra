// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

const trackUmamiEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

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
        copy: { label: "Copy code", location: "test" },
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
    const container = await mount(
      CodeFrame({ code, lang: "bash", copy: { label: "Copy code", location: "steps" } }),
    );
    const button = container.querySelector("button");
    await act(async () => button?.click());
    expect(writeText).toHaveBeenCalledWith(code);
    expect(trackUmamiEvent).toHaveBeenCalledWith("copy-command", {
      command: code,
      location: "steps",
    });
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
});
