// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { KeyDescription } from "./KeyDescription.js";
import { render } from "./test-support.js";

describe("KeyDescription", () => {
  it("shows the source file's context for the key under a Context heading", () => {
    const view = render(<KeyDescription description="Shown on the home page" />);

    expect(view.get("h3").textContent).toBe("Context");
    expect(view.get("[data-key-description]").textContent).toBe("Shown on the home page");
  });

  it("renders nothing when the source file gives no description", () => {
    const view = render(<KeyDescription description={undefined} />);

    expect(view.text()).toBe("");
  });
});
