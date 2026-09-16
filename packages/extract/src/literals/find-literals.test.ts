// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { describe, expect, it } from "vitest";
import { I18NEXT_TRANSLATION_ELEMENTS } from "../i18next/i18next-extractor.js";
import { createI18nextLiteralRules } from "../i18next/i18next-literal-rules.js";
import { findLiterals } from "./find-literals.js";

const rules = createI18nextLiteralRules();

const CONTROL = '\nconst shown = "Visible prose text";';

function texts(source: string, markup = true): readonly string[] {
  return findLiterals(source, rules, markup).found.map((literal) => literal.text);
}

function onlyControl(source: string, markup = true): void {
  expect(texts(`${source}${CONTROL}`, markup)).toEqual(["Visible prose text"]);
}

describe("findLiterals: where a finding points", () => {
  it("reports a code literal at the line and column of its opening quote", () => {
    expect(findLiterals('\n  const a = "Welcome back, friend";', rules, false).found).toEqual([
      { text: "Welcome back, friend", line: 2, column: 13 },
    ]);
  });

  it("reports JSX text at the line and column of its first character", () => {
    expect(
      findLiterals("const a = (\n  <p>\n    Hello world\n  </p>\n);", rules, true).found,
    ).toEqual([{ text: "Hello world", line: 3, column: 5 }]);
  });

  it("reports a JSX attribute value at its opening quote", () => {
    expect(findLiterals('(<img alt="Company logo" />)', rules, true).found).toEqual([
      { text: "Company logo", line: 1, column: 11 },
    ]);
  });

  it("reports a literal inside a template expression at its real position", () => {
    expect(findLiterals('x = `a ${f("Hello there friend")}`', rules, false).found).toEqual([
      { text: "Hello there friend", line: 1, column: 12 },
    ]);
  });

  it("decodes character references in JSX text and attribute values", () => {
    expect(texts('(<p title="Rock &amp; roll">Tom &amp; Jerry &#8594; &lt;3</p>)')).toEqual([
      "Rock & roll",
      "Tom & Jerry \u2192 <3",
    ]);
  });

  it("keeps a character reference in a code string as written", () => {
    expect(texts('const a = "Tom &amp; Jerry";', false)).toEqual(["Tom &amp; Jerry"]);
  });

  it("collapses whitespace inside the reported text", () => {
    expect(texts("(<p>Hello\n      world</p>)")).toEqual(["Hello world"]);
  });
});

describe("findLiterals: a literal passed to a recognised translation call", () => {
  it.each([
    ["a bare t call", 't("Hello there friend")'],
    ["a default value argument", 'i18n.t("greeting", "Hello there friend")'],
    ["an options default value", 't("greeting", { defaultValue: "Hello there friend" })'],
    ["an optional call", 't?.("Hello there friend")'],
    ["a type-argument call", 't<string>("Hello there friend")'],
    ["the $t spelling", '$t("Hello there friend")'],
    ["a call inside JSX", '(<p title={t("Hello there friend")}>{t("Hello there friend")}</p>)'],
    [
      "the Trans component",
      '(<Trans i18nKey="x" defaults="Hello there">Hello there friend</Trans>)',
    ],
  ])("is never reported: %s", (_label, source) => {
    onlyControl(source);
  });
});

describe("findLiterals: text inside an i18next translation element", () => {
  it.each(I18NEXT_TRANSLATION_ELEMENTS)("is never reported inside <%s>", (name) => {
    onlyControl(`(<${name} title="Hello there friend">Hello there friend</${name}>)`);
  });
});

