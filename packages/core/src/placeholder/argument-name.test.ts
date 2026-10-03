// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are placeholder text under test, not templates
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_ARGUMENT_NAME } from "./argument-name.js";
import { foreignPlaceholderTokens } from "./foreign-tokens.js";

const WHOLE_NAME = new RegExp(`^${PLACEHOLDER_ARGUMENT_NAME}$`, "u");

describe("PLACEHOLDER_ARGUMENT_NAME", () => {
  it.each([
    "name",
    "_private",
    "$count",
    "user-id",
    "número",
    "名前",
    "nom_é",
    "नाम",
    "café_2",
    "0",
    "12",
    "٣",
  ])("accepts %s", (name) => {
    expect(WHOLE_NAME.test(name)).toBe(true);
  });

  it.each(["", "user.name", "2nd", "-x", "名 前", "·名", "̈a", "a½", "a,b", "a}"])(
    "rejects %j",
    (name) => {
      expect(WHOLE_NAME.test(name)).toBe(false);
    },
  );

  it("keeps the dot the detector allows in double-brace, ruby and dollar-brace names", () => {
    expect(foreignPlaceholderTokens("{{user.name}} %{user.name} ${user.name}", [])).toEqual([
      "{{user.name}}",
      "%{user.name}",
      "${user.name}",
    ]);
    expect(foreignPlaceholderTokens("{user.name}", [])).toEqual([]);
  });
});
