import { describe, expect, it } from "vitest";
import { icuStructureChanges } from "./structure.js";

describe("icuStructureChanges", () => {
  it("reports nothing for a plain text change inside a plural arm", () => {
    expect(
      icuStructureChanges(
        "{n, plural, one {# Eintrag} other {# Eintraege}}",
        "{n, plural, one {# Posten} other {# Posten}}",
      ),
    ).toEqual([]);
  });

  it("reports nothing for a value without ICU syntax", () => {
    expect(icuStructureChanges("Hallo X", "Hallo Y")).toEqual([]);
  });

  it("reports a dropped # in one plural arm", () => {
    expect(
      icuStructureChanges("{n, plural, one {# a} other {# b}}", "{n, plural, one {a} other {# b}}"),
    ).toEqual(["-#:>n:one"]);
  });

  it("reports a # moved from one arm to another", () => {
    expect(
      icuStructureChanges("{n, plural, one {# a} other {b}}", "{n, plural, one {a} other {# b}}"),
    ).toEqual(["+#:>n:other", "-#:>n:one"]);
  });

  it("reports an added # and a changed count of #", () => {
    expect(
      icuStructureChanges("{n, plural, one {# a} other {b}}", "{n, plural, one {# #} other {b}}"),
    ).toEqual(["+#:>n:one"]);
  });

  it("scopes a # in a nested plural to the inner plural", () => {
    const source = "{a, plural, other {{b, plural, other {# x}}}}";
    expect(icuStructureChanges(source, "{a, plural, other {# {b, plural, other {x}}}}")).toEqual([
      "+#:>a:other",
      "-#:>a:other>b:other",
    ]);
  });

  it("counts a # inside a tag of the enclosing plural arm", () => {
    const source = "{n, plural, other {<b>#</b> {g, select, m {y} other {x}}}}";
    expect(icuStructureChanges(source, source)).toEqual([]);
    expect(
      icuStructureChanges(source, "{n, plural, other {<b>x</b> {g, select, m {y} other {x}}}}"),
    ).toEqual(["-#:>n:other"]);
  });

  it("does not count a # in a select arm, where the parser reads it as text", () => {
    expect(
      icuStructureChanges(
        "{n, plural, other {{g, select, m {#} other {x}}}}",
        "{n, plural, other {{g, select, m {x} other {x}}}}",
      ),
    ).toEqual([]);
  });

  it("reports a changed skeleton of a number argument", () => {
    const changes = icuStructureChanges(
      "{n, number, ::currency/USD}",
      "{n, number, ::currency/EUR}",
    );
    expect(changes).toEqual(["+number:n:::currency/EUR", "-number:n:::currency/USD"]);
  });

  it("reports a changed style of a date and a time argument", () => {
    expect(icuStructureChanges("{d, date, short}", "{d, date, full}")).toEqual([
      "+date:d:full",
      "-date:d:short",
    ]);
    expect(icuStructureChanges("{t, time, short}", "{t, time, long}")).toEqual([
      "+time:t:long",
      "-time:t:short",
    ]);
  });

  it("reports a changed date skeleton", () => {
    expect(icuStructureChanges("{d, date, ::yyyyMMdd}", "{d, date, ::yyyyMMMd}")).toEqual([
      "+date:d:::yyyyMMMd",
      "-date:d:::yyyyMMdd",
    ]);
  });

  it("reports a changed argument type and a renamed argument", () => {
    expect(icuStructureChanges("{n, number}", "{n, date}")).toEqual(["+date:n:", "-number:n:"]);
    expect(icuStructureChanges("{name}", "{nom}")).toEqual(["+argument:nom", "-argument:name"]);
  });

  it("tells plural, selectordinal and select apart", () => {
    expect(icuStructureChanges("{n, plural, other {x}}", "{n, selectordinal, other {x}}")).toEqual([
      "+selectordinal:n",
      "-plural:n",
    ]);
    expect(icuStructureChanges("{n, select, other {x}}", "{n, plural, other {x}}")).toEqual([
      "+plural:n",
      "-select:n",
    ]);
  });

  it("reports nothing when either value does not parse", () => {
    expect(icuStructureChanges("{n, plural, one {#}", "{n}")).toEqual([]);
    expect(icuStructureChanges("{n}", "{n, plural, one {#}")).toEqual([]);
  });

  it("compares against the fallback when the before value does not parse", () => {
    const broken = "{n, number, ::percent} {";
    expect(
      icuStructureChanges(broken, "{n, number, ::percent}", "{n, number, ::currency/USD}"),
    ).toEqual(["+number:n:::percent", "-number:n:::currency/USD"]);
    expect(
      icuStructureChanges(broken, "{n, number, ::currency/USD}", "{n, number, ::currency/USD}"),
    ).toEqual([]);
  });

  it("reports nothing when the fallback does not parse either", () => {
    expect(icuStructureChanges("{n, plural, one {#}", "{n}", "{n, plural, other {#")).toEqual([]);
  });

  it("ignores the fallback when the before value parses", () => {
    expect(icuStructureChanges("{n}", "{n}", "{n, number, ::percent}")).toEqual([]);
  });
});

describe("icuStructureChanges against a source fallback with target plural arms", () => {
  const broken = "{n, plural, one {# Datei} few {# {x}";
  const source = "{n, plural, one {# file} other {# files}}";

  it("accepts a repair that adds the target language plural arms with #", () => {
    const repaired = "{n, plural, one {# plik} few {# pliki} many {# plikow} other {# pliku}}";
    expect(icuStructureChanges(broken, repaired, source)).toEqual([]);
  });

  it("still reports a # dropped from every arm", () => {
    const repaired = "{n, plural, one {plik} few {pliki} many {plikow} other {pliku}}";
    expect(icuStructureChanges(broken, repaired, source)).toEqual(["-#:>n"]);
  });

  it("still reports a changed argument type", () => {
    expect(icuStructureChanges(broken, "{n, select, other {plik}}", source)).toEqual([
      "+select:n",
      "-plural:n",
      "-#:>n",
    ]);
  });
});
