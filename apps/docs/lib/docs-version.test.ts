// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currentChoice,
  LATEST,
  parseStoredChoices,
  placeAvailableFrom,
  RELEASE_LINES,
  readStoredChoices,
  setChoice,
  subscribeVersion,
  VERSION_INIT_SCRIPT,
  VERSION_STORAGE_KEY,
  versionAttribute,
} from "./docs-version";
import { inlineScriptHashes, scriptHash } from "./inline-script-hashes.mjs";
import { SCRIPT_HASHES_FILE } from "./script-hashes-manifest.mjs";

const ROOT = document.documentElement;
const ATTRIBUTES = ["data-vk-cli", "data-vk-studio", "data-vk-mcp"];

function runInitScript(): void {
  new Function(VERSION_INIT_SCRIPT)();
}

beforeEach(() => {
  for (const name of ATTRIBUTES) ROOT.removeAttribute(name);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("stored choices", () => {
  it("keeps only lines the release data knows", () => {
    expect(
      parseStoredChoices(JSON.stringify({ cli: "0.12", studio: "9.9", mcp: "latest" })),
    ).toEqual({
      cli: "0.12",
    });
  });

  it("falls back to Latest for empty, malformed or non-object storage", () => {
    expect(parseStoredChoices(null)).toEqual({});
    expect(parseStoredChoices("{")).toEqual({});
    expect(parseStoredChoices("[]")).toEqual({});
    expect(parseStoredChoices("7")).toEqual({});
  });

  it("falls back to Latest when storage throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(readStoredChoices()).toEqual({});
      expect(() => setChoice("cli", "0.12")).not.toThrow();
      expect(currentChoice("cli")).toBe("0.12");
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("choosing a line", () => {
  it("puts the choice on the html element, stores it and tells subscribers", () => {
    let notified = 0;
    const stop = subscribeVersion(() => {
      notified += 1;
    });
    setChoice("cli", "0.12");
    expect(ROOT.getAttribute("data-vk-cli")).toBe("0.12");
    expect(currentChoice("cli")).toBe("0.12");
    expect(JSON.parse(localStorage.getItem(VERSION_STORAGE_KEY) ?? "{}")).toEqual({ cli: "0.12" });
    expect(notified).toBe(1);
    stop();
  });

  it("keeps the other packages' choices and drops Latest from storage", () => {
    setChoice("cli", "0.12");
    setChoice("studio", "0.5");
    setChoice("cli", LATEST);
    expect(ROOT.hasAttribute("data-vk-cli")).toBe(false);
    expect(JSON.parse(localStorage.getItem(VERSION_STORAGE_KEY) ?? "{}")).toEqual({
      studio: "0.5",
    });
    expect(currentChoice("mcp")).toBe(LATEST);
  });

  it("reads an attribute the release data does not know as Latest", () => {
    ROOT.setAttribute("data-vk-cli", "0.1");
    ROOT.setAttribute("data-vk-studio", "not-a-line");
    expect(currentChoice("studio")).toBe(LATEST);
  });

  it("follows another tab through the storage event", () => {
    const stop = subscribeVersion(() => undefined);
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify({ mcp: "0.3" }));
    window.dispatchEvent(new StorageEvent("storage", { key: VERSION_STORAGE_KEY }));
    expect(ROOT.getAttribute(versionAttribute("mcp"))).toBe("0.3");
    stop();
  });

  it("offers a line only from the changelog-derived data", () => {
    for (const pkg of ["cli", "studio", "mcp"] as const) {
      expect(RELEASE_LINES[pkg].lines.length).toBeGreaterThan(0);
    }
  });
});

describe("the init script", () => {
  it("copies stored lines onto the html element before first paint", () => {
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify({ cli: "0.12", mcp: "0.3" }));
    runInitScript();
    expect(ROOT.getAttribute("data-vk-cli")).toBe("0.12");
    expect(ROOT.getAttribute("data-vk-mcp")).toBe("0.3");
    expect(ROOT.hasAttribute("data-vk-studio")).toBe(false);
  });

  it("ignores anything that is not a minor line", () => {
    localStorage.setItem(
      VERSION_STORAGE_KEY,
      JSON.stringify({ cli: "latest", studio: '0.5"><x', mcp: 4 }),
    );
    runInitScript();
    for (const name of ATTRIBUTES) expect(ROOT.hasAttribute(name), name).toBe(false);
  });

  it("does nothing without storage, with malformed storage or when storage throws", () => {
    runInitScript();
    localStorage.setItem(VERSION_STORAGE_KEY, "{");
    runInitScript();
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(runInitScript).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
    for (const name of ATTRIBUTES) expect(ROOT.hasAttribute(name), name).toBe(false);
  });

  it("is a constant, self-contained script that cannot close its own tag", () => {
    expect(VERSION_INIT_SCRIPT).not.toContain("<");
    expect(VERSION_INIT_SCRIPT).toContain(JSON.stringify(VERSION_STORAGE_KEY));
  });

  it("is hashed by the CSP mechanism like every inline script", () => {
    const html = `<html><body><script>${VERSION_INIT_SCRIPT}</script></body></html>`;
    expect(inlineScriptHashes(html)).toEqual([scriptHash(VERSION_INIT_SCRIPT)]);
  });

  const built = join(import.meta.dirname, "../.next", SCRIPT_HASHES_FILE);
  it.skipIf(!existsSync(built))(
    "is in the built hash manifest of every docs and landing page",
    () => {
      const routes: Record<string, string[]> = JSON.parse(readFileSync(built, "utf8"));
      const pages = Object.entries(routes).filter(([route]) =>
        /^\/(en|de|es|fr)(\/|$)/.test(route),
      );
      expect(pages.length).toBeGreaterThan(100);
      for (const [route, hashes] of pages) {
        expect(hashes, route).toContain(scriptHash(VERSION_INIT_SCRIPT));
      }
    },
  );
});

describe("placeAvailableFrom", () => {
  it("places a badge and refuses one the release data cannot place", () => {
    expect(placeAvailableFrom(undefined, "0.12.0")).toEqual({
      package: "cli",
      line: "0.12",
      patch: 0,
    });
    expect(() => placeAvailableFrom("@verbatra/mcp", "9.0.0")).toThrow(/no release line/);
  });
});
