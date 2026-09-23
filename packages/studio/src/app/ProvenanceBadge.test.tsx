// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { render } from "./test-support.js";

describe("ProvenanceBadge", () => {
  it("renders nothing when the server reported no provenance", () => {
    const view = render(<ProvenanceBadge provenance={undefined} />);

    expect(view.text()).toBe("");
  });

  it("names the origin in text, with a screen-reader prefix, not by color alone", () => {
    const view = render(
      <ProvenanceBadge provenance={{ origin: "external", reviewState: "unreviewed" }} />,
    );

    expect(view.text()).toBe("Origin: Edited outside verbatra");
    expect(view.get(".sr-only").textContent).toBe("Origin: ");
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
