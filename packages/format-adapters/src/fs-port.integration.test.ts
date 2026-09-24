import type { LocaleResource, SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "./adapter.js";
import { createArbAdapter } from "./arb/arb-adapter.js";
import { AdapterError } from "./errors.js";
import type { AdapterFs, BoundedReadOutcome } from "./fs-port.js";
import { createI18nextJsonAdapter } from "./i18next/i18next-adapter.js";
import { createNextIntlJsonAdapter } from "./next-intl/next-intl-adapter.js";
import { createNgxTranslateJsonAdapter } from "./ngx-translate/ngx-translate-adapter.js";
import { createPropertiesAdapter } from "./properties/properties-adapter.js";
import { createMemoryAdapterFs } from "./test-support.js";
import { createVueI18nJsonAdapter } from "./vue-i18n/vue-i18n-adapter.js";
import { createXliffAdapter } from "./xliff/xliff-adapter.js";
import { createYamlAdapter } from "./yaml/yaml-adapter.js";

const XLIFF_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="app">
    <body>
      <trans-unit id="greeting">
        <source>Hello {{name}}</source>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

interface AdapterCase {
  readonly format: SupportedFormat;
  readonly make: (fs: AdapterFs) => FormatAdapter;
  readonly sourcePath: string;
  readonly source: string;
  readonly targetPath: string;
  readonly seedTarget?: string;
}

const cases: readonly AdapterCase[] = [
  {
    format: "i18next-json",
    make: createI18nextJsonAdapter,
    sourcePath: "/virtual/locales/en.json",
    source: '{"greeting":"Hello {{name}}"}',
    targetPath: "/virtual/locales/de.json",
  },
  {
    format: "vue-i18n-json",
    make: createVueI18nJsonAdapter,
    sourcePath: "/virtual/locales/en.json",
    source: '{"greeting":"Hello {name}"}',
    targetPath: "/virtual/locales/de.json",
  },
  {
    format: "next-intl-json",
    make: createNextIntlJsonAdapter,
    sourcePath: "/virtual/locales/en.json",
    source: '{"greeting":"Hello {name}"}',
    targetPath: "/virtual/locales/de.json",
  },
  {
    format: "ngx-translate-json",
    make: createNgxTranslateJsonAdapter,
    sourcePath: "/virtual/locales/en.json",
    source: '{"greeting":"Hello {{name}}"}',
    targetPath: "/virtual/locales/de.json",
    seedTarget: '{"greeting":"Hallo"}',
  },
  {
    format: "xliff",
    make: createXliffAdapter,
    sourcePath: "/virtual/locales/en.xlf",
    source: XLIFF_DOCUMENT,
    targetPath: "/virtual/locales/de.xlf",
    seedTarget: XLIFF_DOCUMENT,
  },
  {
    format: "yaml",
    make: createYamlAdapter,
    sourcePath: "/virtual/locales/en.yml",
    source: "greeting: Hello {{name}}\n",
    targetPath: "/virtual/locales/de.yml",
  },
  {
    format: "arb",
    make: createArbAdapter,
    sourcePath: "/virtual/locales/app_en.arb",
    source: '{"greeting":"Hello {name}","@greeting":{"description":"A greeting"}}',
    targetPath: "/virtual/locales/app_de.arb",
    seedTarget: '{"greeting":"Hallo","@greeting":{"description":"A greeting"}}',
  },
  {
    format: "properties",
    make: createPropertiesAdapter,
    sourcePath: "/virtual/locales/messages_en.properties",
    source: "# a comment\ngreeting=Hello {0}\n",
    targetPath: "/virtual/locales/messages_de.properties",
    seedTarget: "# a comment\ngreeting=Hallo\n",
  },
];

function translated(resource: LocaleResource, locale: string): LocaleResource {
  const entries = new Map(
    [...resource.entries].map(([key, entry]) => [
      key,
      { ...entry, value: `[${locale}] ${entry.value}` },
    ]),
  );
  return { ...resource, locale, entries };
}

describe("every adapter reads and writes through an injected AdapterFs", () => {
  for (const adapterCase of cases) {
    it(`${adapterCase.format} never touches disk when a port is supplied`, async () => {
      const seed: Record<string, string> = { [adapterCase.sourcePath]: adapterCase.source };
      if (adapterCase.seedTarget !== undefined) {
        seed[adapterCase.targetPath] = adapterCase.seedTarget;
      }
      const fs = createMemoryAdapterFs(seed);
      const adapter = adapterCase.make(fs);

      const { resource } = await adapter.read(adapterCase.sourcePath, "en");
      expect([...resource.entries.values()][0]?.value).toContain("Hello");

      await adapter.write(translated(resource, "de"), adapterCase.targetPath);

      expect(fs.files.get(adapterCase.targetPath)).toContain("[de] Hello");
      expect([...fs.files.keys()].sort()).toEqual(
        [adapterCase.sourcePath, adapterCase.targetPath].sort(),
      );
    });
  }
});

describe("the ENOENT contract a port owes the destination re-read", () => {
  it("writes a complete properties file to a path the port does not hold yet", async () => {
    const fs = createMemoryAdapterFs({
      "/virtual/messages_en.properties": "greeting=Hello {0}\nfarewell=Bye\n",
    });
    const adapter = createPropertiesAdapter(fs);

    const { resource } = await adapter.read("/virtual/messages_en.properties", "en");
    await adapter.write(translated(resource, "de"), "/virtual/messages_de.properties");

    expect(fs.files.get("/virtual/messages_de.properties")).toBe(
      "greeting=[de] Hello {0}\nfarewell=[de] Bye\n",
    );
  });

  it("writes a complete ARB file to a path the port does not hold yet", async () => {
    const fs = createMemoryAdapterFs({
      "/virtual/app_en.arb": '{"greeting":"Hello {name}","@greeting":{"description":"A greeting"}}',
    });
    const adapter = createArbAdapter(fs);

    const { resource } = await adapter.read("/virtual/app_en.arb", "en");
    await adapter.write(translated(resource, "de"), "/virtual/app_de.arb");

    expect(JSON.parse(fs.files.get("/virtual/app_de.arb") ?? "")).toEqual({
      "@@locale": "de",
      greeting: "[de] Hello {name}",
    });
  });

  it("fails the properties write when the port reports a missing file as a plain error", async () => {
    const fs = plainErrorOnMissing({ "/virtual/messages_en.properties": "greeting=Hello\n" });
    const adapter = createPropertiesAdapter(fs);

    const { resource } = await adapter.read("/virtual/messages_en.properties", "en");
    const error = await adapter
      .write(translated(resource, "de"), "/virtual/messages_de.properties")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("fails the ARB write when the port reports a missing file as a plain error", async () => {
    const fs = plainErrorOnMissing({ "/virtual/app_en.arb": '{"greeting":"Hello"}' });
    const adapter = createArbAdapter(fs);

    const { resource } = await adapter.read("/virtual/app_en.arb", "en");
    const error = await adapter
      .write(translated(resource, "de"), "/virtual/app_de.arb")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("no such entry");
  });
});

function plainErrorOnMissing(initial: Record<string, string>): AdapterFs {
  const files = new Map(Object.entries(initial));
  return {
    async readBounded(path: string): Promise<BoundedReadOutcome> {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error("no such entry");
      }
      return { kind: "ok", content };
    },
    async writeFileAtomic(path: string, data: string): Promise<void> {
      files.set(path, data);
    },
  };
}