describe("findLiterals: a renamed translation function", () => {
  it("does not report a literal passed to t renamed out of useTranslation", () => {
    onlyControl('const { t: translate } = useTranslation("common");\ntranslate("Hello world");');
    onlyControl('const { t: tr, i18n: { language } } = useTranslation();\ntr("Hello world");');
    onlyControl(
      'const { i18n, t: tr, ready } = useTranslation();\nconst a = <p title={tr("Hello world")}>{tr("Hello world")}</p>;',
    );
  });

  it("applies a rename from its declaration to the end of the enclosing block", () => {
    onlyControl(
      [
        "function One() {",
        '  const { t: translate } = useTranslation("common");',
        "  if (ready) {",
        '    translate("Hello world");',
        "  }",
        '  return <p title={translate("Hello world")}>{translate("Hello world")}</p>;',
        "}",
      ].join("\n"),
    );
    onlyControl(
      'const { t: translate } = useTranslation();\nfunction f() { translate("Hello world"); }',
    );
  });

  it("does not apply a rename outside its block or before its declaration", () => {
    expect(
      texts(
        [
          "function One() {",
          '  translate("Used before the rename");',
          "  const { t: translate } = useTranslation();",
          '  return translate("Hello world");',
          "}",
          "function Two() {",
          '  return translate("Local helper copy");',
          "}",
        ].join("\n"),
        false,
      ),
    ).toEqual(["Used before the rename", "Local helper copy"]);
  });

  it("still reports a literal passed to a name renamed out of something else", () => {
    expect(
      texts('const { t: translate } = useSomethingElse();\ntranslate("Hello world");', false),
    ).toEqual(["Hello world"]);
    expect(
      texts('const { x: translate } = useTranslation();\ntranslate("Hello world");', false),
    ).toEqual(["Hello world"]);
    expect(
      texts('const o = { t: translate };\ntranslate("Hello world");\nf({ t: g', false),
    ).toEqual(["Hello world"]);
  });
});

describe("findLiterals: non-user-facing literals are not reported", () => {
  it("skips a literal used as an object key", () => {
    onlyControl('const a = { "Hello there friend": 1, b: 2 };\nobj["Hello there friend"];');
    onlyControl('if ("Hello there friend" in obj) {}');
  });

  it("skips an import specifier", () => {
    onlyControl('import a from "some module name";\nimport "side effect module";');
    onlyControl('export * from "some module name";\nconst b = require("some module name");');
    onlyControl('const c = await import("some module name");');
  });

  it("skips a className value", () => {
    onlyControl('(<div className="Primary action button">{x}</div>)');
    onlyControl('const a = { className: "Hero title large" };');
    onlyControl('(<div className={cn("Hero title", ok && "Large text")}>{x}</div>)');
  });

  it("skips a CSS value", () => {
    onlyControl('(<p style={{ fontFamily: "Open Sans" }}>{x}</p>)');
    onlyControl('const a = "flex items-center gap-2";');
    onlyControl('const b = { style: { font: "Open Sans" } };');
  });

  it("skips a test id or data attribute", () => {
    onlyControl('(<button data-testid="submit form button">{x}</button>)');
    onlyControl('(<span data-tooltip="Hover for more">{x}</span>)');
    onlyControl('screen.getByTestId("submit form button");');
  });

  it("skips a URL", () => {
    onlyControl('(<a title="https://example.com/help">https://example.com/help</a>)');
    onlyControl('const a = { title: "mailto:help@example.com" };');
  });

  it("skips a literal in a type position", () => {
    onlyControl('type Variant = "primary button" | "secondary button";', false);
    onlyControl('interface Props { title: "Hello there"; }', false);
    onlyControl('function f(a: "Hello there", b?: "Bye for now"): "All done" {}', false);
    onlyControl('const a = b as "Hello there";\nconst c: "Hello there" = d;', false);
    onlyControl('const e = useState<"Hello there">();', false);
  });

  it("skips logging, errors, comparisons, case labels, tagged templates, and directives", () => {
    onlyControl('console.log("Starting the app now");\nlogger.info("Server is up");');
    onlyControl('throw new Error("Something went wrong");');
    onlyControl('const e = new ValidationError("bad input value");');
    onlyControl('throw new errors.HttpError("bad gateway response");');
    onlyControl('if (a === "Hello there" || "Bye now" !== b) {}');
    onlyControl('switch (a) { case "Hello there": break; }');
    onlyControl("const q = sql`select all rows`;");
    onlyControl('"use client";');
  });

  it("skips a single word outside JSX and a template carrying an expression", () => {
    onlyControl('const a = "Save";\nconst b = `Hello ${name} there`;');
  });

  it("skips text inside script, style, and code elements", () => {
    onlyControl("(<div><code>npm install things</code><style>body a {}</style></div>)");
  });
});

