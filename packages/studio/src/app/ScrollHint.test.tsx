// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ScrollHint } from "./ScrollHint.js";
import { render } from "./test-support.js";

describe("ScrollHint", () => {
  it("is hidden from assistive technology and from md screens up", () => {
    const view = render(<ScrollHint />);
    const hint = view.get("p");

    expect(hint.textContent).toBe("Scroll sideways to see every column.");
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    expect(hint.className).toContain("md:hidden");
  });
});
