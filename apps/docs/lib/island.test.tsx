// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Activity,
  act,
  type ComponentType,
  createContext,
  startTransition,
  use,
  useState,
} from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { island, preloadIslands, rendersEagerly } from "./island";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Greeting({ name }: { name: string }) {
  return <p>{`Hello ${name}`}</p>;
}

function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" data-island={label} onClick={() => setCount((value) => value + 1)}>
      {`${label} ${count}`}
    </button>
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function serverMarkup(...labels: string[]): string {
  return renderToString(
    labels.map((label) => (
      <Activity key={label} mode="visible">
        <span className="vk-island">
          <Counter label={label} />
        </span>
      </Activity>
    )),
  );
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`[data-island="${label}"]`);
  if (!found) throw new Error(`missing island ${label}`);
  return found;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

const roots: Root[] = [];

function track(root: Root): Root {
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.useRealTimers();
});

function errorSpies() {
  return { onUncaughtError: vi.fn(), onCaughtError: vi.fn(), onRecoverableError: vi.fn() };
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
    expect(html).toBe('<!--&--><span class="vk-island"><p>Hello verbatra</p></span><!--/&-->');
    expect(html).not.toContain("<!--$");
  });

  it("wraps an island in a box-less span, so its server markup can be kept without a client render", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).toContain(".vk-island {\n  display: contents;\n}");
  });

  it("keeps the server markup in place while it hydrates, then takes it over without a client render", async () => {
    const load = deferred<ComponentType<{ label: string }>>();
    const Lazy = island(() => load.promise);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup("a");
    const server = button(container, "a");
    await act(async () => {
      track(hydrateRoot(container, <Lazy label="a" />));
    });
    expect(button(container, "a")).toBe(server);
    await act(async () => load.resolve(Counter));
    expect(button(container, "a")).toBe(server);
    await act(async () => server.click());
    expect(server.textContent).toBe("a 1");
  });

  it("hydrates each island on its own, so a slow chunk never holds another island back", async () => {
    const slow = deferred<ComponentType<{ label: string }>>();
    const Fast = island(async () => Counter);
    const Slow = island(() => slow.promise);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup("fast", "slow");
    await act(async () => {
      track(
        hydrateRoot(
          container,
          <>
            <Fast label="fast" />
            <Slow label="slow" />
          </>,
        ),
      );
    });
    await flush();
    await act(async () => button(container, "fast").click());
    expect(button(container, "fast").textContent).toBe("fast 1");
    expect(button(container, "slow").textContent).toBe("slow 0");
    await act(async () => slow.resolve(Counter));
    await act(async () => button(container, "slow").click());
    expect(button(container, "slow").textContent).toBe("slow 1");
  });

  it("retries a rejected chunk before it gives up", async () => {
    const load = vi
      .fn<() => Promise<ComponentType<{ name: string }>>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue(Greeting);
    const Lazy = island(load, { retryDelaysMs: [0] });
    const container = document.createElement("div");
    await act(async () => {
      track(createRoot(container)).render(<Lazy name="again" />);
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("Hello again");
  });

  it("keeps the server markup of an island whose chunk never loads, without an error reaching the root", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("chunk failed")));
    const Broken = island<{ label: string }>(failing, { retryDelaysMs: [0, 0] });
    const Working = island(async () => Counter);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup("broken", "working");
    const server = button(container, "broken");
    const spies = errorSpies();
    await act(async () => {
      track(
        hydrateRoot(
          container,
          <>
            <Broken label="broken" />
            <Working label="working" />
          </>,
          spies,
        ),
      );
    });
    await flush();
    expect(failing).toHaveBeenCalledTimes(3);
    expect(button(container, "broken")).toBe(server);
    await act(async () => server.click());
    expect(server.textContent).toBe("broken 0");
    await act(async () => button(container, "working").click());
    expect(button(container, "working").textContent).toBe("working 1");
    expect(spies.onUncaughtError).not.toHaveBeenCalled();
    expect(spies.onCaughtError).not.toHaveBeenCalled();
    expect(spies.onRecoverableError).not.toHaveBeenCalled();
  });

  it("renders nothing for a failed island in a client render, and loads it again on the next mount", async () => {
    const load = vi
      .fn<() => Promise<ComponentType<{ label: string }>>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue(Counter);
    const Lazy = island(load, { retryDelaysMs: [] });
    const container = document.createElement("div");
    const spies = errorSpies();
    const root = track(createRoot(container, spies));
    await act(async () => root.render(<Lazy label="nav" />));
    await flush();
    expect(container.innerHTML).toBe("");
    await act(async () => root.render(<p>elsewhere</p>));
    await act(async () => root.render(<Lazy label="nav" />));
    await flush();
    expect(button(container, "nav").textContent).toBe("nav 0");
    expect(load).toHaveBeenCalledTimes(2);
    expect(spies.onUncaughtError).not.toHaveBeenCalled();
  });

  it("recovers on a soft navigation after its chunk failed during hydration", async () => {
    const load = vi
      .fn<() => Promise<ComponentType<{ label: string }>>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue(Counter);
    const Lazy = island(load, { retryDelaysMs: [] });
    const container = document.createElement("div");
    container.innerHTML = serverMarkup("page");
    let root: Root | undefined;
    await act(async () => {
      root = track(hydrateRoot(container, <Lazy key="landing" label="page" />));
    });
    await flush();
    expect(button(container, "page").textContent).toBe("page 0");
    await act(async () => root?.render(<p>docs</p>));
    await act(async () => root?.render(<Lazy key="landing" label="page" />));
    await flush();
    await act(async () => button(container, "page").click());
    expect(button(container, "page").textContent).toBe("page 1");
  });

  it("lets a transition commit past a failed island under a changed provider, keeping its markup", async () => {
    const Theme = createContext("dark");
    function ThemeLabel() {
      return <span data-theme-label>{use(Theme)}</span>;
    }
    function ThemedCounter({ label }: { label: string }) {
      return <Counter label={`${label}-${use(Theme)}`} />;
    }
    const failing = vi.fn(() => Promise.reject(new Error("chunk failed")));
    const Broken = island<{ label: string }>(failing, { retryDelaysMs: [] });
    let setTheme: (value: string) => void = () => undefined;
    function Host() {
      const [theme, set] = useState("dark");
      setTheme = set;
      return (
        <Theme value={theme}>
          <ThemeLabel />
          <Broken label="broken" />
        </Theme>
      );
    }
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <Theme value="dark">
        <ThemeLabel />
        <Activity mode="visible">
          <span className="vk-island">
            <ThemedCounter label="broken" />
          </span>
        </Activity>
      </Theme>,
    );
    const spies = errorSpies();
    await act(async () => {
      track(hydrateRoot(container, <Host />, spies));
    });
    await flush();
    await act(async () => startTransition(() => setTheme("light")));
    await flush();
    expect(container.querySelector("[data-theme-label]")?.textContent).toBe("light");
    expect(container.querySelector('[data-island="broken-dark"]')?.textContent).toBe(
      "broken-dark 0",
    );
    await act(async () => setTheme("contrast"));
    expect(container.querySelector("[data-theme-label]")?.textContent).toBe("contrast");
    expect(container.querySelector('[data-island="broken-dark"]')?.textContent).toBe(
      "broken-dark 0",
    );
    expect(spies.onUncaughtError).not.toHaveBeenCalled();
    expect(spies.onRecoverableError).not.toHaveBeenCalled();
  });

  it("lets a soft navigation under a persisted layout commit past a failed island, keeping its markup", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("chunk failed")));
    const Header = island<{ label: string }>(failing, { retryDelaysMs: [] });
    let navigate: (path: string) => void = () => undefined;
    function Layout() {
      const [path, set] = useState("/");
      navigate = set;
      return (
        <>
          <Header label={`header${path}`} />
          <main data-page>{path}</main>
        </>
      );
    }
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <>
        <Activity mode="visible">
          <span className="vk-island">
            <Counter label="header/" />
          </span>
        </Activity>
        <main data-page>/</main>
      </>,
    );
    await act(async () => {
      track(hydrateRoot(container, <Layout />, errorSpies()));
    });
    await flush();
    await act(async () => startTransition(() => navigate("/docs")));
    await flush();
    expect(container.querySelector("[data-page]")?.textContent).toBe("/docs");
    expect(container.querySelector('[data-island="header/"]')?.textContent).toBe("header/ 0");
  });

  it("loads once however often it renders", async () => {
    const load = vi.fn(async () => Greeting);
    const Lazy = island(load);
    const container = document.createElement("div");
    const root = track(createRoot(container));
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
  });
});

