import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it.each([
    [["p-2", "p-4"], "p-4"],
    [["px-2 py-1", "p-3"], "p-3"],
    [["text-fd-muted-foreground", "text-[color:var(--accent)]"], "text-[color:var(--accent)]"],
    [["rounded-md", "rounded-xl"], "rounded-xl"],
    [
      ["text-(length:--text-h4) font-semibold", "text-fd-foreground"],
      "text-(length:--text-h4) font-semibold text-fd-foreground",
    ],
    [["grid grid-rows-[0fr]", "grid-rows-[1fr]"], "grid grid-rows-[1fr]"],
    [["border border-fd-border", "border-transparent"], "border border-transparent"],
    [["hover:text-fd-foreground", "hover:text-[var(--accent)]"], "hover:text-[var(--accent)]"],
  ])("lets the later Tailwind class win a conflict: %j", (inputs, expected) => {
    expect(cn(...inputs)).toBe(expected);
  });

  it("drops falsy values and keeps enabled object keys", () => {
    expect(cn("a", false, undefined, null, { c: true, d: false }, ["e", ["f"]])).toBe("a c e f");
  });
});
