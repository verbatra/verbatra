import { afterEach, describe, expect, it, vi } from "vitest";
import { redactingStreams } from "./redacting-streams.js";
import { captureStreams } from "./test-support.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function written(text: string): string {
  const cap = captureStreams();
  redactingStreams(cap.streams).out(text);
  return cap.out();
}

describe("redactingStreams: a compact JSON document", () => {
  it.each([
    ["a trailing double quote", 'fake-openai-key"'],
    ["an embedded double quote", 'fake-"openai"-key'],
    ["a trailing backslash", "fake-openai-key\\"],
    ["an embedded backslash", "fake\\openai\\key"],
  ])("keeps the document valid JSON when the key value holds %s", (_what, value) => {
    vi.stubEnv("OPENAI_API_KEY", value);
    const document = { ok: false, command: null, message: `rejected ${value}`, list: [value, 1] };

    const out = written(`${JSON.stringify(document)}\n`);

    expect(out.endsWith("}\n")).toBe(true);
    expect(JSON.parse(out)).toEqual({
      ok: false,
      command: null,
      message: "rejected [REDACTED]",
      list: ["[REDACTED]", 1],
    });
  });

  it("scrubs a key value used as an object key", () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-key-value");

    expect(JSON.parse(written(JSON.stringify({ "fake-openai-key-value": true })))).toEqual({
      "[REDACTED]": true,
    });
  });

  it.each([
    [
      "a top-level member",
      { auth_key: "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0" },
      { auth_key: "[REDACTED]" },
    ],
    [
      "a nested member",
      { config: { deeplKey: "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", id: 1 } },
      { config: { deeplKey: "[REDACTED]", id: 1 } },
    ],
  ])("scrubs a DeepL key named by %s object key", (_what, document, expected) => {
    const out = written(`${JSON.stringify(document)}\n`);

    expect(out.endsWith("}\n")).toBe(true);
    expect(JSON.parse(out)).toEqual(expected);
  });

  it("keeps the value-by-value result when a whole-document match would break the JSON", () => {
    vi.stubEnv("OPENAI_API_KEY", '1,"zzzzzzzz');
    const document = '{"a":1,"zzzzzzzz":2}';

    expect(written(document)).toBe(document);
  });

  it("keeps a DeepL key named by its member scrubbed when the whole-document match is dropped", () => {
    vi.stubEnv("OPENAI_API_KEY", '1,"zzzzzzzz');
    const document = '{"a":1,"zzzzzzzz":2,"auth_key":"0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0"}';

    expect(JSON.parse(written(document))).toEqual({
      a: 1,
      zzzzzzzz: 2,
      auth_key: "[REDACTED]",
    });
  });

  it("scrubs a member whose name is itself a key value without pairing it", () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-key-value");

    expect(JSON.parse(written(JSON.stringify({ "fake-openai-key-value": "plain" })))).toEqual({
      "[REDACTED]": "plain",
    });
  });
});

describe("redactingStreams: text that is not a compact JSON document", () => {
  it.each([
    ["plain text", "rejected fake-openai-key-value\n", "rejected [REDACTED]\n"],
    ["a JSON scalar", '"fake-openai-key-value"\n', '"[REDACTED]"\n'],
    ["indented JSON", '{\n  "k": "fake-openai-key-value"\n}\n', '{\n  "k": "[REDACTED]"\n}\n'],
    ["an empty write", "", ""],
  ])("scrubs %s as text and keeps its layout", (_what, text, expected) => {
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-key-value");

    expect(written(text)).toBe(expected);
  });

  it("scrubs stderr the same way", () => {
    vi.stubEnv("OPENAI_API_KEY", "fake-openai-key-value");
    const cap = captureStreams();

    redactingStreams(cap.streams).err('{"message":"fake-openai-key-value"}\n');

    expect(cap.err()).toBe('{"message":"[REDACTED]"}\n');
  });
});
