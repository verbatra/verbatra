// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { createThemeStore } from "@verbatra/ui/theme";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "./theme-dom.js";

const PUBLIC_DIR = join(process.cwd(), "src", "app", "public");

const INIT_SCRIPT = readFileSync(join(PUBLIC_DIR, "theme-init.js"), "utf8");

const STORED_VALUES: ReadonlyArray<string | null> = [null, "system", "light", "dark", "sepia", ""];

function stubSystem(prefersLight: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () =>
      ({
        matches: prefersLight,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  });
}

function seed(stored: string | null): void {
  window.localStorage.clear();
  if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
  delete document.documentElement.dataset.theme;
}

function runInitScript(): string | undefined {
  runInNewContext(INIT_SCRIPT, { window, document });
  return document.documentElement.dataset.theme;
}

function runStore(): string | undefined {
  createThemeStore({ storageKey: THEME_STORAGE_KEY, modes: ["system", "light", "dark"] }).init();
  return document.documentElement.dataset.theme;
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("public/theme-init.js", () => {
  it("is a classic script that cannot import the ui store", () => {
    expect(INIT_SCRIPT).not.toMatch(/\bimport\b|\bexport\b|\brequire\(/);
  });

  it("reads the same storage key as the Studio theme store", () => {
    expect(INIT_SCRIPT).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it.each(
    STORED_VALUES.flatMap((stored) => [true, false].map((light) => [stored, light] as const)),
  )(
    "resolves stored %j with prefers-light %s exactly like the ui store",
    (stored, prefersLight) => {
      stubSystem(prefersLight);
      seed(stored);
      const fromScript = runInitScript();
      seed(stored);
      const fromStore = runStore();

      expect(fromScript).toBe(fromStore);
      expect(["light", "dark"]).toContain(fromScript);
    },
  );

  it("resolves like the ui store when storage is unavailable", () => {
    stubSystem(true);
    const denied = (): never => {
      throw new Error("storage is not available");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);

    const fromScript = runInitScript();
    delete document.documentElement.dataset.theme;

    expect(fromScript).toBe(runStore());
    expect(fromScript).toBe("light");
  });
});

describe("the Geist license shipped with the app", () => {
  it("is byte-equal to the license bundled with the ui fonts", () => {
    const uiFonts = dirname(
      createRequire(join(process.cwd(), "package.json")).resolve("@verbatra/ui/fonts.css"),
    );
    const bundled = readFileSync(join(uiFonts, "fonts", "OFL-Geist.txt"));
    const shipped = readFileSync(join(PUBLIC_DIR, "licenses", "OFL-Geist.txt"));
    expect(shipped.equals(bundled)).toBe(true);
  });
});
