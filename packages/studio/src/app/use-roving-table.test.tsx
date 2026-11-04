// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { elementOf } from "./use-roving-table.js";

describe("elementOf", () => {
  it("returns an element as it is", () => {
    const element = document.createElement("td");

    expect(elementOf(element)).toBe(element);
  });

  it("returns the parent element of a text node", () => {
    const cell = document.createElement("td");
    const text = cell.appendChild(document.createTextNode("value"));

    expect(elementOf(text)).toBe(cell);
  });

  it("returns nothing for a text node with no parent element", () => {
    expect(elementOf(document.createTextNode("detached"))).toBeNull();
  });

  it("returns nothing for an event target that is not a node", () => {
    expect(elementOf(new EventTarget())).toBeNull();
  });
});
