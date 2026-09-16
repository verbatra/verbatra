// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { describe, expect, it } from "vitest";
import type { KeyUsage } from "../extractor.js";
import { createI18nextExtractor, I18NEXT_TRANSLATION_ELEMENTS } from "./i18next-extractor.js";

const extractor = createI18nextExtractor();

function usage(content: string): KeyUsage {
  const result = extractor.extract({ path: "app.tsx", content }).usage;
  if (result === undefined) {
    throw new Error("the i18next extractor always reports its key usage");
  }
  return result;
}

function referenced(content: string): readonly string[] {
  return usage(content).references.map((site) => site.key);
}

describe("i18next key usage: static references", () => {
  it("references every static call key with its line", () => {
    expect(usage('t("nav.home");\n$t("nav.away");').references).toEqual([
      { key: "nav.home", line: 1 },
      { key: "nav.away", line: 2 },
    ]);
  });

  it("references a namespace-qualified key both as written and without its namespace", () => {
    expect(referenced('t("common:nav.home")')).toEqual(["common:nav.home", "nav.home"]);
  });

  it("references natural-language keys as written, stripping the namespace separator", () => {
    expect(referenced('t("Loading...");\nt("Error: failed")')).toEqual([
      "Loading...",
      "Error: failed",
      " failed",
    ]);
  });

  it("keeps namespace-qualified and natural-language keys out of the extracted calls", () => {
    const result = extractor.extract({
      path: "app.ts",
      content: 't("common:nav.home");\nt("Loading...")',
    });

    expect(result.calls).toEqual([]);
    expect(result.dynamic).toEqual([{ line: 1 }, { line: 2 }]);
    expect(result.usage?.dynamic).toEqual([]);
  });

  it("reports a file without key sites as an empty usage", () => {
    expect(usage("export const x = 1;")).toEqual({
      references: [],
      dynamic: [],
      prefixes: [],
      unresolved: [],
    });
  });
});

describe("i18next key usage: key prefixes", () => {
  it("prefixes every static key in the file with a getFixedT key prefix, keeping the key", () => {
    expect(referenced('const t = i18n.getFixedT("en", "translation", "nav");\nt("home");')).toEqual(
      ["home", "nav.home"],
    );
  });

  it("prefixes with a useTranslation keyPrefix option", () => {
    expect(
      referenced('const { t } = useTranslation("translation", { keyPrefix: "nav" });\nt("home");'),
    ).toEqual(["home", "nav.home"]);
  });

  it("prefixes with a keyPrefix property on any object literal, quoted or not", () => {
    expect(referenced('const o = { "keyPrefix": "nav", ns: "x" };\nt("home");')).toEqual([
      "home",
      "nav.home",
    ]);
  });

  it("prefixes with a keyPrefix attribute, as a string or an expression container", () => {
    expect(referenced('<Translation keyPrefix="nav">{(t) => t("home")}</Translation>')).toEqual([
      "home",
      "nav.home",
    ]);
    expect(referenced('<Translation keyPrefix={"nav"}>{(t) => t("home")}</Translation>')).toEqual([
      "home",
      "nav.home",
    ]);
  });

  it("prefixes a Trans key and a namespace-stripped key too", () => {
    expect(
      referenced('const o = { keyPrefix: "nav" };\n<Trans i18nKey="home" />;\nt("ns:away")'),
    ).toEqual(["home", "ns:away", "away", "nav.home", "nav.ns:away", "nav.away"]);
  });

  it("prefixes a template-literal head", () => {
    expect(usage('const o = { keyPrefix: "nav" };\nt(`item.${id}`)').prefixes).toEqual([
      { prefix: "item.", line: 2 },
      { prefix: "nav.item.", line: 2 },
    ]);
  });

  it("reports a non-literal keyPrefix option as unresolved", () => {
    expect(usage('useTranslation("ns", { keyPrefix: prefix });').unresolved).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
  });

  it("reports a shorthand keyPrefix property and a non-literal attribute as unresolved", () => {
    expect(usage('useTranslation("ns", { keyPrefix });').unresolved).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
    expect(usage("<Translation keyPrefix={prefix}>{render}</Translation>").unresolved).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
  });

  it("reports a non-literal getFixedT prefix as unresolved, but not a null or absent one", () => {
    expect(usage('getFixedT("en", "ns", prefix);').unresolved).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
    expect(usage('getFixedT("en", "ns", undefined);\ngetFixedT(null, null);').unresolved).toEqual(
      [],
    );
  });

  it("ignores an identifier merely named keyPrefix", () => {
    expect(
      usage(
        'const keyPrefix = "nav";\nlog(keyPrefix);\nconst { keyPrefix: p } = props;\nconst { keyPrefix } = props;',
      ).unresolved,
    ).toEqual([]);
    expect(referenced('const keyPrefix = "nav";\nt("home")')).toEqual(["home"]);
    expect(usage("interface Props {\n  keyPrefix: string;\n}").unresolved).toEqual([]);
  });
});

