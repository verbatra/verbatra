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

function prefixSites(content: string) {
  return usage(content).unresolved.filter((site) => site.reason === "dynamic-key-prefix");
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
    expect(prefixSites('useTranslation("ns", { keyPrefix: prefix });')).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
  });

  it("reports a shorthand keyPrefix property and a non-literal attribute as unresolved", () => {
    expect(prefixSites('useTranslation("ns", { keyPrefix });')).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
    expect(prefixSites("<Translation keyPrefix={prefix}>{render}</Translation>")).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
  });

  it("reports a non-literal getFixedT prefix as unresolved, but not a null or absent one", () => {
    expect(prefixSites('getFixedT("en", "ns", prefix);')).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
    expect(prefixSites('getFixedT("en", "ns", undefined);\ngetFixedT(null, null);')).toEqual([]);
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
      { reason: "translate-function-escapes", line: 1 },
      { reason: "aliased-translate-function", line: 2 },
      { reason: "unrecognised-translate-source", line: 2 },
      { reason: "translate-function-escapes", line: 3 },
      { reason: "aliased-translate-function", line: 4 },
      { reason: "translate-function-escapes", line: 4 },
    ]);
  });

  it("does not mistake a call, a comparison, or a member read for an alias", () => {
    const result = usage(
      'const a = t("x");\nif (b == t) {}\nconst d = t.length;\nconst e = t ?? f;',
    );

    expect(
      result.unresolved.filter((site) => site.reason === "aliased-translate-function"),
    ).toEqual([]);
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
    expect(prefixSites('useTranslation("ns", { keyPrefix: p, nested: { a: 1 } });')).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
  });

  it("reports sites cut off by the end of the file without failing", () => {
    expect(prefixSites("const o = { keyPrefix: p")).toEqual([
      { reason: "dynamic-key-prefix", line: 1 },
    ]);
    expect(prefixSites('getFixedT("en", "ns", "nav"')).toEqual([]);
    expect(referenced('const [tr, i18n = useTranslation();\ntr("a")')).toEqual([]);
  });
});