describe("findLiterals: noisy non-user-facing positions are not reported", () => {
  it.each([
    "aria-controls",
    "aria-describedby",
    "aria-labelledby",
    "aria-owns",
    "aria-flowto",
    "aria-activedescendant",
    "allow",
    "sandbox",
    "referrerPolicy",
    "crossOrigin",
    "autoComplete",
    "inputMode",
    "enterKeyHint",
    "rel",
    "as",
  ])("skips the value of the %s attribute", (name) => {
    onlyControl(`(<iframe ${name}="first second third">{x}</iframe>)`);
  });

  it.each([
    ["a zod describe call", 'z.string().describe("The user email address");'],
    ["a query call", 'db.query("SELECT id, name FROM users");'],
    ["an execute call", 'db.execute("delete from users");'],
    ["a prepare call", 'db.prepare("select one user");'],
    ["a format call", 'format(d, "MMM d, yyyy");'],
    ["a parse call", 'parse(value, "dd MM yyyy", new Date());'],
    ["a z.enum call", 'const Theme = z.enum(["draft", "in review"]);'],
  ])("skips a direct string argument of %s", (_label, source) => {
    onlyControl(source, false);
  });

  it.each([
    [
      "a callback passed to query",
      'publicProcedure.query(async () => ({ message: "Your plan was upgraded" }));',
      "Your plan was upgraded",
    ],
    ["JSX returned to execute", "execute(() => <p>Saved your changes</p>);", "Saved your changes"],
    [
      "a callback in an object passed to parse",
      'parse(input, { onError: () => toast("Could not read the file") });',
      "Could not read the file",
    ],
    [
      "an array nested in a z.enum argument",
      'z.enum(pick([["Light mode", "Dark mode"]]));',
      "Light mode",
    ],
    [
      "a string after an operator in a describe argument",
      'z.string().describe(prefix + "The user email address");',
      "The user email address",
    ],
  ])("still reports a literal nested in %s", (_label, source, text) => {
    expect(texts(source)).toContain(text);
  });

  it.each([
    ["an as const assertion", 'parse(input, "dd MM yyyy" as const);'],
    ["a satisfies clause", 'query("select all users" satisfies Sql);'],
    [
      "an assertion to a generic type",
      'format(d, "MMM d, yyyy" as Format<Map<string, [number]>>, opts);',
    ],
  ])("skips a direct argument followed by %s", (_label, source) => {
    onlyControl(source, false);
  });

  it("still reports a direct argument that is only part of an expression", () => {
    expect(
      texts(
        'format("Welcome back to the app " + name);\nquery(`id`, "Select a user to continue" + suffix);\nsocket.emit("Your session has ended " + reason);',
        false,
      ),
    ).toEqual(["Welcome back to the app", "Select a user to continue", "Your session has ended"]);
  });

  it("still reports the values of an object passed to format", () => {
    expect(
      texts('intl.format({ one: "One item left", other: "Many items left" });', false),
    ).toEqual(["One item left", "Many items left"]);
  });

  it.each([
    ["a setItem call", 'localStorage.setItem("user settings", "dark mode on");'],
    ["a getItem call", 'sessionStorage.getItem("user settings");'],
    ["a removeItem call", 'localStorage.removeItem("user settings");'],
  ])("skips every string argument of %s", (_label, source) => {
    onlyControl(source, false);
  });

  it.each([
    ["a member get call", 'cookies().get("session token name");'],
    ["a member set call", 'cookies().set("session token name", token);'],
    ["an on call", 'socket.on("user joined room", handler);'],
    ["an off call", 'socket.off("user joined room", handler);'],
    ["a once call", 'socket.once("user joined room", handler);'],
    ["an emit call", 'socket.emit("user joined room");'],
    ["an addEventListener call", 'window.addEventListener("before print now", handler);'],
  ])("skips the first string argument of %s", (_label, source) => {
    onlyControl(source, false);
  });

  it("still reports a later string argument of an event call", () => {
    expect(texts('socket.emit("user joined room", "Welcome to the room");', false)).toEqual([
      "Welcome to the room",
    ]);
  });

  it("reports a literal followed by as or satisfies, which is a value", () => {
    expect(
      texts(
        'const TITLE = "Welcome to verbatra" as const;\nconst b = "Hello there friend" satisfies Greeting;',
        false,
      ),
    ).toEqual(["Welcome to verbatra", "Hello there friend"]);
  });

  it("skips a literal after as or satisfies, which is a type", () => {
    onlyControl('const a = x as "Hello there" | "Bye for now";', false);
    onlyControl('const b = y satisfies "Hello there" | "Bye for now";', false);
  });

  it("still reports toast copy, alt, placeholder, JSX text, and a label value", () => {
    expect(
      texts(
        'toast("Saved successfully");\nconst a = <img alt="Company logo" />;\nconst b = <input placeholder="Your email" />;\nconst c = <p>Hello world</p>;\nconst d = { label: "Save changes" };',
      ),
    ).toEqual(["Saved successfully", "Company logo", "Your email", "Hello world", "Save changes"]);
  });
});

