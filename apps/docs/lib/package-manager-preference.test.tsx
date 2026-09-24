// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PACKAGE_MANAGER_STORAGE_KEY } from "@/lib/install-commands";
import {
  readPackageManager,
  usePackageManager,
  writePackageManager,
} from "@/lib/package-manager-preference";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

function Probe({ onRender }: { onRender: (value: ReturnType<typeof usePackageManager>) => void }) {
  const state = usePackageManager("npm");
  onRender(state);
  return null;
}

describe("package manager preference", () => {
  it("prefers the tab session over the persisted choice, like the docs tabs", () => {
    window.localStorage.setItem(PACKAGE_MANAGER_STORAGE_KEY, "yarn");
    expect(readPackageManager()).toBe("yarn");
    window.sessionStorage.setItem(PACKAGE_MANAGER_STORAGE_KEY, "bun");
    expect(readPackageManager()).toBe("bun");
  });

  it("ignores a value that is not a package manager", () => {
    window.localStorage.setItem(PACKAGE_MANAGER_STORAGE_KEY, "deno");
    expect(readPackageManager()).toBeUndefined();
  });

  it("writes both storages so the docs tabs pick the choice up", () => {
    writePackageManager("pnpm");
    expect(window.localStorage.getItem(PACKAGE_MANAGER_STORAGE_KEY)).toBe("pnpm");
    expect(window.sessionStorage.getItem(PACKAGE_MANAGER_STORAGE_KEY)).toBe("pnpm");
  });

  it("falls back quietly when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPackageManager()).toBeUndefined();
    expect(() => writePackageManager("yarn")).not.toThrow();
  });

  it("starts on the stored choice and saves a new one", async () => {
    window.localStorage.setItem(PACKAGE_MANAGER_STORAGE_KEY, "yarn");
    let latest: ReturnType<typeof usePackageManager> | undefined;
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Probe onRender={(state) => (latest = state)} />);
    });
    expect(latest?.[0]).toBe("yarn");
    await act(async () => latest?.[1]("bun"));
    expect(latest?.[0]).toBe("bun");
    expect(window.localStorage.getItem(PACKAGE_MANAGER_STORAGE_KEY)).toBe("bun");
    await act(async () => root.unmount());
  });
});
