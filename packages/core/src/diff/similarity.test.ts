import { describe, expect, it } from "vitest";
import { similarityRatio } from "./similarity.js";

describe("similarityRatio", () => {
  it("scores identical text at the maximum", () => {
    expect(similarityRatio("Save changes", "Save changes")).toBe(1);
  });

  it("scores two empty strings at the maximum", () => {
    expect(similarityRatio("", "")).toBe(1);
  });

  it("scores text against nothing at the minimum", () => {
    expect(similarityRatio("Save changes", "")).toBe(0);
  });

  it("scores fully disjoint text of equal length at the minimum", () => {
    expect(similarityRatio("abc", "xyz")).toBe(0);
  });

  it("treats a line-ending difference as identical, matching content hashing", () => {
    expect(similarityRatio("one\r\ntwo", "one\ntwo")).toBe(1);
  });

  it("treats a decomposed accent as identical, matching content hashing", () => {
    expect(similarityRatio("Ubergrösse", "Ubergrösse")).toBe(1);
  });

  it("is symmetric", () => {
    const forward = similarityRatio("Delete this item", "Delete that item");
    const backward = similarityRatio("Delete that item", "Delete this item");

    expect(forward).toBe(backward);
  });

  it("returns the same score on repeated calls", () => {
    const first = similarityRatio("Your cart is empty", "Your basket is empty");
    const second = similarityRatio("Your cart is empty", "Your basket is empty");

    expect(first).toBe(second);
  });

  it("scores a one-character edit on a long string near the maximum", () => {
    const long = "Your subscription renews automatically at the end of each billing period.";
    const edited = long.replace("period.", "period!");

    expect(similarityRatio(long, edited)).toBeGreaterThan(0.98);
  });

  it("scores the same one-character edit on a short string materially lower", () => {
    const longScore = similarityRatio(
      "Your subscription renews automatically at the end of each billing period.",
      "Your subscription renews automatically at the end of each billing period!",
    );
    const shortScore = similarityRatio("Ok", "Oks");

    expect(shortScore).toBeLessThan(0.7);
    expect(longScore - shortScore).toBeGreaterThan(0.3);
  });

  it("stays within zero and one for a substitution, insertion and deletion at once", () => {
    const score = similarityRatio("Archive", "Arcive dead");

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("counts a pure insertion against the longer side", () => {
    expect(similarityRatio("abcd", "abcdefgh")).toBe(0.5);
  });
});
