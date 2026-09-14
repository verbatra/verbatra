import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import { verbatraConfigSchema } from "./schema.js";

describe("verbatraConfigSchema: targetLocales case-insensitive duplicates", () => {
  it("accepts distinct, case-insensitively-unique target locales", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ targetLocales: ["de", "fr", "it"] }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects two target locales differing only in case", () => {
    const result = verbatraConfigSchema.safeParse(baseConfig({ targetLocales: ["de", "DE"] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "targetLocales");
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("DE");
    }
  });

  it("rejects two identical target locales", () => {
    const result = verbatraConfigSchema.safeParse(baseConfig({ targetLocales: ["de", "de"] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "targetLocales");
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("de");
    }
  });

  it("rejects three-or-more-way case collisions, naming the first repeat", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ targetLocales: ["de", "fr", "De"] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "targetLocales");
      expect(issue?.message).toContain("De");
    }
  });
});

describe("verbatraConfigSchema: targetLocales vs sourceLocale", () => {
  it("rejects a target locale that exactly matches the source locale", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ sourceLocale: "en", targetLocales: ["en"] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "targetLocales");
      expect(issue?.message).toBe("targetLocales must not include the source locale");
    }
  });

  it("rejects a target locale that case-insensitively matches the source locale", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ sourceLocale: "de", targetLocales: ["DE"] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "targetLocales");
      expect(issue?.message).toBe("targetLocales must not include the source locale");
    }
  });
});

describe("verbatraConfigSchema: the {locale} token rule", () => {
  it("reports the same message at the same path as the whole-config rule it replaced", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ files: { pattern: "locales/common.json" } }),
    );

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path.join(".") === "files.pattern");
    expect(issue?.message).toBe("files.pattern must contain the {locale} token");
  });

  it("accepts a pattern that carries the token anywhere in the path", () => {
    expect(
      verbatraConfigSchema.safeParse(baseConfig({ files: { pattern: "{locale}/app.json" } }))
        .success,
    ).toBe(true);
  });

  it("rejects an empty pattern, which satisfies neither the length nor the token rule", () => {
    const result = verbatraConfigSchema.safeParse(baseConfig({ files: { pattern: "" } }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.filter((i) => i.path.join(".") === "files.pattern")).toHaveLength(
      2,
    );
  });
});

describe("verbatraConfigSchema: the $schema key", () => {
  it("accepts it, so a JSON or YAML config may point an editor at the shipped document", () => {
    const result = verbatraConfigSchema.safeParse({
      ...baseConfig(),
      $schema: "./node_modules/@verbatra/sdk/dist/config-schema.json",
    });

    expect(result.success).toBe(true);
    expect(result.data?.$schema).toBe("./node_modules/@verbatra/sdk/dist/config-schema.json");
  });

  it("is the only extra key the strict object tolerates", () => {
    expect(verbatraConfigSchema.safeParse({ ...baseConfig(), $schemaa: "x" }).success).toBe(false);
  });
});

describe("verbatraConfigSchema: files.localeStyle", () => {
  it("accepts a config that omits it, which is every config written before styles existed", () => {
    const result = verbatraConfigSchema.safeParse(baseConfig());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files.localeStyle).toBeUndefined();
    }
  });

  it.each(["literal", "posix", "android"])("accepts the %s style", (style) => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ files: { pattern: "locales/{locale}.json", localeStyle: style as "literal" } }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an unknown style", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({
        files: { pattern: "locales/{locale}.json", localeStyle: "apple" as "literal" },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("still requires the locale token in the pattern", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ files: { pattern: "locales/common.json", localeStyle: "android" } }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts the android source pattern, whose token expands to the default directory", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ files: { pattern: "res/{locale}/strings.xml", localeStyle: "android" } }),
    );
    expect(result.success).toBe(true);
  });
});

describe("verbatraConfigSchema: rates", () => {
  const rates = {
    asOf: "2026-01-15",
    currency: "USD",
    table: {
      "gemini/gemini-2.5-flash": { inputPerMillionTokens: 0.1, outputPerMillionTokens: 0.4 },
    },
  };

  it("is optional, so a project that never estimates in currency needs no rates block", () => {
    expect(verbatraConfigSchema.safeParse(baseConfig({})).success).toBe(true);
  });

  it("accepts a dated rate card", () => {
    const result = verbatraConfigSchema.safeParse(baseConfig({ rates }));
    expect(result.success).toBe(true);
  });

  it("rejects an undated rate card, because an undated price cannot be judged stale", () => {
    const { asOf: _asOf, ...undated } = rates;
    const config: unknown = { ...baseConfig({}), rates: undated };
    expect(verbatraConfigSchema.safeParse(config).success).toBe(false);
  });

  it("rejects an unknown key inside the rates block", () => {
    const config: unknown = { ...baseConfig({}), rates: { ...rates, source: "vendor page" } };
    expect(verbatraConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe("the optional extract block", () => {
  it("is accepted with a framework and roots", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({ extract: { framework: "i18next", roots: ["src"] } }),
    );

    expect(result.success).toBe(true);
  });

  it("stays optional, so a config without it is still valid", () => {
    expect(verbatraConfigSchema.safeParse(baseConfig({})).success).toBe(true);
  });

  it("rejects an unrecognized field inside it", () => {
    const result = verbatraConfigSchema.safeParse(
      baseConfig({
        extract: { framework: "i18next", roots: ["src"], glob: "**/*" } as unknown as never,
      }),
    );

    expect(result.success).toBe(false);
  });
});

function withFormat(format: string): unknown {
  return { ...baseConfig(), format };
}

describe("verbatraConfigSchema: format identity", () => {
  it("accepts a built-in format", () => {
    expect(verbatraConfigSchema.safeParse(baseConfig({ format: "yaml" })).success).toBe(true);
  });

  it("accepts a third-party format identifier", () => {
    const result = verbatraConfigSchema.safeParse(baseConfig({ format: "custom:toml" }));

    expect(result.success).toBe(true);
    expect(result.data?.format).toBe("custom:toml");
  });

  it("rejects an unknown bare format name", () => {
    const result = verbatraConfigSchema.safeParse(withFormat("toml"));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "format")).toBe(true);
  });

  it("rejects a malformed third-party format identifier", () => {
    expect(verbatraConfigSchema.safeParse(withFormat("custom:TOML")).success).toBe(false);
  });

  it("rejects the bare third-party prefix", () => {
    expect(verbatraConfigSchema.safeParse(withFormat("custom:")).success).toBe(false);
  });
});
