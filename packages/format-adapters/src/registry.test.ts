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

    expect(result.status === "resolved" && result.adapter.format).toBe("custom:toml");
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

describe("AdapterRegistry rejects a malformed third-party identifier", () => {
  const malformed = [
    "custom:TOML",
    "custom:",
    "custom:-toml",
    "custom:toml-",
    "custom:to--ml",
    "custom:a:b",
    "custom:toml ",
  ] as const;

  it.each(malformed)("refuses to register %j", (format) => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(customAdapter(format, true))).toThrow(AdapterError);
  });

  it("names the code and the offending identifier", () => {
    try {
      new AdapterRegistry().register(customAdapter("custom:TOML", true));
      expect.unreachable("the malformed identifier should have been refused");
    } catch (error) {
      expect((error as AdapterError).code).toBe("INVALID_FORMAT_ID");
      expect((error as AdapterError).message).toContain("custom:TOML");
    }
  });

  it("registers nothing, so the malformed adapter is not resolvable afterwards", () => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(customAdapter("custom:TOML", true))).toThrow(AdapterError);

    expect(registry.resolve("x.toml", { format: "custom:TOML" }).status).toBe("no-match");
  });

  it("never leaves a prefixed adapter unwrapped, so attribution cannot be bypassed", () => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(raisingAdapter("custom:TOML"))).toThrow(AdapterError);
  });

  it("still accepts a well-formed identifier", () => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(customAdapter("custom:toml", true))).not.toThrow();
  });

  it("leaves a built-in format untouched by the identifier check", () => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(fakeAdapter("i18next-json", true))).not.toThrow();
  });
});

describe("AdapterRegistry refuses every shape of malformed third-party identifier", () => {
  const malformed: ReadonlyArray<readonly [string, `custom:${string}`]> = [
    ["an uppercase name", "custom:TOML"],
    ["a mixed-case name", "custom:Toml"],
    ["an uppercase letter mid-name", "custom:myToml"],
    ["an interior space", "custom:my toml"],
    ["a leading space", "custom: toml"],
    ["a trailing space", "custom:toml "],
    ["a name that is only a space", "custom: "],
    ["an empty name", "custom:"],
    ["a trailing hyphen", "custom:toml-"],
    ["a leading hyphen", "custom:-toml"],
    ["a doubled hyphen", "custom:to--ml"],
    ["a trailing colon", "custom:toml:"],
    ["a doubled prefix", "custom:custom:toml"],
    ["a doubled prefix with an empty tail", "custom:custom:"],
    ["an underscore", "custom:my_toml"],
    ["a dot", "custom:my.toml"],
    ["a slash", "custom:my/toml"],
    ["a scoped npm name", "custom:@acme/toml"],
    ["a newline", "custom:toml\n"],
    ["a tab", "custom:toml\t"],
    ["a non-ascii letter", "custom:tomlé"],
  ];

  it.each(malformed)("refuses %s", (_label, format) => {
    expect(() => new AdapterRegistry().register(customAdapter(format, true))).toThrow(AdapterError);
  });

  it.each(malformed)(
    "refuses %s with INVALID_FORMAT_ID naming the identifier",
    (_label, format) => {
      try {
        new AdapterRegistry().register(customAdapter(format, true));
        expect.unreachable("the malformed identifier should have been refused");
      } catch (error) {
        expect((error as AdapterError).code).toBe("INVALID_FORMAT_ID");
        expect((error as AdapterError).message).toContain(format);
      }
    },
  );

  it.each(malformed)(
    "registers nothing for %s, so detection never reaches it",
    (_label, format) => {
      const registry = new AdapterRegistry();

      expect(() => registry.register(customAdapter(format, true))).toThrow(AdapterError);

      expect(registry.resolve("de.toml")).toEqual({
        status: "no-match",
        filePath: "de.toml",
        triedFormats: [],
      });
    },
  );

  it.each(malformed)(
    "never registers %s unwrapped, so nothing can bypass attribution",
    (_label, format) => {
      const registry = new AdapterRegistry();

      expect(() => registry.register(raisingAdapter(format))).toThrow(AdapterError);

      expect(registry.resolve("de.toml", { format }).status).toBe("no-match");
    },
  );
});

describe("AdapterRegistry accepts the well-formed identifiers the pattern allows", () => {
  const wellFormed: ReadonlyArray<`custom:${string}`> = [
    "custom:toml",
    "custom:my-toml",
    "custom:a-b-c",
    "custom:toml2",
    "custom:123",
    "custom:a",
    "custom:custom",
  ];

  it.each(wellFormed)("registers %s", (format) => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(customAdapter(format, true))).not.toThrow();
    expect(registry.resolve("de.toml", { format }).status).toBe("resolved");
  });

  it.each(wellFormed)("wraps %s, so its failures are attributed", (format) => {
    const registry = new AdapterRegistry().register(raisingAdapter(format));
    const result = registry.resolve("de.toml", { format });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      return;
    }
    try {
      result.adapter.extractPlaceholders("hi");
      expect.unreachable("the third-party adapter should have failed");
    } catch (error) {
      expect((error as AdapterError).code).toBe("ADAPTER_FAILED");
      expect((error as AdapterError).message).toContain(format);
    }
  });
});

describe("AdapterRegistry and a valid identifier that collides", () => {
  it("refuses a second, differently-built adapter claiming the same custom identifier", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", false));

    expect(() => registry.register(raisingAdapter("custom:toml"))).toThrow(AdapterError);
  });

  it("keeps the first adapter's behaviour after the collision is refused", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", false));

    expect(() => registry.register(raisingAdapter("custom:toml"))).toThrow(AdapterError);
    const result = registry.resolve("de.toml", { format: "custom:toml" });

    expect(result.status === "resolved" && result.adapter.extractPlaceholders("hi")).toEqual([]);
  });

  it("does not grow the tried-format list when a collision is refused", () => {
    const registry = new AdapterRegistry().register(customAdapter("custom:toml", false));

    expect(() => registry.register(customAdapter("custom:toml", false))).toThrow(AdapterError);

    expect(registry.resolve("de.toml")).toEqual({
      status: "no-match",
      filePath: "de.toml",
      triedFormats: ["custom:toml"],
    });
  });

  it("refuses a collision that arrives only after other registrations", () => {
    const registry = new AdapterRegistry()
      .register(customAdapter("custom:toml", false))
      .register(customAdapter("custom:hcl", false));

    expect(() => registry.register(customAdapter("custom:toml", false))).toThrow(AdapterError);
  });
});
