// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "./test-support.tsx";
import { Toast } from "./toast.tsx";

describe("Toast", () => {
  it("is a live status region, so the message is announced without stealing focus", () => {
    const view = render(<Toast>Saved</Toast>);
    const toast = view.get("[role='status']");

    expect(toast.textContent).toBe("Saved");
    expect(toast.hasAttribute("tabindex")).toBe(false);
  });

  it("renders the caller's content untouched", () => {
    const view = render(
      <Toast>
        <p>Three keys updated</p>
      </Toast>,
    );

    expect(view.get("[role='status'] p").textContent).toBe("Three keys updated");
  });

  it("lets a caller add placement classes without losing the base ones", () => {
    const view = render(<Toast className="custom-placement">Saved</Toast>);
    const classes = view.get("[role='status']").className.split(" ");

    expect(classes).toContain("custom-placement");
    expect(classes).toContain("fixed");
  });

  it("builds on the small-padded card", () => {
    const view = render(<Toast>Saved</Toast>);

    expect(view.get("[role='status']").dataset.padding).toBe("sm");
  });
});
