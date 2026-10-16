import { describe, expect, it } from "vitest";
import {
  assertInputLimits,
  assertLanguagesAllowed,
  assertNoSensitiveData,
  assertSafeEnvironment,
  bridgePlaygroundKey,
  type EnvironmentProbe,
  PlaygroundRefusal,
  redactForOutput,
} from "./guards.ts";
import { LANGUAGE_ALLOWLIST, PLAYGROUND_KEY_VAR, PROVIDER_KEY_VAR } from "./limits.ts";
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SOURCE, type SourceItem } from "./source.ts";

const SAFE: EnvironmentProbe = { env: {}, isTTY: true, insideContainer: false };
const FAKE_KEY = ["fake", "playground", "value", "for", "tests"].join("-");

function items(...texts: string[]): SourceItem[] {
  return texts.map((text, index) => ({ id: `item${"abcdefghijklmnop"[index]}`, text }));
}

describe("the committed source", () => {
  it("passes every input guard", () => {
    expect(() => assertInputLimits(PLAYGROUND_SOURCE)).not.toThrow();
    expect(() => assertNoSensitiveData(PLAYGROUND_SOURCE)).not.toThrow();
    expect(() => assertLanguagesAllowed(PLAYGROUND_LANGUAGES)).not.toThrow();
  });
});

describe("assertInputLimits", () => {
  it("accepts twelve items", () => {
    expect(() =>
      assertInputLimits(items(...Array.from({ length: 12 }, () => "Save"))),
    ).not.toThrow();
  });

  it("rejects a 13th item", () => {
    expect(() => assertInputLimits(items(...Array.from({ length: 13 }, () => "Save")))).toThrow(
      PlaygroundRefusal,
    );
  });

  it("rejects an empty source", () => {
    expect(() => assertInputLimits([])).toThrow(PlaygroundRefusal);
  });

  it("accepts 40 characters and rejects an item over 40 characters", () => {
    expect(() => assertInputLimits(items("a".repeat(40)))).not.toThrow();
    expect(() => assertInputLimits(items("a".repeat(41)))).toThrow(/longer than 40/);
  });

  it.each([
    ["digits", "Save 2 files"],
    ["markup", "<b>Save</b>"],
    ["a colon", "Note: save"],
    ["a semicolon", "Save; now"],
    ["a slash", "Save/close"],
    ["a double quote", 'Say "hi"'],
    ["an ampersand", "Save & close"],
    ["a malformed placeholder", "Hello {name"],
    ["a placeholder with digits", "Hello {name1}"],
    ["a double-brace placeholder", "Hello {{name}}"],
    ["a newline", "Save\nnow"],
  ])("rejects digits, markup and unknown punctuation: %s", (_label, text) => {
    expect(() => assertInputLimits(items(text))).toThrow(PlaygroundRefusal);
  });

  it("accepts letters, spaces, the allowed punctuation and {name} placeholders", () => {
    expect(() => assertInputLimits(items("Don't stop, {name}! Ready? Yes - go."))).not.toThrow();
  });

  it("rejects duplicate and malformed ids", () => {
    expect(() =>
      assertInputLimits([
        { id: "save", text: "Save" },
        { id: "save", text: "Save" },
      ]),
    ).toThrow(/twice/);
    expect(() => assertInputLimits([{ id: "save-it", text: "Save" }])).toThrow(/camelCase/);
  });
});

describe("assertNoSensitiveData", () => {
  it.each([
    ["an email address", "Write to jane@example.org"],
    ["a URL", "See https://example.org"],
    ["a bare domain", "Visit example.com today"],
    ["a www host", "Visit www.example"],
    ["a phone number", "Call +49 30 1234567"],
    ["a digit sequence", "Order 12"],
    ["an @handle", "Ping @someone"],
    ["a prefixed key", "sk-abcdefghijklmnop"],
    ["a Google key shape", "AIzaSyA1234567890abcdefghijklmnopqrstuv"],
    ["a long token", "abcdefghijklmnopqrstuvwxyzABCDEF"],
  ])("rejects each sensitive pattern: %s", (_label, text) => {
    expect(() => assertNoSensitiveData(items(text))).toThrow(PlaygroundRefusal);
  });

  it("accepts ordinary UI strings", () => {
    expect(() =>
      assertNoSensitiveData(items("Your cart is empty.", "Welcome back, {name}!")),
    ).not.toThrow();
  });
});

