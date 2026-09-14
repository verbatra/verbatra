import { AdapterRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it } from "vitest";
import { buildProvider } from "../config/provider-config.js";
import { SdkError } from "../errors.js";
import { makeStubProvider } from "../test-support.js";
import { selectAdapter } from "./select-adapter.js";
import { selectProvider } from "./select-provider.js";

function tomlAdapter(): FormatAdapter {
  return {
    format: "custom:toml",
    canHandle: (filePath) => filePath.endsWith(".toml"),
    extractPlaceholders: () => [],
    validateMessage: () => true,
    read: () => Promise.reject(new Error("not used")),
    write: () => Promise.resolve(),
  };
}

describe("selectAdapter", () => {
  it("selects the adapter for the configured format", () => {
    expect(selectAdapter("vue-i18n-json").format).toBe("vue-i18n-json");
    expect(selectAdapter("ngx-translate-json").format).toBe("ngx-translate-json");
  });

  it("resolves the non-JSON formats (XLIFF, YAML, ARB)", () => {
    expect(selectAdapter("xliff").format).toBe("xliff");
    expect(selectAdapter("yaml").format).toBe("yaml");
    expect(selectAdapter("arb").format).toBe("arb");
  });

  it("names the supported formats, including the new ones, in the error message", () => {
    const empty = new AdapterRegistry();
    const error = (() => {
      try {
        selectAdapter("xliff", empty);
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SdkError);
    const message = (error as SdkError).message;
    expect(message).toContain("xliff");
    expect(message).toContain("yaml");
    expect(message).toContain("arb");
  });

  it("throws a structured UNKNOWN_FORMAT when no adapter is registered", () => {
    const empty = new AdapterRegistry();
    const error = (() => {
      try {
        selectAdapter("i18next-json", empty);
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("UNKNOWN_FORMAT");
  });
});

describe("selectProvider", () => {
  it("uses the injected createProvider", () => {
    const stub = makeStubProvider({ id: "stub" });
    const provider = selectProvider(
      { id: "anthropic", options: { model: "m", maxTokens: 1 } },
      () => stub.provider,
    );
    expect(provider).toBe(stub.provider);
  });

  it("wraps a non-Error construction failure as a structured error", () => {
    const error = (() => {
      try {
        selectProvider({ id: "deepl", options: {} }, () => {
          throw "raw construction failure";
        });
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect((error as SdkError).code).toBe("PROVIDER_CONSTRUCTION_FAILED");
  });

  it("wraps a construction failure as PROVIDER_CONSTRUCTION_FAILED, secret-free", () => {
    const error = (() => {
      try {
        selectProvider({ id: "anthropic", options: { model: "m", maxTokens: 1 } }, () => {
          throw new Error("missing key");
        });
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("PROVIDER_CONSTRUCTION_FAILED");
  });
});

describe("buildProvider (factory table, offline construction)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("constructs each configured provider from the id->factory table", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.DEEPL_API_KEY = "test-key:fx";

    const anthropic = buildProvider({ id: "anthropic", options: { model: "m", maxTokens: 1 } });
    expect(anthropic.id).toBe("anthropic");
    expect(anthropic.kind).toBe("llm");

    const openai = buildProvider({ id: "openai", options: { model: "m", maxOutputTokens: 1 } });
    expect(openai.id).toBe("openai");

    const gemini = buildProvider({ id: "gemini", options: { model: "m", maxOutputTokens: 1 } });
    expect(gemini.id).toBe("gemini");

    const deepl = buildProvider({ id: "deepl", options: {} });
    expect(deepl.id).toBe("deepl");
    expect(deepl.kind).toBe("machine-translation");
  });
});

describe("selectAdapter and third-party formats", () => {
  it("selects a registered third-party adapter", () => {
    const registry = new AdapterRegistry().register(tomlAdapter());

    expect(selectAdapter("custom:toml", registry).format).toBe("custom:toml");
  });

  it("throws UNKNOWN_FORMAT when nothing supplies the third-party adapter", () => {
    const error = (() => {
      try {
        selectAdapter("custom:toml", new AdapterRegistry());
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect((error as SdkError).code).toBe("UNKNOWN_FORMAT");
  });

  it("tells the caller to supply a registry rather than listing the built-in formats", () => {
    const error = (() => {
      try {
        selectAdapter("custom:toml", new AdapterRegistry());
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    const message = (error as SdkError).message;

    expect(message).toContain("custom:toml");
    expect(message).toContain("adapterRegistry");
    expect(message).not.toContain("i18next-json");
  });

  it("still lists the built-in formats for an unregistered built-in format", () => {
    const error = (() => {
      try {
        selectAdapter("yaml", new AdapterRegistry());
        return undefined;
      } catch (e) {
        return e;
      }
    })();

    expect((error as SdkError).message).toContain("i18next-json");
  });
});
