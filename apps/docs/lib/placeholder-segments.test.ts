import { describe, expect, it } from "vitest";
import { splitPlaceholders } from "./placeholder-segments";

describe("splitPlaceholders", () => {
  it("separates each placeholder from the text around it", () => {
    expect(splitPlaceholders("Hi {name}, {count}!")).toEqual([
      { text: "Hi ", placeholder: false },
      { text: "{name}", placeholder: true },
      { text: ", ", placeholder: false },
      { text: "{count}", placeholder: true },
      { text: "!", placeholder: false },
    ]);
  });

  it("returns a single plain segment without placeholders and nothing for empty text", () => {
    expect(splitPlaceholders("Settings")).toEqual([{ text: "Settings", placeholder: false }]);
    expect(splitPlaceholders("")).toEqual([]);
  });
});