describe("preloadIslands", () => {
  it("renders in the browser, where it must not hold the page back", () => {
    expect(rendersEagerly()).toBe(false);
  });

  it("starts every registered island together once the gate opens, before any of them renders", async () => {
    const gate = deferred<void>();
    const first = vi.fn(async () => Greeting);
    const second = vi.fn(async () => Greeting);
    const options = { gate: () => gate.promise };
    const settled = preloadIslands([island(first, options), island(second, options)]);
    await expect(settled).resolves.toBeUndefined();
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    gate.resolve();
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("afterFirstContentfulPaint", () => {
  it("holds an island's chunk until the first contentful paint, then clears its fallback timer", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const callbacks: Array<() => void> = [];
    const entries: Array<{ name: string }> = [];
    const disconnect = vi.fn();
    class FakeObserver {
      static supportedEntryTypes = ["paint"];
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", FakeObserver);
    const getEntries = vi
      .spyOn(performance, "getEntriesByName")
      .mockImplementation(
        (name: string) => entries.filter((entry) => entry.name === name) as never,
      );
    const fresh = await import("./island");
    const load = vi.fn(async () => Greeting);
    void fresh.preloadIslands([fresh.island(load)]);
    entries.push({ name: "first-paint" });
    for (const callback of callbacks) callback();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).not.toHaveBeenCalled();
    entries.push({ name: "first-contentful-paint" });
    for (const callback of callbacks) callback();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    getEntries.mockRestore();
    vi.unstubAllGlobals();
  });

  it("opens after its fallback delay when no paint entry ever arrives", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    class SilentObserver {
      static supportedEntryTypes = ["paint"];
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", SilentObserver);
    const fresh = await import("./island");
    let opened = false;
    void fresh.afterFirstContentfulPaint().then(() => {
      opened = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(opened).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(opened).toBe(true);
    vi.unstubAllGlobals();
  });
});
