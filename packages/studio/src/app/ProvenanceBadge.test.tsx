// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { render } from "./test-support.js";

describe("ProvenanceBadge", () => {
  it("renders nothing when the server reported no provenance", () => {
    const view = render(<ProvenanceBadge provenance={undefined} />);

    expect(view.text()).toBe("");
  });

  it("names the origin in text and describes it to screen readers, not by color or hover alone", () => {
    const view = render(
      <ProvenanceBadge provenance={{ origin: "external", reviewState: "unreviewed" }} />,
    );

    expect(view.text()).toBe(
      " Origin: Edited outside verbatra. Changed since verbatra recorded who wrote it.",
    );
    expect(view.all(".sr-only").map((node) => node.textContent)).toEqual([
      " Origin: ",
      ". Changed since verbatra recorded who wrote it.",
    ]);
    expect(view.get("[title]").getAttribute("title")).toBe(
      "Changed since verbatra recorded who wrote it.",
    );
  });

  it("uses the paired status tokens of its tone", () => {
    const view = render(
      <ProvenanceBadge provenance={{ origin: "human", reviewState: "unreviewed" }} />,
    );

    expect(view.container.innerHTML).toContain("bg-success-soft");
    expect(view.container.innerHTML).toContain("text-success");
  });
});