describe("findLiterals: a literal with no letters", () => {
  it.each([
    ["punctuation", '"...!?"'],
    ["whitespace", '"   "'],
    ["a number", '"42 000"'],
    ["an emoji", '"\u{1F600} \u{1F389}"'],
    ["a single symbol", '"→"'],
  ])("is not reported: %s", (_label, literal) => {
    onlyControl(`(<p title=${literal}>{${literal}}</p>);\nconst a = ${literal};`);
  });

  it("is not reported for JSX text made of numbers, symbols, or entities", () => {
    onlyControl("(<p>42 % | &nbsp; &#8594;</p>)");
  });
});

describe("findLiterals: what is reported", () => {
  it("reports a single word of JSX text and a user-facing attribute", () => {
    expect(texts('(<button title="Close">Save</button>)')).toEqual(["Close", "Save"]);
  });

  it("reports a string rendered directly as a JSX child", () => {
    expect(texts('(<p>{ok ? "Saved" : "Failed"}</p>)')).toEqual(["Saved", "Failed"]);
  });

  it("reports prose passed to another attribute but not a single-word option", () => {
    expect(texts('(<Card heading="Welcome back" variant="primary" kind="compact" />)')).toEqual([
      "Welcome back",
    ]);
  });

  it("reports prose in an object value, a return, and a ternary alternate", () => {
    expect(
      texts(
        'const a = { title: "Welcome back" };\nfunction f() { return "All done now"; }\nconst b = cond ? d : "Not yet ready";',
        false,
      ),
    ).toEqual(["Welcome back", "All done now", "Not yet ready"]);
  });

  it.each([
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "EvalError",
    "URIError",
  ])("skips the message of a bare %s call without new", (name) => {
    onlyControl(`throw ${name}("Something went wrong here");`, false);
    onlyControl(`const e = ${name}("Something went wrong", { cause: err });`, false);
  });

  it("skips the message of a bare AggregateError call", () => {
    onlyControl('throw AggregateError(errors, "Several requests failed");', false);
  });

  it("still reports copy nested inside a bare built-in error call or a member Error call", () => {
    expect(
      texts(
        'throw Error(toast("Your changes were not saved"));\nerrors.Error("Please try again later");',
        false,
      ),
    ).toEqual(["Your changes were not saved", "Please try again later"]);
  });

  it("reports a message passed to a function whose name ends in Error", () => {
    expect(
      texts(
        'setError("email", { message: "Invalid email address" });\nshowError("Failed to save your changes");',
        false,
      ),
    ).toEqual(["Invalid email address", "Failed to save your changes"]);
  });

  it("reports JSX text inside a mapped child element", () => {
    expect(texts("(<ul>{items.map((item) => <li key={item}>Remove item</li>)}</ul>)")).toEqual([
      "Remove item",
    ]);
  });

  it("does not read a type assertion as markup when markup is off", () => {
    expect(texts('const a = <string>b;\nconst c = "Visible prose text";', false)).toEqual([
      "Visible prose text",
    ]);
  });
});

