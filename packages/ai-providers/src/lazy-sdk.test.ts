import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./errors.js";
import { loadSdkModule, memoizeAsync, sdkLoadFailedMessage } from "./lazy-sdk.js";

describe("loadSdkModule", () => {
  it("returns the imported module", async () => {
    await expect(loadSdkModule("pkg", async () => ({ value: 1 }))).resolves.toEqual({ value: 1 });
  });

  it("turns a failed import into a PROVIDER_ERROR that names the package and no path", async () => {
    const failure = await loadSdkModule("pkg", () =>
      Promise.reject(new Error("Cannot find package '/secret/path/node_modules/pkg'")),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ code: "PROVIDER_ERROR", message: sdkLoadFailedMessage("pkg") });
    expect((failure as Error).message).not.toContain("/secret/path");
  });
});

describe("memoizeAsync", () => {
  it("builds once for concurrent and later calls", async () => {
    const build = vi.fn(async () => ({}));
    const get = memoizeAsync(build);

    const [first, second] = await Promise.all([get(), get()]);
    const third = await get();

    expect(build).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("does not keep a rejected build, so the next call tries again", async () => {
    const build = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce("loaded");
    const get = memoizeAsync(build);

    await expect(get()).rejects.toThrow("load failed");
    await expect(get()).resolves.toBe("loaded");
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("shares one rejection between concurrent callers", async () => {
    const build = vi.fn(() => Promise.reject(new Error("load failed")));
    const get = memoizeAsync(build);

    const results = await Promise.allSettled([get(), get()]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
