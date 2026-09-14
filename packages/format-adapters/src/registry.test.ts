import type { FormatId, SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "./adapter.js";
import { AdapterError } from "./errors.js";
import { AdapterRegistry } from "./registry.js";

function fakeAdapter(format: SupportedFormat, claims: boolean): FormatAdapter {
  return {
    format,
    canHandle: () => claims,
    extractPlaceholders: () => [],
    validateMessage: () => true,
    read: () => Promise.reject(new Error("not used")),
    write: () => Promise.reject(new Error("not used")),
  };
}

describe("AdapterRegistry", () => {
  it("resolves the single adapter that claims a file", () => {
    const registry = new AdapterRegistry().register(fakeAdapter("i18next-json", true));
    const result = registry.resolve("en/common.json");
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.adapter.format).toBe("i18next-json");
    }
  });

  it("resolves by explicit format, bypassing detection", () => {
    const registry = new AdapterRegistry().register(fakeAdapter("i18next-json", false));
    const result = registry.resolve("x.unknown", { format: "i18next-json" });
    expect(result.status).toBe("resolved");
  });

  it("reports no-match with the formats it tried", () => {
    const registry = new AdapterRegistry().register(fakeAdapter("i18next-json", false));
    const result = registry.resolve("messages.yaml");
    expect(result).toEqual({
      status: "no-match",
      filePath: "messages.yaml",
      triedFormats: ["i18next-json"],
    });
  });

  it("reports no-match when an explicit format is not registered", () => {
    const registry = new AdapterRegistry().register(fakeAdapter("i18next-json", true));
    const result = registry.resolve("x.json", { format: "vue-i18n-json" });
    expect(result).toEqual({
      status: "no-match",
      filePath: "x.json",
      triedFormats: ["vue-i18n-json"],
    });
  });

  it("reports ambiguity, deterministically, when more than one adapter claims a file", () => {
    const registry = new AdapterRegistry()
      .register(fakeAdapter("i18next-json", true))
      .register(fakeAdapter("vue-i18n-json", true));
    const result = registry.resolve("x.json");
    expect(result).toEqual({
      status: "ambiguous",
      filePath: "x.json",
      candidates: ["i18next-json", "vue-i18n-json"],
    });
  });

  it("accepts a new adapter without changing existing ones (open for extension)", () => {
    const registry = new AdapterRegistry().register(fakeAdapter("i18next-json", false));
    registry.register(fakeAdapter("next-intl-json", true));
    const result = registry.resolve("x.json");
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.adapter.format).toBe("next-intl-json");
    }
  });
});

function customAdapter(format: FormatId, claims: boolean): FormatAdapter {
  return { ...fakeAdapter("i18next-json", claims), format };
}

function raisingAdapter(format: FormatId): FormatAdapter {
  return {
    ...fakeAdapter("i18next-json", true),
    format,
    extractPlaceholders: () => {
      throw new TypeError("boom");
    },
  };
}

describe("AdapterRegistry and third-party formats", () => {
  it("resolves a third-party adapter by its explicit format", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", false));

    const result = registry.resolve("de.toml", { format: "custom:toml" });

    expect(result.status).toBe("resolved");
  });

  it("resolves a third-party adapter by detection", () => {
    const registry = new AdapterRegistry()
      .register(fakeAdapter("i18next-json", false))
      .register(customAdapter("custom:toml", true));

    const result = registry.resolve("de.toml");

    expect(result).toEqual({ status: "resolved", adapter: expect.anything() });
  });

  it("lists a third-party format among the ones it tried", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", false));

    expect(registry.resolve("de.toml")).toEqual({
      status: "no-match",
      filePath: "de.toml",
      triedFormats: ["custom:toml"],
    });
  });

  it("names both competitors when a third-party format collides with a built-in", () => {
    const registry = new AdapterRegistry()
      .register(fakeAdapter("android-xml", true))
      .register(customAdapter("custom:my-xml", true));

    expect(registry.resolve("strings.xml")).toEqual({
      status: "ambiguous",
      filePath: "strings.xml",
      candidates: ["android-xml", "custom:my-xml"],
    });
  });
});

describe("AdapterRegistry rejects a duplicate format", () => {
  it("refuses a second adapter for a format it already holds", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", true));

    expect(() => registry.register(customAdapter("custom:toml", true))).toThrow(AdapterError);
  });

  it("names the format and the code, so the clashing plugin can be identified", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", true));

    try {
      registry.register(customAdapter("custom:toml", true));
      expect.unreachable("the duplicate registration should have thrown");
    } catch (error) {
      expect((error as AdapterError).code).toBe("DUPLICATE_FORMAT");
      expect((error as AdapterError).message).toContain("custom:toml");
    }
  });

  it("refuses a third-party adapter that shadows a built-in format", () => {
    const registry = new AdapterRegistry().register(fakeAdapter("i18next-json", true));

    expect(() => registry.register(customAdapter("i18next-json", true))).toThrow(AdapterError);
  });

  it("leaves the first registration in place after a rejected duplicate", () => {
    const first = customAdapter("custom:toml", true);
    const registry = new AdapterRegistry().register(first);

    expect(() => registry.register(customAdapter("custom:toml", true))).toThrow(AdapterError);
    const result = registry.resolve("de.toml", { format: "custom:toml" });

    expect(result.status === "resolved" && result.adapter.format).toBe("custom:toml");
  });

  it("still accepts two different formats", () => {
    const registry = new AdapterRegistry()
      .register(customAdapter("custom:toml", false))
      .register(customAdapter("custom:hcl", false));

    expect(registry.resolve("x.y")).toEqual({
      status: "no-match",
      filePath: "x.y",
      triedFormats: ["custom:toml", "custom:hcl"],
    });
  });
});

describe("AdapterRegistry attributes third-party failures", () => {
  it("turns a throw from a registered third-party adapter into a structured error", () => {
    const registry = new AdapterRegistry().register(raisingAdapter("custom:toml"));
    const result = registry.resolve("de.toml", { format: "custom:toml" });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      return;
    }
    try {
      result.adapter.extractPlaceholders("hi");
      expect.unreachable("the third-party adapter should have failed");
    } catch (error) {
      expect((error as AdapterError).code).toBe("ADAPTER_FAILED");
      expect((error as AdapterError).message).toContain("custom:toml");
    }
  });

  it("leaves a built-in adapter unwrapped, so its own failures are not relabelled", () => {
    const registry = new AdapterRegistry().register(raisingAdapter("i18next-json"));
    const result = registry.resolve("de.json", { format: "i18next-json" });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      return;
    }
    expect(() => result.adapter.extractPlaceholders("hi")).toThrow(TypeError);
  });

  it("surfaces a third-party canHandle failure from detection as a structured error", () => {
    const registry = new AdapterRegistry().register({
      ...fakeAdapter("i18next-json", true),
      format: "custom:toml",
      canHandle: () => {
        throw new TypeError("boom");
      },
    });

    expect(() => registry.resolve("de.toml")).toThrow(AdapterError);
  });
});
