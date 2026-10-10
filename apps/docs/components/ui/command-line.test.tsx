// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const trackUmamiEvent = vi.fn();
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { default: CommandLine, HighlightedCommand } = await import("./command-line");

describe("HighlightedCommand", () => {
  it("keeps every word of the command whole, so it wraps only at a space", () => {
    const html = renderToStaticMarkup(
      <HighlightedCommand
        command="npm install --save-dev @verbatra/cli"
        link={{
          token: "@verbatra/cli",
          href: "https://www.npmjs.com/package/@verbatra/cli",
          target: "npm-cli",
          location: "hero",
        }}
      />,
    );

    expect(html).toContain('<span class="whitespace-nowrap">--save-dev</span> <a');
    expect(html).toContain(">@verbatra/cli</a>");
  });

  it("counts a click on the package link as an outbound link with its target and location", () => {
    const html = renderToStaticMarkup(
      <HighlightedCommand
        command="npm install @verbatra/cli"
        link={{
          token: "@verbatra/cli",
          href: "https://npm.example/cli",
          target: "npm-cli",
          location: "hero",
        }}
      />,
    );
    const link = new DOMParser().parseFromString(html, "text/html").querySelector("a");

    expect(link?.getAttribute("data-umami-event")).toBe("outbound-link");
    expect(link?.getAttribute("data-umami-event-target")).toBe("npm-cli");
    expect(link?.getAttribute("data-umami-event-location")).toBe("hero");
  });

  it("keeps the words whole without a link too", () => {
    expect(renderToStaticMarkup(<HighlightedCommand command="bun add --dev x" />)).toBe(
      '<span class="whitespace-nowrap">bun</span> <span class="whitespace-nowrap">add</span> <span class="whitespace-nowrap">--dev</span> <span class="whitespace-nowrap">x</span>',
    );
  });
});

describe("HighlightedCommand break points", () => {
  it("offers a break only after a slash or a dot inside a word, never inside a flag", () => {
    expect(
      renderToStaticMarkup(
        <HighlightedCommand command="npx skills@latest add verbatra/skills --skill verbatra-cli" />,
      ),
    ).toBe(
      '<span class="whitespace-nowrap">npx</span> <span class="whitespace-nowrap">skills@latest</span> <span class="whitespace-nowrap">add</span> <span class="whitespace-nowrap">verbatra/</span><wbr/><span class="whitespace-nowrap">skills</span> <span class="whitespace-nowrap">--skill</span> <span class="whitespace-nowrap">verbatra-cli</span>',
    );
    expect(
      renderToStaticMarkup(<HighlightedCommand command="import translations.xlsx" />),
    ).toContain(
      '<span class="whitespace-nowrap">translations.</span><wbr/><span class="whitespace-nowrap">xlsx</span>',
    );
  });
});

describe("CommandLine", () => {
  it("copies through the shared CopyButton, with its focus ring and its live region", () => {
    const html = renderToStaticMarkup(<CommandLine command="npx @verbatra/cli init" />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const button = doc.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("copyAria");
    expect(button?.getAttribute("data-status")).toBe("idle");
    expect(button?.className).toContain("focus-visible:outline-(--focus-ring)");
    expect(doc.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe("CommandLine copy", () => {
  const COMMAND = "npx @verbatra/cli init";
  const writeText = vi.fn<(text: string) => Promise<void>>();
  let mounted: { container: HTMLDivElement; root: Root } | undefined;

  function render(): HTMLButtonElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CommandLine command={COMMAND} />);
    });
    mounted = { container, root };
    const button = container.querySelector("button");
    if (!button) throw new Error("no copy button rendered");
    return button;
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
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
    vi.useRealTimers();
  });

  it("counts a successful copy once as copy-command with the command", async () => {
    const button = render();
    await click(button);
    expect(writeText).toHaveBeenCalledWith(COMMAND);
    expect(trackUmamiEvent).toHaveBeenCalledTimes(1);
    expect(trackUmamiEvent).toHaveBeenCalledWith("copy-command", {
      command: COMMAND,
      location: "docs-page",
    });
  });

  it("counts nothing when the clipboard refuses the copy", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const button = render();
    await click(button);
    expect(button.dataset.status).toBe("failed");
    expect(trackUmamiEvent).not.toHaveBeenCalled();
  });

  it("drops its aria-label while copied or failed, so the visible status is the accessible name", async () => {
    const button = render();
    expect(button.getAttribute("aria-label")).toBe("copyAria");
    await click(button);
    expect(button.dataset.status).toBe("copied");
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.textContent).toBe("copied");

    act(() => {
      vi.runAllTimers();
    });
    expect(button.getAttribute("aria-label")).toBe("copyAria");

    writeText.mockRejectedValue(new Error("denied"));
    await click(button);
    expect(button.dataset.status).toBe("failed");
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.textContent).toBe("copyFailed");
  });
});
