import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import {
  type AdapterFs,
  type BoundedReadOutcome,
  createAndroidXmlAdapter,
  createAppleStringsAdapter,
  createDefaultRegistry,
  createFlatFileAdapter,
  createGettextAdapter,
  createIniAdapter,
  createPropertiesAdapter,
  createResxAdapter,
  createXliffAdapter,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeFakeFs, makeStubProvider, makeTempDir } from "../test-support.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { readSource } from "./source.js";
import { translate } from "./translate-project.js";

function memoryFs(files: Record<string, string>): AdapterFs {
  return {
    readBounded: (path): Promise<BoundedReadOutcome> => {
      const content = files[path];
      if (content === undefined) {
        return Promise.reject(
          Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: "ENOENT" }),
        );
      }
      return Promise.resolve({ kind: "ok", content } as const);
    },
    writeFileAtomic: (path, data): Promise<void> => {
      files[path] = data;
      return Promise.resolve();
    },
  };
}

function sourceEntry(value: string, placeholders: readonly string[]): TranslationEntry {
  return { key: "greeting", namespace: "", value, placeholders, isPlural: false };
}

const INTACT: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

const BROKEN: PlaceholderIntegrityResult = {
  matches: false,
  missing: ["{name}"],
  extra: [],
  reordered: false,
};

function flatAdapterWith(
  comparePlaceholders?: (a: string, b: string) => PlaceholderIntegrityResult,
): FormatAdapter {
  return createFlatFileAdapter({
    format: "custom:kv",
    extensions: [".kv"],
    parseEntries: () => new Map(),
    serializeEntries: () => "",
    extractPlaceholders: (value) => [...value.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]),
    ...(comparePlaceholders === undefined ? {} : { comparePlaceholders }),
    fs: memoryFs({}),
  });
}

describe("createFlatFileAdapter comparePlaceholders reaches the SDK integrity gate", () => {
  it("is consulted instead of the flat multiset check", () => {
    const seen: string[] = [];
    const adapter = flatAdapterWith((source, candidate) => {
      seen.push(source, candidate);
      return INTACT;
    });

    gateCandidateValue(sourceEntry("Hi {name}", ["{name}"]), "Hallo {name}", adapter);

    expect(seen).toEqual(["Hi {name}", "Hallo {name}"]);
  });

  it("accepts a candidate the flat multiset check would have refused", () => {
    const withComparator = flatAdapterWith(() => INTACT);
    const withoutComparator = flatAdapterWith();
    const entry = sourceEntry("Hi {name}", ["{name}"]);

    expect(gateCandidateValue(entry, "Hallo", withoutComparator)).toEqual({
      accepted: false,
      reason: "placeholder",
    });
    expect(gateCandidateValue(entry, "Hallo", withComparator)).toEqual({
      accepted: true,
      integrity: INTACT,
    });
  });

  it("refuses a candidate the flat multiset check would have accepted", () => {
    const withComparator = flatAdapterWith(() => BROKEN);
    const withoutComparator = flatAdapterWith();
    const entry = sourceEntry("Hi {name}", ["{name}"]);

    expect(gateCandidateValue(entry, "Hallo {name}", withoutComparator)).toEqual({
      accepted: true,
      integrity: INTACT,
    });
    expect(gateCandidateValue(entry, "Hallo {name}", withComparator)).toEqual({
      accepted: false,
      reason: "placeholder",
    });
  });

  it("carries the comparator's own verdict out of the gate, not a recomputed one", () => {
    const verdict: PlaceholderIntegrityResult = {
      matches: true,
      missing: [],
      extra: [],
      reordered: true,
    };
    const adapter = flatAdapterWith(() => verdict);

    const result = gateCandidateValue(sourceEntry("Hi {name}", ["{name}"]), "Hallo", adapter);

    expect(result).toEqual({ accepted: true, integrity: verdict });
    expect(result.accepted && result.integrity.reordered).toBe(true);
  });
});

const ANDROID_XML = `<resources>
  <string name="app_id" translatable="false">com.example.app</string>
  <string name="greeting">Hello</string>
  <plurals name="internal_count" translatable="false"><item quantity="other">x</item></plurals>
</resources>
`;

describe("the Android adapter's skipped names reach the SDK's source-read boundary", () => {
  const path = "/workspace/res/values-en/strings.xml";

  it("hands readSource the names the file marked untranslatable", async () => {
    const adapter = createAndroidXmlAdapter(memoryFs({ [path]: ANDROID_XML }));
    const config = baseConfig({
      format: "android-xml",
      files: { pattern: "res/values-{locale}/strings.xml" },
    });

    const result = await readSource(
      config,
      "/workspace",
      makeFakeFs({ fileExists: async () => true }),
      adapter,
    );

    expect(result.excludedLeafPaths).toEqual(["app_id", "internal_count"]);
  });

  it("still hands readSource the translatable entries alongside them", async () => {
    const adapter = createAndroidXmlAdapter(memoryFs({ [path]: ANDROID_XML }));
    const config = baseConfig({
      format: "android-xml",
      files: { pattern: "res/values-{locale}/strings.xml" },
    });

    const result = await readSource(
      config,
      "/workspace",
      makeFakeFs({ fileExists: async () => true }),
      adapter,
    );

    expect([...result.resource.entries.keys()]).toEqual(["greeting"]);
  });
});

