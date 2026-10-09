export const SAMPLE_SOURCE_LOCALE = "en";

export const SAMPLE_SOURCE_PLACEHOLDER = "{{amount}}";

export const SAMPLE_SOURCE = [
  { path: ["cart", "total"], value: "Total: {{amount}}" },
  { path: ["cart", "checkout"], value: "Check out" },
  { path: ["account", "signIn"], value: "Sign in" },
  { path: ["account", "orders"], value: "Your orders" },
];

export const FORMAT_SAMPLE_SPECS = {
  "i18next-json": { file: "locales/en.json", placeholder: "{{amount}}", keys: "dotted" },
  "vue-i18n-json": { file: "src/locales/en.json", placeholder: "{amount}", keys: "dotted" },
  "next-intl-json": { file: "messages/en.json", placeholder: "{amount}", keys: "dotted" },
  "ngx-translate-json": {
    file: "src/assets/i18n/en.json",
    placeholder: "{{amount}}",
    keys: "dotted",
  },
  xliff: { file: "locales/en.xlf", placeholder: "{amount}", keys: "dotted" },
  yaml: { file: "locales/en.yml", placeholder: "{{amount}}", keys: "dotted" },
  arb: { file: "lib/l10n/app_en.arb", placeholder: "{amount}", keys: "camel" },
  properties: {
    file: "src/main/resources/messages_en.properties",
    placeholder: "{0}",
    keys: "dotted",
  },
  "apple-strings": { file: "en.lproj/Localizable.strings", placeholder: "%@", keys: "dotted" },
  "apple-xcstrings": { file: "Localizable.xcstrings", placeholder: "%@", keys: "dotted" },
  "android-xml": {
    file: "app/src/main/res/values/strings.xml",
    placeholder: "%1$s",
    keys: "snake",
  },
  "gettext-po": {
    file: "locales/en/LC_MESSAGES/messages.po",
    placeholder: "%(amount)s",
    keys: "dotted",
  },
  ini: { file: "locales/en.ini", placeholder: "{amount}", keys: "dotted" },
  resx: { file: "Resources/Strings.resx", placeholder: "{0}", keys: "dotted" },
};

function snake(segment) {
  return segment.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function capitalized(segment) {
  return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
}

const KEY_STYLES = {
  dotted: (path) => path.join("."),
  snake: (path) => path.map(snake).join("_"),
  camel: ([first = "", ...rest]) => [first, ...rest.map(capitalized)].join(""),
};

export function sampleEntries(format) {
  const spec = FORMAT_SAMPLE_SPECS[format];
  return SAMPLE_SOURCE.map(({ path, value }) => ({
    key: KEY_STYLES[spec.keys](path),
    value: value.replace(SAMPLE_SOURCE_PLACEHOLDER, spec.placeholder),
  }));
}

function xliffSkeleton(keys) {
  const units = keys.map(
    (key) => `      <trans-unit id="${key}">\n        <source></source>\n      </trans-unit>\n`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n',
    `  <file source-language="${SAMPLE_SOURCE_LOCALE}" datatype="plaintext" original="messages">\n`,
    "    <body>\n",
    ...units,
    "    </body>\n",
    "  </file>\n",
    "</xliff>\n",
  ].join("");
}

function xcstringsSkeleton(keys) {
  const strings = Object.fromEntries(keys.map((key) => [key, {}]));
  return `${JSON.stringify({ sourceLanguage: SAMPLE_SOURCE_LOCALE, strings, version: "1.0" }, null, 2)}\n`;
}

const SKELETONS = { xliff: xliffSkeleton, "apple-xcstrings": xcstringsSkeleton };

export function sampleSkeleton(format, keys) {
  return SKELETONS[format]?.(keys);
}

function missing(path) {
  return Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: "ENOENT" });
}

export function memoryAdapterFs(files) {
  return {
    async readBounded(path, maxBytes) {
      const content = files.get(path);
      if (content === undefined) throw missing(path);
      if (Buffer.byteLength(content, "utf8") > maxBytes) return { kind: "too-large" };
      return { kind: "ok", content };
    },
    async writeFileAtomic(path, data) {
      files.set(path, data);
    },
  };
}
