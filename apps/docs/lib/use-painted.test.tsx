// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let paint: () => void = () => undefined;
const painted = new Promise<void>((resolve) => {
  paint = resolve;
});
vi.mock("@/lib/island", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/island")>()),
  afterFirstContentfulPaint: () => painted,
}));

const { useLinkPrefetch } = await import("./use-painted");

function Probe({ prefetch }: { prefetch: boolean | null | undefined }) {
  return <span>{String(useLinkPrefetch(prefetch))}</span>;
}

describe("useLinkPrefetch", () => {
  it("renders no prefetch on the server", () => {
    expect(renderToString(<Probe prefetch={undefined} />)).toBe("<span>false</span>");
  });

  it("holds every link prefetch until the first contentful paint, then hands the link its own choice", async () => {
    const container = document.createElement("div");
    await act(async () => {
      createRoot(container).render(
        <>
          <Probe prefetch={undefined} />
          <Probe prefetch={true} />
          <Probe prefetch={false} />
        </>,
      );
    });
    expect(container.textContent).toBe("falsefalsefalse");
    await act(async () => {
      paint();
      await painted;
    });
    expect(container.textContent).toBe("undefinedtruefalse");
  });
});