describe("findLiterals: a generic function type in a markup file", () => {
  it.each([
    ["a type alias", "type Fn = <T>(x: T) => T;"],
    ["an interface member", "interface I { m: <T>(x: T) => T }"],
    ["a parameter annotation", "function f(cb: <T>(x: T) => void) {}"],
    ["a variable annotation", "const g: <T>(x: T) => T = (x) => x;"],
    ["a constructor type", "type Ctor = new <T>(x: T) => T;"],
    ["a parenthesized union member", "type U = string | (<T>(x: T) => T);"],
    ["a const type parameter", "type Fn = <const T>(x: T) => T;"],
    ["a const type parameter with a default", 'const f = <const T = "a">(x: T) => x;'],
    [
      "a constrained const type parameter with an object default",
      "const g = <const T extends object = {}>(x: T) => x;",
    ],
    [
      "a constrained const type parameter with a string default",
      'const h = <const T extends string = "a">(x: T) => x;',
    ],
    [
      "a const type parameter in a parameter type",
      'const k = (cb: <const T extends string = "a">(x: T) => T) => cb;',
    ],
    ["a returned const type parameter", "function r() { return <const T = {}>(x: T) => x; }"],
    [
      "const type parameters in both ternary branches",
      "const s = ok ? <const T = {}>(x: T) => x : <const U = {}>(y: U) => y;",
    ],
    [
      "several type parameters with nested defaults",
      "const m = <K extends keyof Map<string, [number, () => void]>, V = { a: '>' }>(k: K, v: V) => v;",
    ],
  ])("keeps reading markup after %s", (_label, construct) => {
    const result = findLiterals(
      `const a = <p>Before the type</p>;\n${construct}\nconst b = <p>After the type</p>;`,
      rules,
      true,
    );

    expect(result.truncated).toBe(false);
    expect(result.found.map((literal) => literal.text)).toEqual([
      "Before the type",
      "After the type",
    ]);
  });

  it("keeps reading markup after several generic function types in a row", () => {
    const result = findLiterals(
      "type A = <T>(x: T) => T;\ntype B = <T>(x: T) => T;\nconst c = <p>After both types</p>;",
      rules,
      true,
    );

    expect(result.truncated).toBe(false);
    expect(result.found.map((literal) => literal.text)).toEqual(["After both types"]);
  });

  it("reads an element whose type arguments are longer than any fixed budget", () => {
    const type = `{ ${Array.from({ length: 12 }, (_, index) => `field${index}: string;`).join(" ")} }`;
    const result = findLiterals(
      `const a = (\n  <Table<${type}> rows={rows}>\n    Paths like src/* are matched\n  </Table>\n);\nconst b = <Foo<${type}> x="1">Hi</Foo>;`,
      rules,
      true,
    );

    expect(type.length).toBeGreaterThan(136);
    expect(result.truncated).toBe(false);
    expect(result.found.map((literal) => literal.text)).toEqual([
      "Paths like src/* are matched",
      "Hi",
    ]);
  });

  it("reads an element that carries type arguments", () => {
    const result = findLiterals(
      "const a = <p>Before the list</p>;\nconst l = <List<Item> items={x}>List text</List>;\nconst b = <p>After the list</p>;",
      rules,
      true,
    );

    expect(result.truncated).toBe(false);
    expect(result.found.map((literal) => literal.text)).toEqual([
      "Before the list",
      "List text",
      "After the list",
    ]);
  });

  it("reads a generic function type inside a braced attribute value", () => {
    const result = findLiterals(
      "const a = <Comp render={(cb: <T>(x: T) => T) => null}>Inside text</Comp>;",
      rules,
      true,
    );

    expect(result.truncated).toBe(false);
    expect(result.found.map((literal) => literal.text)).toEqual(["Inside text"]);
  });
});

