import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({ readFile }));

async function freshLoader() {
  vi.resetModules();
  return (await import("./og-fonts")).loadOgFonts;
}

describe("loadOgFonts", () => {
  beforeEach(() => {
    readFile.mockReset();
    readFile.mockImplementation(async () => Buffer.from("font"));
  });

  it("reads the Latin set once however many locales load", async () => {
    const loadOgFonts = await freshLoader();
    await loadOgFonts("en");
    await loadOgFonts("de");
    await loadOgFonts("fr");
    expect(readFile).toHaveBeenCalledTimes(3);
  });

  it("retries after a failed read instead of caching the rejection", async () => {
    const loadOgFonts = await freshLoader();
    readFile.mockRejectedValueOnce(new Error("missing font"));
    await expect(loadOgFonts("en")).rejects.toThrow("missing font");
    await expect(loadOgFonts("en")).resolves.toHaveLength(3);
  });
});
