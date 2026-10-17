// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

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
        }}
      />,
    );

    expect(html).toContain('<span class="whitespace-nowrap">--save-dev</span> <a');
    expect(html).toContain(">@verbatra/cli</a>");
  });

  it("never breaks a scoped package name after its slash, but still offers a break inside a path", () => {
    const html = renderToStaticMarkup(
      <HighlightedCommand command="npx -y -p @verbatra/cli -p @verbatra/studio verbatra studio" />,
    );
    expect(html).toContain('<span class="whitespace-nowrap">@verbatra/cli</span>');
    expect(html).toContain('<span class="whitespace-nowrap">@verbatra/studio</span>');
    expect(html).not.toContain("<wbr/>");
    expect(renderToStaticMarkup(<HighlightedCommand command="cat docs/site/en.json" />)).toContain(
      "<wbr/>",
    );
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

  it("copies the command once per click", async () => {
    const button = render();
    await click(button);
    expect(writeText.mock.calls).toEqual([[COMMAND]]);
  });

  it("reports a failed copy when the clipboard refuses it", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const button = render();
    await click(button);
    expect(button.dataset.status).toBe("failed");
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