describe("findLiterals: inline suppression", () => {
  it("suppresses the next line with a line comment and keeps it accounted for", () => {
    const result = findLiterals(
      '// verbatra-ignore-next-line\nconst a = "Hidden prose text";\nconst b = "Visible prose text";',
      rules,
      false,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Visible prose text"]);
    expect(result.suppressed).toEqual([{ text: "Hidden prose text", line: 2, column: 11 }]);
  });

  it("suppresses JSX text with a block comment in a JSX expression", () => {
    const result = findLiterals(
      "(<div>\n  {/* verbatra-ignore-next-line */}\n  <p>Hidden</p>\n  <p>Shown</p>\n</div>)",
      rules,
      true,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Shown"]);
    expect(result.suppressed.map((literal) => literal.text)).toEqual(["Hidden"]);
  });

  it("suppresses only what starts on the next line, not the children on later lines", () => {
    const result = findLiterals(
      [
        "const a = (",
        "  <div>",
        "    {/* verbatra-ignore-next-line */}",
        '    <p title="Hidden title">',
        "      Shown across lines",
        "      <b>Also shown</b>",
        "    </p>",
        "    <p>",
        "      Shown text",
        "    </p>",
        "  </div>",
        ");",
      ].join("\n"),
      rules,
      true,
    );

    expect(result.found.map((literal) => literal.text)).toEqual([
      "Shown across lines",
      "Also shown",
      "Shown text",
    ]);
    expect(result.suppressed.map((literal) => literal.text)).toEqual(["Hidden title"]);
  });

  it("does not suppress the text of an element nested below a wrapping element", () => {
    const result = findLiterals(
      [
        "export function Page() {",
        "  return (",
        "    // verbatra-ignore-next-line",
        '    <div className="page">',
        "      <h1>Title copy here</h1>",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
      rules,
      true,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Title copy here"]);
    expect(result.suppressed).toEqual([]);
  });

  it("suppresses every attribute of an opening tag that starts on the next line", () => {
    const result = findLiterals(
      [
        "const a = (",
        "  <div>",
        "    {/* verbatra-ignore-next-line */}",
        "    <p",
        '      title="Hover text"',
        '      aria-label={open ? "Close the dialog" : "Open the dialog"}',
        '      placeholder=<Hint label="Type here please" />',
        "    >",
        "      Shown body text",
        "    </p>",
        "  </div>",
        ");",
      ].join("\n"),
      rules,
      true,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Shown body text"]);
    expect(result.suppressed.map((literal) => literal.text)).toEqual([
      "Hover text",
      "Close the dialog",
      "Open the dialog",
      "Type here please",
    ]);
  });

  it("targets the next line that holds code, skipping comment-only lines", () => {
    const result = findLiterals(
      '// verbatra-ignore-next-line\n// a note about the copy\n/* another note */\nconst a = "Hidden prose text";\nconst b = "Visible prose text";',
      rules,
      false,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Visible prose text"]);
    expect(result.suppressed.map((literal) => literal.text)).toEqual(["Hidden prose text"]);
  });

  it("skips blank lines between the directive and what it suppresses", () => {
    const result = findLiterals(
      '// verbatra-ignore-next-line\n\n  \nconst a = "Hidden prose text";\nconst b = "Visible prose text";',
      rules,
      false,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Visible prose text"]);
    expect(result.suppressed.map((literal) => literal.text)).toEqual(["Hidden prose text"]);
  });

  it("does not stretch a next-line directive over an element that starts later", () => {
    const result = findLiterals(
      "// verbatra-ignore-next-line\nconst a = (\n  <p>Shown text</p>\n);\n// verbatra-ignore-next-line",
      rules,
      true,
    );

    expect(result.found.map((literal) => literal.text)).toEqual(["Shown text"]);
    expect(result.suppressed).toEqual([]);
  });

  it("suppresses the same line with a trailing comment", () => {
    const result = findLiterals(
      'const a = "Hidden prose text"; // verbatra-ignore-line',
      rules,
      false,
    );

    expect(result.found).toEqual([]);
    expect(result.suppressed.map((literal) => literal.text)).toEqual(["Hidden prose text"]);
  });

  it("does not treat a longer directive name as a suppression", () => {
    expect(
      texts('// verbatra-ignore-next-line-please\nconst a = "Visible prose text";', false),
    ).toEqual(["Visible prose text"]);
  });
});

describe("findLiterals: an element used as an attribute value", () => {
  it("reads the element and keeps reading the children after it", () => {
    const result = findLiterals('<Foo icon=<Bar /> label="Close">Inner copy</Foo>;', rules, true);

    expect(result.truncated).toBe(false);
    expect(result.found.map((literal) => literal.text)).toEqual(["Close", "Inner copy"]);
  });
});

describe("findLiterals: markup that never closes", () => {
  it("reports the file as unreadable and still reports what comes after the break", () => {
    const result = findLiterals(
      'const a = "Visible prose text";\nexport function Page() {\n  return <div><span>Mid edit copy</div>;\n}\nconst b = "Shown after the break";',
      rules,
      true,
    );

    expect(result.truncated).toBe(true);
    expect(result.found.map((literal) => literal.text)).toEqual([
      "Visible prose text",
      "Shown after the break",
    ]);
  });
});

describe("findLiterals: a file it cannot read to the end", () => {
  it("reports the file as truncated and keeps what it found before the break", () => {
    const result = findLiterals('const a = "Visible prose text";\n(<p>{`Never closed', rules, true);

    expect(result.truncated).toBe(true);
    expect(result.found.map((literal) => literal.text)).toEqual(["Visible prose text"]);
  });
});
