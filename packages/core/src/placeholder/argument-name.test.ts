// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are placeholder text under test, not templates
import { describe, expect, it } from "vitest";
import {
  isPlaceholderArgumentName,
  PLACEHOLDER_ARGUMENT_IDENTIFIER,
  PLACEHOLDER_ARGUMENT_NAME,
} from "./argument-name.js";
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

  it("agrees with the anchored predicate", () => {
    for (const name of ["número", "0", "٣", "user.name", "a b", ""]) {
      expect(isPlaceholderArgumentName(name)).toBe(WHOLE_NAME.test(name));
    }
  });

  it("leaves digits-only names out of the identifier", () => {
    const identifier = new RegExp(`^${PLACEHOLDER_ARGUMENT_IDENTIFIER}$`, "u");

    expect(identifier.test("名前")).toBe(true);
    expect(identifier.test("0")).toBe(false);
  });

  it("keeps the dot the detector allows in double-brace, ruby and dollar-brace names", () => {
    expect(foreignPlaceholderTokens("{{user.name}} %{user.name} ${user.name}", [])).toEqual([
      "{{user.name}}",
      "%{user.name}",
      "${user.name}",
    ]);
    expect(foreignPlaceholderTokens("{user.name}", [])).toEqual([]);
  });
});
