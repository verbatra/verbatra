// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useIntentPrefetch } from "./use-intent-prefetch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({
  prefetch,
  onFocus,
}: {
  prefetch: boolean | null | undefined;
  onFocus?: () => void;
}) {
  const { prefetch: current, ...handlers } = useIntentPrefetch(prefetch, { onFocus });
  return (
    <a href="/docs" {...handlers}>
      {String(current)}
    </a>
  );
}

async function mount(children: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(children);
  });
  return container;
}

describe("useIntentPrefetch", () => {
  it("renders no prefetch on the server", () => {
    expect(renderToString(<Probe prefetch={undefined} />)).toContain(">false<");
  });

  it("holds every link prefetch after hydration, with no paint or timer releasing it", async () => {
    vi.useFakeTimers();
    const container = await mount(
      <>
        <Probe prefetch={undefined} />
        <Probe prefetch={true} />
      </>,
    );
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toBe("falsefalse");
    vi.useRealTimers();
  });

  it.each([
    [
      "hover",
      (link: HTMLAnchorElement) =>
        link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    ],
    ["focus", (link: HTMLAnchorElement) => link.focus()],
    [
      "touch",
      (link: HTMLAnchorElement) => link.dispatchEvent(new Event("touchstart", { bubbles: true })),
    ],
  ])("hands the link its own choice once it is reached by %s", async (_intent, reach) => {
    const container = await mount(
      <>
        <Probe prefetch={undefined} />
        <Probe prefetch={true} />
        <Probe prefetch={false} />
      </>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    await act(async () => {
      for (const link of links) reach(link);
    });
    expect(container.textContent).toBe("undefinedtruefalse");
  });

  it("releases only the link that was reached", async () => {
    const container = await mount(
      <>
        <Probe prefetch={undefined} />
        <Probe prefetch={undefined} />
      </>,
    );
    await act(async () => {
      container.querySelector("a")?.focus();
    });
    expect(container.textContent).toBe("undefinedfalse");
  });

  it("still calls the handler the link was given", async () => {
    const onFocus = vi.fn();
    const container = await mount(<Probe prefetch={undefined} onFocus={onFocus} />);
    await act(async () => {
      container.querySelector("a")?.focus();
    });
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