describe("i18next key usage: Trans", () => {
  it("names the translation elements it knows", () => {
    expect(I18NEXT_TRANSLATION_ELEMENTS).toEqual(["Trans", "Translation"]);
  });

  it("references a static i18nKey attribute or property", () => {
    expect(
      referenced(
        '<Trans i18nKey="nav.home">Home</Trans>;\n<Trans i18nKey={"nav.away"} />;\nconst p = { i18nKey: "nav.back" };',
      ),
    ).toEqual(["nav.home", "nav.away", "nav.back"]);
    expect(usage('<Trans i18nKey="nav.home">Home</Trans>').unresolved).toEqual([]);
  });

  it("reports a Trans element without a static i18nKey as unresolved", () => {
    expect(
      usage("<Trans>Hello</Trans>;\n<Trans i18nKey={key} />;\n<Trans {...props}\n/>").unresolved,
    ).toEqual([
      { reason: "trans-without-key", line: 1 },
      { reason: "trans-without-key", line: 2 },
      { reason: "trans-without-key", line: 3 },
    ]);
  });

  it("does not treat an import, a type argument, or a Translation element as a keyless Trans", () => {
    expect(
      usage(
        'import { Trans } from "react-i18next";\nconst x = useState<Trans>();\nconst y = a < Trans;\n<Translation>{(t) => t("a")}</Translation>',
      ).unresolved,
    ).toEqual([]);
  });

  it("ignores an i18nKey that is not followed by a static value", () => {
    expect(referenced("const k = i18nKey;\nconst o = { i18nKey: `a.${b}` };")).toEqual([]);
  });

  it("reads an arrow function inside an attribute without ending the element early", () => {
    expect(
      usage('<Trans components={{ b: <b /> }} values={(x) => x} i18nKey="a" />').unresolved,
    ).toEqual([]);
  });

  it("stops at an element that never closes", () => {
    expect(usage("<Trans").unresolved).toEqual([{ reason: "trans-without-key", line: 1 }]);
  });
});

describe("i18next key usage: template-literal keys", () => {
  it("reports a template key with a static head as a prefix, not as dynamic", () => {
    const result = usage("t(`nav.${page}`, { count })");

    expect(result.prefixes).toEqual([{ prefix: "nav.", line: 1 }]);
    expect(result.dynamic).toEqual([]);
  });

  it("reports a namespace-qualified head with and without the namespace", () => {
    expect(usage("t(`common:nav.${page}`)").prefixes).toEqual([
      { prefix: "common:nav.", line: 1 },
      { prefix: "nav.", line: 1 },
    ]);
  });

  it("keeps a template with no static head, or with more after it, fully dynamic", () => {
    expect(usage("t(`${page}.title`);\nt(`nav.${page}` + suffix);\nt(key)").dynamic).toEqual([
      { line: 1 },
      { line: 2 },
      { line: 3 },
    ]);
  });

  it("still reports the template key as dynamic to the extracted result", () => {
    expect(extractor.extract({ path: "a.ts", content: "t(`nav.${page}`)" }).dynamic).toEqual([
      { line: 1 },
    ]);
  });
});

describe("i18next key usage: aliases of the translate function", () => {
  it("follows a destructured t alias from useTranslation", () => {
    const result = usage('const { t: translate, i18n } = useTranslation();\ntranslate("a");');

    expect(result.references).toEqual([{ key: "a", line: 2 }]);
  });

  it("follows the first element of an array destructured from useTranslation", () => {
    expect(referenced('const [translate] = useTranslation("ns");\ntranslate("a");')).toEqual(["a"]);
  });

  it("follows a variable holding t, a member t, a bound t, or a fixed t", () => {
    expect(
      referenced(
        'const a = t;\nlet b = i18n.t;\nvar c = i18next.t.bind(i18next);\nconst d = i18n.getFixedT("de")\na("1"); b("2"); c("3"); d("4");',
      ),
    ).toEqual(["1", "2", "3", "4"]);
  });

  it("reports an alias's dynamic call and template-head call", () => {
    const result = usage("const tr = t;\ntr(key);\ntr(`nav.${x}`)");

    expect(result.dynamic).toEqual([{ line: 2 }]);
    expect(result.prefixes).toEqual([{ prefix: "nav.", line: 3 }]);
  });

  it("keeps alias calls out of the extracted calls", () => {
    expect(extractor.extract({ path: "a.ts", content: 'const tr = t;\ntr("a")' }).calls).toEqual(
      [],
    );
  });

  it("reports an assignment of t to anything but a plain variable as unresolved", () => {
    expect(
      usage("this.tr = t;\nconst x: TFunction = i18n.t;\n[a] = [t];\nobj.fn = t.bind(i18n)")
        .unresolved,
    ).toEqual([
      { reason: "aliased-translate-function", line: 1 },
      { reason: "aliased-translate-function", line: 2 },
      { reason: "translate-function-escapes", line: 3 },
      { reason: "aliased-translate-function", line: 4 },
    ]);
  });

  it("does not mistake a call, a comparison, or a member read for an alias", () => {
    const result = usage(
      'const a = t("x");\nif (b == t) {}\nconst d = t.length;\nconst e = t ?? f;',
    );

    expect(result.unresolved).toEqual([]);
    expect(result.references).toEqual([{ key: "x", line: 1 }]);
  });

  it("does not follow a t property whose value is not a plain name", () => {
    expect(referenced('const o = { t: 1 };\nconst { t: { deep } } = x;\nt("a")')).toEqual(["a"]);
  });
});

