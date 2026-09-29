import { describe, expect, it } from "vitest";
import { type BuildXliffInput, buildXliff, type XliffExportUnit } from "./build-xliff.js";
import type { XliffVersion } from "./xliff-vocabulary.js";

function build(version: XliffVersion, units: readonly XliffExportUnit[]): string {
  const input: BuildXliffInput = {
    version,
    sourceLanguage: "en_us",
    targetLanguage: "zh_hant_tw",
    units,
  };
  return buildXliff(input);
}

const UNIT: XliffExportUnit = {
  key: 'a "key"\nwith\ttabs & <marks>',
  source: [
    { kind: "text", text: "Hi " },
    { kind: "code", code: '<a href="x">' },
  ],
  target: [
    { kind: "text", text: "Hallo " },
    { kind: "code", code: '<a href="x">' },
  ],
  state: "reviewed",
  sourceHash: "abc",
  notes: [
    { category: "description", text: "Shown <here> & there" },
    { category: "meaning", text: "greeting" },
  ],
};

describe("buildXliff 2.0", () => {
  const text = build("2.0", [UNIT]);

  it("declares the document, metadata namespace and BCP 47 languages", () => {
    expect(text).toContain(
      '<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" xmlns:mda="urn:oasis:names:tc:xliff:metadata:2.0" version="2.0" srcLang="en-US" trgLang="zh-Hant-TW">',
    );
    expect(text).toContain('<file id="f1" original="verbatra" xml:space="preserve">');
  });

  it("names the unit by its key with every attribute character escaped", () => {
    expect(text).toContain(
      '<unit id="u1" name="a &quot;key&quot;&#10;with&#9;tabs &amp; &lt;marks&gt;">',
    );
  });

  it("carries the source hash, the notes and the original data", () => {
    expect(text).toContain('<mda:meta type="source-hash">abc</mda:meta>');
    expect(text).toContain('<note category="description">Shown &lt;here&gt; &amp; there</note>');
    expect(text).toContain('<note category="meaning">greeting</note>');
    expect(text).toContain('<data id="d1">&lt;a href="x"&gt;</data>');
  });

  it("writes codes as placeholders a CAT tool shows and protects", () => {
    expect(text).toContain(
      '<source>Hi <ph id="1" dataRef="d1" disp="&lt;a href=&quot;x&quot;&gt;" equiv="&lt;a href=&quot;x&quot;&gt;"/></source>',
    );
    expect(text).toContain('<segment state="reviewed">');
  });

  it("writes no notes or original data element for a unit that has none", () => {
    const plain = build("2.0", [
      {
        key: "k",
        source: [{ kind: "text", text: "s" }],
        state: "initial",
        sourceHash: "h",
        notes: [],
      },
    ]);
    expect(plain).not.toContain("<notes>");
    expect(plain).not.toContain("<originalData>");
    expect(plain).not.toContain("<target>");
  });
});

describe("buildXliff 1.2", () => {
  const text = build("1.2", [UNIT]);

  it("declares the languages on the file", () => {
    expect(text).toContain(
      '<file original="verbatra" datatype="plaintext" source-language="en-US" target-language="zh-Hant-TW">',
    );
  });

  it("marks a reviewed unit approved and signed off, with the hash in extradata", () => {
    expect(text).toContain(
      'approved="yes" xml:space="preserve" extradata="verbatra-source-hash:abc">',
    );
    expect(text).toContain('<target state="signed-off">');
  });

  it("writes codes as placeholders carrying the native code", () => {
    expect(text).toContain(
      '<ph id="1" equiv-text="&lt;a href=&quot;x&quot;&gt;">&lt;a href="x"&gt;</ph>',
    );
  });

  it("writes notes after the target", () => {
    expect(text.indexOf('<note from="description">')).toBeGreaterThan(text.indexOf("<target"));
  });

  it("leaves an unreviewed unit without the approved flag", () => {
    const plain = build("1.2", [{ ...UNIT, state: "translated" }]);
    expect(plain).not.toContain("approved=");
    expect(plain).toContain('<target state="translated">');
  });

  it("writes an initial unit with an old target as needing translation", () => {
    const stale = build("1.2", [{ ...UNIT, state: "initial" }]);
    expect(stale).toContain('<target state="needs-translation">');
  });
});