describe("i18next key usage: translate sources", () => {
  function unrecognised(content: string) {
    return usage(content).unresolved.filter(
      (site) => site.reason === "unrecognised-translate-source",
    );
  }

  it.each([
    ["a destructured hook result", 'const { t } = useTranslation();\nt("a");'],
    [
      "a hook with a namespace and a static prefix",
      'const { t, i18n } = useTranslation("c", { keyPrefix: "nav", lng: x });',
    ],
    ["a hook with a namespace array", 'let { t: tr, ready } = useTranslation(["a", "b"]);'],
    ["an array-destructured hook", 'var [t, i18n] = useTranslation("c");'],
    ["a local fixed t", 'const nt = i18n.getFixedT(null, ["c"], "nav");'],
    ["a bare local fixed t", "const nt = getFixedT(undefined)"],
    ["a direct member call", 'i18n.t("a");\nthis.props.t("b");'],
    ["a local bound member t", "const tr = i18next.t.bind(i18next);"],
    ["a local member t", "const tr = i18n.t;"],
    [
      "R19: a Translation render prop with a bare parameter",
      '<Translation>{t => t("a")}</Translation>',
    ],
    ["a fixed t with a member language", 'const nt = i18n.getFixedT(i18n.language, null, "nav");'],
    ["a fixed t with a named language", 'const nt = i18n.getFixedT(lng, "c");'],
    ["a Translation render prop", '<Translation ns="c">{(t, { i18n }) => t("a")}</Translation>'],
    ["withTranslation around a component", 'export default withTranslation("c")(Page);'],
    ["withTranslation with no namespace", "export default withTranslation()(Page);"],
    [
      "imports of the sources",
      'import { useTranslation, Trans, withTranslation } from "react-i18next";\nimport { t as translate, getFixedT } from "i18next";\nimport type { TFunction } from "i18next";',
    ],
  ])("recognises %s", (_name, content) => {
    expect(unrecognised(content)).toEqual([]);
  });

  it.each([
    ["a returned hook result", 'function useNav() {\n  return useTranslation("c");\n}'],
    ["an exported destructured hook", "export const { t } = useTranslation();"],
    ["hook options passed by name", 'const { t } = useTranslation("c", opts);'],
    ["hook options with a spread", 'const { t } = useTranslation("c", { ...base });'],
    ["hook options with a computed key", 'const { t } = useTranslation("c", { [key]: "nav" });'],
    ["hook options from a call", 'const { t } = useTranslation("c", makeOpts());'],
    ["a non-literal hook prefix", 'const { t } = useTranslation("c", { keyPrefix: p });'],
    ["a dynamic hook namespace", "const { t } = useTranslation(ns);"],
    ["three hook arguments", 'const { t } = useTranslation("c", {}, extra);'],
    ["a hook result destructured with other names", "const { t, other } = useTranslation();"],
    ["a t member read on a hook call", "const t2 = useTranslation().t;"],
    ["a hook call not assigned", "useTranslation();"],
    ["a hook call followed by more", "const { t } = useTranslation() || fallback;"],
    ["an exported fixed t", 'export const t = i18n.getFixedT(null, "c", "nav");'],
    ["a fixed t inside an object", 'const tt = { nav: i18n.getFixedT(null, null, "nav") };'],
    ["a fixed t with a dynamic namespace", "const nt = i18n.getFixedT(null, ns);"],
    ["a fixed t with a dynamic prefix", "const nt = i18n.getFixedT(null, null, prefix);"],
    ["a fixed t with a computed language", "const nt = i18n.getFixedT(pick(lng));"],
    ["a member t not assigned locally", "export default i18next.t.bind(i18next);"],
    ["a member t passed on", "renderRow(i18n.t);"],
    ["an unrelated member named t, an accepted false alarm", "const y = frame.t + 1;"],
    ["an exported member t", "export const tr = i18n.t;"],
    ["a Translation element with no render prop", "<Translation>{children}</Translation>"],
    ["a self-closing Translation element", "<Translation />"],
    ["withTranslation with a dynamic namespace", "withTranslation(ns)(Page);"],
    ["withTranslation not wrapping a component", 'const hoc = withTranslation("c");'],
    ["a renamed hook import", 'import { useTranslation as useT } from "react-i18next";'],
  ])("reports %s as an unrecognised source", (_name, content) => {
    expect(unrecognised(content)).toHaveLength(1);
  });

  it("names the line of an unrecognised source", () => {
    expect(unrecognised('t("a");\n\nconst { t } = useTranslation(ns);')).toEqual([
      { reason: "unrecognised-translate-source", line: 3 },
    ]);
  });

  it("follows t imported from i18next under another name as a translate identifier", () => {
    expect(referenced('import { t as translate } from "i18next";\ntranslate("a");')).toEqual(["a"]);
  });

  it("references every element of a static key array, and nothing for a mixed one", () => {
    expect(referenced('t(["a", "common:b"]);\nt(["c", d]);')).toEqual(["a", "common:b", "b"]);
    expect(usage('t(["c", d]);\nt([]);').dynamic).toEqual([{ line: 1 }, { line: 2 }]);
  });
});

