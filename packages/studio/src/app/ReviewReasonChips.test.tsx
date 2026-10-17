// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ReviewReasonChips } from "./ReviewReasonChips.js";
import { render } from "./test-support.js";

describe("ReviewReasonChips", () => {
  it("renders one labelled chip per review reason", () => {
    const view = render(
      <ReviewReasonChips reasons={["GLOSSARY_FORBIDDEN_TERM", "MAX_LENGTH_EXCEEDED"]} />,
    );

    expect(Array.from(view.get("span").children, (chip) => chip.textContent)).toEqual([
      "Forbidden term used",
      "Over length budget",
    ]);
  });
});
