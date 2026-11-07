// @vitest-environment jsdom
import { type ReactNode, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "./test-support.js";
import { nearestKept, useFocusKeeper } from "./use-focus-keeper.js";

function Detached(): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusKeeper(ref, {
    items: () => [],
    itemOf: () => undefined,
    find: () => undefined,
    fallback: () => {
      throw new Error("nothing is mounted, so nothing is handed over");
    },
  });
  return <p>no root attached</p>;
}

describe("useFocusKeeper", () => {
  it("does nothing while its root is not mounted", () => {
    expect(() => render(<Detached />)).not.toThrow();
  });
});

describe("nearestKept", () => {
  const order = ["a", "b", "c", "d"];

  it("prefers the next kept item after the lost one", () => {
    expect(nearestKept(order, "b", ["a", "c", "d"])).toBe("c");
  });

  it("falls back to the nearest earlier kept item", () => {
    expect(nearestKept(order, "d", ["a", "b"])).toBe("b");
  });

  it("finds nothing when nothing is kept", () => {
    expect(nearestKept(order, "b", [])).toBeUndefined();
  });
});