describe("i18next key usage: where a translate identifier may appear", () => {
  function escapes(content: string) {
    return usage(`const { t } = useTranslation();\n${content}`).unresolved.filter(
      (site) => site.reason === "translate-function-escapes",
    );
  }

  it.each([
    ["a JSX attribute", "<Child t={t} />;"],
    ["a call argument", "renderRow(t);"],
    ["a shorthand property", "return { t };"],
    ["a property value", "const api = { translate: t };"],
    ["a return value", "return t;"],
    ["an arrow body", "const get = () => t;"],
    ["an array element", "const fns = [format, t];"],
    ["a ternary operand", "const tr = cond ? t : other;"],
    ["a default export", "export default t;"],
    ["an export list", "export { t as default };"],
    ["a member read", "const n = t.length;"],
    ["a bound copy passed on", "renderRow(t.bind(i18n));"],
    ["a condition", "if (t) {}"],
    ["a spread", "<Child {...{ t }} />;"],
    ["a JSX child", "<p>{t}</p>;"],
    ["an attribute on another element", "<Child t={t} i18nKey={t} />;"],
    ["R14: a call argument in a ternary branch", "const x = cond ? renderRow(t) : null;"],
    ["R15: a parenthesized ternary branch", "const x = cond ? (t) : other;"],
    ["R16: a property value in a ternary branch", "const x = cond ? f({ x: t }) : null;"],
    ["a call argument in a nested ternary", "const x = a ? b : c ? renderRow(t) : d;"],
  ])("reports t used as %s", (_name, content) => {
    expect(escapes(content)).toHaveLength(1);
  });

  it("reports an alias escaping and names its line", () => {
    expect(escapes("const tr = t;\nrenderRow(tr);")).toEqual([
      { reason: "translate-function-escapes", line: 3 },
    ]);
  });

  it.each([
    ["a direct call", 't("a");'],
    ["an optional call", 't?.("a");'],
    ["a local alias and its call", 'const tr = t;\ntr("a");'],
    ["a local bound alias", 'const tr = t.bind(i18n);\ntr("a");'],
    ["the t attribute of Trans", '<Trans t={t} i18nKey="a" />;'],
    ["the t attribute of Translation", '<Translation t={t}>{(tt) => tt("a")}</Translation>;'],
    ["a shadowing parameter", 'function row(t) {\n  return t("a");\n}'],
    ["a shadowing destructured parameter", "const Row = ({ t }: Props) => null;"],
    ["a shadowing declaration", "for (const t of items) {}"],
    ["a property key", "const o = { t: 1 };"],
    ["a type annotation", "function f(t: TFunction) {}"],
    ["the tail of a contraction in JSX text", "<p>Don't worry</p>;"],
    [
      "a typed arrow parameter with a return type",
      'const label = (t: TFunction): string => t("a");',
    ],
    ["a function parameter with a return type", 'function label(t): string {\n  return t("a");\n}'],
    [
      "a method parameter with a return type",
      'class X {\n  render(t: TFunction): string {\n    return t("a");\n  }\n}',
    ],
    [
      "an async arrow parameter with a return type",
      'const f = async (t): Promise<string> => t("a");',
    ],
    ["a default-exported arrow with a return type", 'export default (t): string => t("a");'],
    ["an arrow argument with a return type", 'run((t): string => t("a"));'],
    ["an arrow inside a ternary branch", 'const f = cond ? run((t): string => t("a")) : null;'],
    [
      "an object method with a return type",
      'const o = { a: 1, render(t): string {\n  return t("a");\n} };',
    ],
  ])("allows t as %s", (_name, content) => {
    expect(escapes(content)).toEqual([]);
  });

  it("checks t wherever it is bound, even by no recognised source", () => {
    expect(usage("renderRow(t);\nconst x = cond ? t : y;").unresolved).toEqual([
      { reason: "translate-function-escapes", line: 1 },
      { reason: "translate-function-escapes", line: 2 },
    ]);
  });

  it.each([
    [
      "R06: a destructured parameter passed on",
      "function C({ t }) {\n  return <Child translate={t} />;\n}",
    ],
    ["a plain parameter passed on", "function other(t) {\n  return renderRow(t);\n}"],
  ])("reports %s as escaping", (_name, content) => {
    expect(usage(content).unresolved).toEqual([{ reason: "translate-function-escapes", line: 2 }]);
  });

  it.each([
    ["R17: a destructured custom hook", 'const { t } = useNav();\nt("a");'],
    ["a renamed destructured custom hook", 'const { t: tr } = useNav();\ntr("a");'],
    ["an array-destructured custom hook", 'const [t] = useNav();\nt("a");'],
    ["a t declared from a call", 'const t = makeT();\nt("a");'],
    ["a t declared from a member", 'let t = api.translate;\nt("a");'],
    ["a destructured object that is not a parameter", 'const { t } = context;\nt("a");'],
  ])("reports %s as an unrecognised source", (_name, content) => {
    expect(usage(content).unresolved).toEqual([
      { reason: "unrecognised-translate-source", line: 1 },
    ]);
  });

  it.each([
    ["R11: a plain parameter called", 'function other(t) {\n  return t("x");\n}'],
    ["a destructured parameter called", 'function C({ t }) {\n  return t("x");\n}'],
    [
      "t destructured from a props parameter",
      'function Page(props) {\n  const { t } = props;\n  return t("x");\n}',
    ],
    [
      "t destructured from this.props",
      'class Page {\n  render() {\n    const { t } = this.props;\n    return t("x");\n  }\n}',
    ],
    ["a loop binding", "for (const t of items) {}"],
  ])("does not report %s", (_name, content) => {
    expect(usage(content).unresolved).toEqual([]);
  });
});
