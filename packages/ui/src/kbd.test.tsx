// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Kbd } from "./kbd.tsx";
import { render } from "./test-support.tsx";

describe("Kbd", () => {
  it("renders a keyboard key element with its text", () => {
    const view = render(<Kbd>?</Kbd>);

    expect(view.get("kbd").textContent).toBe("?");
  });

  it("is muted by default and reports its tone", () => {
    expect(render(<Kbd>?</Kbd>).get("kbd").dataset.tone).toBe("muted");
    expect(render(<Kbd tone="strong">j</Kbd>).get("kbd").dataset.tone).toBe("strong");
  });

  it("merges a caller className and passes other attributes through", () => {
    const view = render(
      <Kbd className="shrink-0" data-key="j">
        j
      </Kbd>,
    );

    expect(view.get("kbd").className).toContain("shrink-0");
    expect(view.get("kbd").dataset.key).toBe("j");
  });
});