describe("i18next key usage at the edges of the source", () => {
  it("treats a namespace-only template head as fully dynamic", () => {
    const result = usage("t(`common:${key}`)");

    expect(result.prefixes).toEqual([]);
    expect(result.dynamic).toEqual([{ line: 1 }]);
  });

  it("reads past nested objects around a non-literal keyPrefix", () => {
    expect(usage('useTranslation("ns", { keyPrefix: p, nested: { a: 1 } });').unresolved).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
  });

  it("reports sites cut off by the end of the file without failing", () => {
    expect(usage("const o = { keyPrefix: p").unresolved).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
    expect(usage('getFixedT("en", "ns", "nav"').unresolved).toEqual([]);
    expect(referenced('const [tr, i18n = useTranslation();\ntr("a")')).toEqual([]);
  });
});

describe("i18next key usage: the translate function escaping the file's view", () => {
  function escapes(content: string) {
    return usage(content).unresolved.filter((site) => site.reason === "translate-function-escapes");
  }

  it.each([
    ["a JSX attribute", "<Child t={t} />"],
    ["a call argument", "renderRow(t);"],
    ["a later call argument", "renderRow(row, t, 1);"],
    ["a shorthand property in a returned object", "return { t };"],
    ["a property value", "const api = { translate: t };"],
    ["a returned value", "return t;"],
    ["an arrow body", "const get = () => t;"],
    ["an array element", "const fns = [format, t];"],
    ["a spread object attribute", "<Child {...{ t }} />"],
    ["a member t passed on", "renderRow(i18n.t);"],
    ["a bound t passed on", "renderRow(t.bind(i18n));"],
    ["an alias passed on", "const { t: tr } = useTranslation();\nrenderRow(tr);"],
    ["an argument beside nested brackets", "renderRow(a(b), t, { c: [1] });"],
    ["an argument to a returned function", "getRenderer()(t);"],
    ["an object inside an array", "const rows = [{ t }, other];"],
  ])("reports t passed on as %s", (_name, content) => {
    expect(escapes(content)).toHaveLength(1);
  });

  it("names the line the translate function escapes on", () => {
    expect(escapes('t("a");\n\nrenderRow(t);')).toEqual([
      { reason: "translate-function-escapes", line: 3 },
    ]);
  });

  it.each([
    ["a direct call", 't("a");'],
    ["a destructured hook result", 'const { t } = useTranslation();\nt("a");'],
    ["a renamed destructured hook result", 'const { t: tr } = useTranslation();\ntr("a");'],
    ["an array destructured hook result", 'const [t, i18n] = useTranslation();\nt("a");'],
    ["an alias binding", 'const tr = i18n.t;\ntr("a");'],
    ["an import", 'import { t } from "./i18n";'],
    ["a function parameter", 'function row(t) {\n  return t("a");\n}'],
    ["an arrow parameter", '<Translation>{(t) => t("a")}</Translation>'],
    ["a destructured parameter", 'function Row({ t }) {\n  return t("a");\n}'],
    ["a typed destructured parameter", 'const Row = ({ t }: Props) => t("a");'],
    ["a condition", 'if (t) {\n  t("a");\n}'],
    ["a typeof check", 'if (typeof t === "function") {}'],
    ["a property named t", "const o = { t: 1 };"],
    ["a keyword condition without braces", 'if (t) run("a");'],
    ["a parenthesized value", "const x = (t);"],
    ["an unbalanced list", "a, t)"],
    ["an unterminated call", "renderRow(t"],
    ["an unterminated object", "const o = { a: t"],
  ])("does not report %s", (_name, content) => {
    expect(escapes(content)).toEqual([]);
  });
});