describe("a flat adapter that returns a bare map reports nothing skipped", () => {
  const cases: ReadonlyArray<readonly [string, FormatAdapter, string, string]> = [
    [
      "properties",
      createPropertiesAdapter(memoryFs({ "/p/en.properties": "greeting=Hello\n" })),
      "/p/en.properties",
      "greeting",
    ],
    [
      "ini",
      createIniAdapter(memoryFs({ "/p/en.ini": "[app]\ngreeting=Hello\n" })),
      "/p/en.ini",
      "app.greeting",
    ],
    [
      "apple-strings",
      createAppleStringsAdapter(memoryFs({ "/p/en.strings": '"greeting" = "Hello";\n' })),
      "/p/en.strings",
      "greeting",
    ],
    [
      "resx",
      createResxAdapter(
        memoryFs({
          "/p/en.resx": `<?xml version="1.0" encoding="utf-8"?><root><data name="greeting" xml:space="preserve"><value>Hello</value></data></root>`,
        }),
      ),
      "/p/en.resx",
      "greeting",
    ],
    [
      "gettext-po",
      createGettextAdapter(
        memoryFs({ "/p/en.po": 'msgid ""\nmsgstr ""\n\nmsgid "greeting"\nmsgstr "Hello"\n' }),
      ),
      "/p/en.po",
      "greeting",
    ],
    [
      "xliff",
      createXliffAdapter(
        memoryFs({
          "/p/en.xlf": `<?xml version="1.0" encoding="UTF-8"?><xliff version="1.2"><file source-language="en" datatype="plaintext" original="messages"><body><trans-unit id="greeting"><source>Hello</source></trans-unit></body></file></xliff>`,
        }),
      ),
      "/p/en.xlf",
      "greeting",
    ],
  ];

  it.each(cases)("reports nothing skipped for %s", async (_name, adapter, path, key) => {
    const result = await adapter.read(path, "en");

    expect(result.resource.entries.has(key)).toBe(true);
    expect(result.excludedLeafPaths).toEqual([]);
  });
});

const KV_SOURCE = "greeting=Hello {name}\nfarewell=Bye\n";

function kvAdapter(): FormatAdapter {
  return createFlatFileAdapter({
    format: "custom:kv",
    extensions: [".kv"],
    parseEntries: (content, namespace) => {
      const entries = new Map<string, TranslationEntry>();
      for (const line of content.split("\n")) {
        const separator = line.indexOf("=");
        if (separator < 1) {
          continue;
        }
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        entries.set(key, {
          key,
          namespace,
          value,
          placeholders: [...value.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]),
          isPlural: false,
        });
      }
      return entries;
    },
    serializeEntries: (entries) =>
      `${[...entries].map(([key, entry]) => `${key}=${entry.value}`).join("\n")}\n`,
    extractPlaceholders: (value) => [...value.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]),
  });
}

describe("translate runs end to end through a third-party adapter", () => {
  async function projectDir(): Promise<string> {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"), { recursive: true });
    await writeFile(join(dir, "locales", "en.kv"), KV_SOURCE, "utf8");
    return dir;
  }

  const config = (): VerbatraConfig =>
    baseConfig({
      targetLocales: ["de"],
      format: "custom:kv",
      files: { pattern: "locales/{locale}.kv" },
    });

  it("writes the target file through the registered custom adapter", async () => {
    const dir = await projectDir();
    const stub = makeStubProvider();
    const adapterRegistry = createDefaultRegistry().register(kvAdapter());

    const summary = await translate(
      { config: config(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry },
    );

    expect(summary.failed).toEqual([]);
    expect([...summary.succeeded]).toEqual(["de"]);
    const written = await readFile(join(dir, "locales", "de.kv"), "utf8");
    expect(written.split("\n").filter((line) => line !== "")).toHaveLength(2);
    expect(written).toContain("greeting=");
  });

  it("carries the third-party format identifier onto the resource the adapter produced", async () => {
    const dir = await projectDir();
    const adapterRegistry = createDefaultRegistry().register(kvAdapter());
    const adapter = adapterRegistry.resolve("locales/en.kv", { format: "custom:kv" });

    expect(adapter.status).toBe("resolved");
    if (adapter.status !== "resolved") {
      return;
    }
    const { resource } = await adapter.adapter.read(join(dir, "locales", "en.kv"), "en");

    expect(resource.format).toBe("custom:kv");
    expect([...resource.entries.keys()]).toEqual(["greeting", "farewell"]);
  });

  it("fails with UNKNOWN_FORMAT naming the identifier when the registry omits the adapter", async () => {
    const dir = await projectDir();
    const stub = makeStubProvider();

    await expect(
      translate({ config: config(), cwd: dir }, { createProvider: () => stub.provider }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });

  it("attributes a throw from the third-party adapter's read to the plugin, not to verbatra", async () => {
    const dir = await projectDir();
    const stub = makeStubProvider();
    const broken: FormatAdapter = {
      ...kvAdapter(),
      format: "custom:kv",
      read: () => {
        throw new TypeError("plugin defect");
      },
    };
    const adapterRegistry = createDefaultRegistry().register(broken);

    const failure = await translate(
      { config: config(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry },
    ).catch((error: unknown) => error);

    expect(String((failure as Error).message)).toContain("custom:kv");
    expect(String((failure as Error).message)).toContain("read()");
  });
});