describe("assertLanguagesAllowed", () => {
  it("accepts the full allowlist", () => {
    expect(() => assertLanguagesAllowed(LANGUAGE_ALLOWLIST)).not.toThrow();
  });

  it("rejects a language outside the allowlist", () => {
    expect(() => assertLanguagesAllowed(["de", "it"])).toThrow(/allowlist/);
    expect(() => assertLanguagesAllowed(["pt"])).toThrow(/allowlist/);
  });

  it("rejects a sixth language", () => {
    expect(() => assertLanguagesAllowed([...LANGUAGE_ALLOWLIST, "de"])).toThrow(/More than 5/);
  });

  it("rejects an empty or duplicated selection", () => {
    expect(() => assertLanguagesAllowed([])).toThrow(PlaygroundRefusal);
    expect(() => assertLanguagesAllowed(["de", "de"])).toThrow(/twice/);
  });
});

describe("assertSafeEnvironment", () => {
  it("passes a local interactive shell", () => {
    expect(() => assertSafeEnvironment(SAFE)).not.toThrow();
  });

  it("refuses under CI, whatever its value", () => {
    expect(() => assertSafeEnvironment({ ...SAFE, env: { CI: "true" } })).toThrow(/CI/);
    expect(() => assertSafeEnvironment({ ...SAFE, env: { CI: "" } })).toThrow(/CI/);
  });

  it.each(["production", "Production", "PRODUCTION", " production "])(
    "refuses in production, case-insensitively: %j",
    (value) => {
      expect(() => assertSafeEnvironment({ ...SAFE, env: { NODE_ENV: value } })).toThrow(
        /production/,
      );
    },
  );

  it("refuses under GitHub Actions", () => {
    expect(() => assertSafeEnvironment({ ...SAFE, env: { GITHUB_ACTIONS: "true" } })).toThrow(
      /GITHUB_ACTIONS/,
    );
  });

  it("refuses in a Docker or Podman container", () => {
    expect(() => assertSafeEnvironment({ ...SAFE, insideContainer: true })).toThrow(/container/);
  });

  it("refuses without a TTY", () => {
    expect(() => assertSafeEnvironment({ ...SAFE, isTTY: false })).toThrow(/TTY/);
  });

  it("refuses when GEMINI_API_KEY is already set", () => {
    expect(() => assertSafeEnvironment({ ...SAFE, env: { [PROVIDER_KEY_VAR]: FAKE_KEY } })).toThrow(
      PROVIDER_KEY_VAR,
    );
  });

  it("never prints the key in a refusal", () => {
    try {
      assertSafeEnvironment({ ...SAFE, env: { [PROVIDER_KEY_VAR]: FAKE_KEY } });
    } catch (error) {
      expect(String(error)).not.toContain(FAKE_KEY);
    }
    expect.assertions(1);
  });
});

describe("bridgePlaygroundKey", () => {
  it("copies the playground key into GEMINI_API_KEY of the given environment only", () => {
    const env: Record<string, string | undefined> = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    bridgePlaygroundKey(env);
    expect(env[PROVIDER_KEY_VAR]).toBe(FAKE_KEY);
  });

  it("refuses without the playground key and names the variable, not a value", () => {
    expect(() => bridgePlaygroundKey({})).toThrow(PLAYGROUND_KEY_VAR);
  });

  it("refuses to overwrite an existing GEMINI_API_KEY", () => {
    const env = { [PLAYGROUND_KEY_VAR]: FAKE_KEY, [PROVIDER_KEY_VAR]: "other" };
    expect(() => bridgePlaygroundKey(env)).toThrow(PlaygroundRefusal);
    expect(env[PROVIDER_KEY_VAR]).toBe("other");
  });
});

describe("redactForOutput", () => {
  it("error output contains no key-like string and no configured key value", () => {
    const env = { [PLAYGROUND_KEY_VAR]: FAKE_KEY };
    const message = `request failed for ${FAKE_KEY} with AIzaSyA1234567890abcdefghijklmnopqrstuv`;
    const safe = redactForOutput(message, env);
    expect(safe).not.toContain(FAKE_KEY);
    expect(safe).not.toContain("AIzaSyA1234567890abcdefghijklmnopqrstuv");
  });
});
