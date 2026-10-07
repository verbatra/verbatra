// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const trackUmamiEvent = vi.fn();
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

const { AiSetupPrompt, PromptCopyButton, PROMPT_COPIED_RESET_MS } = await import(
  "./ai-setup-prompt"
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function prompt(): Element | null {
  const markup = renderToStaticMarkup(<AiSetupPrompt />);
  return new DOMParser().parseFromString(markup, "text/html").querySelector("figure");
}

describe("AiSetupPrompt", () => {
  it("is a compact row under the box's command rows", () => {
    const figure = prompt();
    const text = figure?.querySelector("p");
    expect(figure?.classList.contains("border-t")).toBe(true);
    expect(text?.classList.contains("text-xs")).toBe(true);
    expect(text?.className).toContain("var(--text-muted)");
    expect(text?.classList.contains("text-pretty")).toBe(true);
  });

  it("gives the caption a 24px row beside the Copy button and a tighter leading when it wraps", () => {
    const caption = prompt()?.querySelector("figcaption");
    expect(caption?.classList.contains("min-h-6")).toBe(true);
    expect(caption?.classList.contains("leading-snug")).toBe(true);
    expect(caption?.classList.contains("flex")).toBe(true);
    expect(caption?.classList.contains("items-center")).toBe(true);
  });
});

describe("PromptCopyButton", () => {
  let mounted: { container: HTMLDivElement; root: Root } | undefined;
  const writeText = vi.fn<(text: string) => Promise<void>>();

  function render(): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<PromptCopyButton />);
    });
    mounted = { container, root };
    return container;
  }

  function trigger(container: HTMLDivElement): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>("button.vk-prompt-trigger");
    if (!button) throw new Error("no prompt trigger rendered");
    return button;
  }

  async function click(container: HTMLDivElement): Promise<void> {
    await act(async () => {
      trigger(container).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  function rawLiveText(container: HTMLDivElement): string {
    return container.querySelector('[aria-live="polite"]')?.textContent ?? "";
  }

  function liveText(container: HTMLDivElement): string {
    return rawLiveText(container).trim();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset().mockResolvedValue(undefined);
    trackUmamiEvent.mockReset();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    if (mounted) {
      const { container, root } = mounted;
      act(() => root.unmount());
      container.remove();
      mounted = undefined;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("previews exactly the text it copies, in a tooltip that describes the button", async () => {
    const container = render();
    const pop = container.querySelector(".vk-prompt-pop");
    expect(pop?.getAttribute("role")).toBe("tooltip");
    expect(trigger(container).getAttribute("aria-describedby")).toBe(pop?.id);
    expect(pop?.querySelector("pre")?.textContent).toBe(AI_SETUP_PROMPT);

    await click(container);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(pop?.querySelector("pre")?.textContent);
  });

  it("breaks the URL in the preview only after a path slash, never inside the host or a flag", () => {
    const pre = render().querySelector(".vk-prompt-text");
    expect(pre?.textContent).toBe(AI_SETUP_PROMPT);
    const segments = [...(pre?.querySelectorAll("span.whitespace-nowrap") ?? [])].map(
      (span) => span.textContent,
    );
    expect(segments).toEqual([
      "-y",
      "--skill",
      "verbatra-cli",
      "-y",
      "https://verbatra.kreitz-webdev.de/",
      "docs/",
      "start-with-ai.md",
      "--help).",
    ]);
    expect(pre?.querySelectorAll("wbr")).toHaveLength(2);
    const rule = /\.vk-prompt-text \{([^}]*)\}/.exec(
      readFileSync(join(process.cwd(), "app/global.css"), "utf8"),
    )?.[1];
    expect(rule).not.toMatch(/overflow-wrap|word-break/);
    expect(rule).toContain("text-indent: 1.15em hanging each-line;");
  });

  it("is a large outline call to action labelled to start with a prompt", () => {
    const button = trigger(render());
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("border");
    expect(button.textContent).toBe("promptCta");
  });

  it("swaps the icon to a check and announces the copy politely, then resets", async () => {
    const container = render();
    expect(liveText(container)).toBe("");
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("copy");

    await click(container);
    expect(liveText(container)).toBe("promptCopied");
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("check");
    expect(trigger(container).dataset.copied).toBe("true");

    act(() => {
      vi.advanceTimersByTime(PROMPT_COPIED_RESET_MS - 1);
    });
    expect(liveText(container)).toBe("promptCopied");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(liveText(container)).toBe("");
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("copy");
  });

  it("announces a second copy again through a fresh text node and restarts the reset window", async () => {
    const container = render();
    await click(container);
    const first = container.querySelector('[aria-live="polite"] > span');
    act(() => {
      vi.advanceTimersByTime(PROMPT_COPIED_RESET_MS / 2);
    });
    await click(container);
    const second = container.querySelector('[aria-live="polite"] > span');
    expect(second).not.toBe(first);
    expect(rawLiveText(container)).toBe("promptCopied");

    act(() => {
      vi.advanceTimersByTime(PROMPT_COPIED_RESET_MS - 1);
    });
    expect(liveText(container)).toBe("promptCopied");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(liveText(container)).toBe("");
  });

  it("shows and announces a failed copy, keeps the preview open with the reason and counts nothing", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    await click(container);
    const root = container.querySelector<HTMLElement>(".vk-prompt");
    expect(liveText(container)).toBe("copyFailed");
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("failed");
    expect(trigger(container).dataset.copied).toBe("false");
    expect(root?.dataset.status).toBe("failed");
    expect(container.querySelector(".vk-prompt-pop .vk-prompt-failed")?.textContent).toBe(
      "promptCopyFailed",
    );
    expect(trackUmamiEvent).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(PROMPT_COPIED_RESET_MS * 10);
    });
    expect(root?.dataset.status).toBe("failed");

    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(
      '.vk-prompt:not([data-dismissed="true"])[data-status="failed"] .vk-prompt-pop { visibility: visible;',
    );
  });

  it("announces a failure once: a short live message, the full reason only in the tooltip", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    await click(container);
    const tooltip = container.querySelector(".vk-prompt-pop .vk-prompt-failed")?.textContent;
    expect(liveText(container)).toBe("copyFailed");
    expect(tooltip).toBe("promptCopyFailed");
    expect(liveText(container)).not.toBe(tooltip);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).not.toContain(
      "promptCopyFailed",
    );
  });

  function failureListeners(): {
    added: Map<string, EventListenerOrEventListenerObject>;
    removed: Array<[string, EventListenerOrEventListenerObject]>;
  } {
    const added = new Map<string, EventListenerOrEventListenerObject>();
    const removed: Array<[string, EventListenerOrEventListenerObject]> = [];
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
      if (listener) added.set(type, listener);
      add(type, listener, options);
    });
    vi.spyOn(document, "removeEventListener").mockImplementation((type, listener, options) => {
      if (listener) removed.push([type, listener]);
      remove(type, listener, options);
    });
    return { added, removed };
  }

  function expectRemoved(
    listeners: ReturnType<typeof failureListeners>,
    types: ReadonlyArray<string>,
  ): void {
    for (const type of types) {
      const listener = listeners.added.get(type);
      expect(listener).toBeDefined();
      expect(listeners.removed).toContainEqual([type, listener]);
    }
  }

  it("removes its outside-click and Escape listeners once the failure is reset", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    const listeners = failureListeners();
    await click(container);
    expect([...listeners.added.keys()].sort()).toEqual(["keydown", "pointerdown"]);
    expect(listeners.removed).toEqual([]);

    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(container.querySelector<HTMLElement>(".vk-prompt")?.dataset.status).toBe("idle");
    expectRemoved(listeners, ["pointerdown", "keydown"]);
  });

  it("removes its outside-click and Escape listeners when it unmounts while failed", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    const listeners = failureListeners();
    await click(container);
    expect(listeners.removed).toEqual([]);

    const current = mounted;
    if (!current) throw new Error("nothing mounted");
    act(() => current.root.unmount());
    current.container.remove();
    mounted = undefined;
    expectRemoved(listeners, ["pointerdown", "keydown"]);
  });

  it("keeps the failed state for a pointer inside the preview, and clears it on a pointer outside", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    await click(container);
    const root = container.querySelector<HTMLElement>(".vk-prompt");
    act(() => {
      container
        .querySelector(".vk-prompt-text")
        ?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(root?.dataset.status).toBe("failed");
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(root?.dataset.status).toBe("idle");
    expect(container.querySelector(".vk-prompt-failed")).toBeNull();
  });

  it("clears the failed state on Escape", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    await click(container);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector<HTMLElement>(".vk-prompt")?.dataset.status).toBe("idle");
    expect(liveText(container)).toBe("");
  });

  it("counts each copy once as the copy-ai-prompt event", async () => {
    const container = render();
    await click(container);
    expect(trackUmamiEvent).toHaveBeenCalledTimes(1);
    expect(trackUmamiEvent).toHaveBeenCalledWith("copy-ai-prompt");
  });

  it("opens its preview from CSS alone, on hover and on keyboard focus", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).toContain(
      '.vk-prompt:not([data-dismissed="true"]):has(.vk-prompt-trigger:focus-visible) .vk-prompt-pop',
    );
    expect(css).toContain('.vk-prompt:not([data-dismissed="true"]):hover .vk-prompt-pop');
  });

  it("hides its preview on Escape while focused, until focus leaves", () => {
    const container = render();
    const wrapper = container.querySelector(".vk-prompt");
    act(() => trigger(container).focus());
    expect(wrapper?.getAttribute("data-dismissed")).toBe("false");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(wrapper?.getAttribute("data-dismissed")).toBe("true");

    act(() => trigger(container).blur());
    expect(wrapper?.getAttribute("data-dismissed")).toBe("false");
  });

  it("hides its preview on Escape while hovered, until the pointer leaves", () => {
    const container = render();
    const wrapper = container.querySelector(".vk-prompt");
    if (!wrapper) throw new Error("no prompt wrapper rendered");
    act(() => {
      wrapper.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(wrapper.getAttribute("data-dismissed")).toBe("false");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(wrapper.getAttribute("data-dismissed")).toBe("true");

    act(() => {
      wrapper.dispatchEvent(
        new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(wrapper.getAttribute("data-dismissed")).toBe("false");
  });

  it("ignores Escape while neither hovered nor focused", () => {
    const container = render();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector(".vk-prompt")?.getAttribute("data-dismissed")).toBe("false");
  });
});
