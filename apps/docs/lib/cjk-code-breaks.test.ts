import { describe, expect, it } from "vitest";
import { rehypeCjkCodeBreaks } from "./cjk-code-breaks";
import type { HastNode } from "./hast";

const text = (value: string): HastNode => ({ type: "text", value });
const code = (value: string): HastNode => ({
  type: "element",
  tagName: "code",
  properties: {},
  children: [text(value)],
});
const cell = (children: HastNode[]): HastNode => ({
  type: "element",
  tagName: "td",
  properties: {},
  children,
});

function run(children: HastNode[]): string[] {
  const node = cell(children);
  rehypeCjkCodeBreaks()({ type: "root", children: [node] });
  return (node.children ?? []).map((child) =>
    child.type === "text" ? (child.value ?? "") : (child.tagName ?? ""),
  );
}

describe("rehypeCjkCodeBreaks", () => {
  it.each(["、", "，", "；", "：", "。", "）", "」", "』", "】"])(
    "offers a break after %s before inline code",
    (mark) => {
      expect(run([code(".vue"), text(mark), code(".svelte")])).toEqual([
        "code",
        mark,
        "wbr",
        "code",
      ]);
    },
  );

  it("leaves a code run in Latin text, and a mark before plain text, untouched", () => {
    expect(run([code("a"), text(", "), code("b")])).toEqual(["code", ", ", "code"]);
    expect(run([text("、"), text("text")])).toEqual(["、", "text"]);
    expect(run([text("、 "), code("b")])).toEqual(["、 ", "code"]);
  });

  it("walks nested elements", () => {
    const inner = cell([text("例：、"), code("x")]);
    rehypeCjkCodeBreaks()({ type: "root", children: [cell([inner])] });
    expect((inner.children ?? []).map((child) => child.tagName ?? "text")).toEqual([
      "text",
      "wbr",
      "code",
    ]);
  });
});
