// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { island, preloadOnServer, rendersEagerly } from "./island";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Greeting({ name }: { name: string }) {
  return <p>{`Hello ${name}`}</p>;
}

describe("island", () => {
  it("does not fetch its module until it renders or is preloaded", () => {
    const load = vi.fn(async () => Greeting);
    island(load);
    expect(load).not.toHaveBeenCalled();
  });

  it("server-renders a preloaded island inline, with no Suspense boundary for the stream to outline", async () => {
    const Lazy = island(async () => Greeting);
    await Lazy.preload();
    const html = renderToString(<Lazy name="verbatra" />);
    expect(html).toBe("<p>Hello verbatra</p>");
  });

  it("keeps the server markup in place while it hydrates, then takes it over without a client render", async () => {
    let resolve: (component: typeof Greeting) => void = () => undefined;
    const Lazy = island(() => new Promise<typeof Greeting>((done) => (resolve = done)));
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Greeting name="verbatra" />);
    const server = container.firstElementChild;
    await act(async () => {
      hydrateRoot(container, <Lazy name="verbatra" />);
    });
    expect(container.firstElementChild).toBe(server);
    await act(async () => resolve(Greeting));
    expect(container.firstElementChild).toBe(server);
    expect(container.textContent).toBe("Hello verbatra");
  });

  it("loads once however often it renders", async () => {
    const load = vi.fn(async () => Greeting);
    const Lazy = island(load);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <>
          <Lazy name="a" />
          <Lazy name="b" />
        </>,
      );
    });
    expect(container.textContent).toBe("Hello aHello b");
    expect(load).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});

describe("preloadOnServer", () => {
  it("preloads every island where pages render ahead of the browser", async () => {
    const load = vi.fn(async () => Greeting);
    expect(rendersEagerly()).toBe(true);
    await preloadOnServer([island(load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
