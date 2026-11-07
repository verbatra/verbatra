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

    expect(view.get("[data-tone]").textContent).toBe(
      " Origin: Edited outside verbatra. Changed since verbatra recorded who wrote it.",
    );
    expect(view.all("[data-tone] .sr-only").map((node) => node.textContent)).toEqual([
      " Origin: ",
      ". Changed since verbatra recorded who wrote it.",
    ]);
    expect(view.get('[role="tooltip"]').textContent).toBe(
      "Changed since verbatra recorded who wrote it.",
    );
    expect(view.get('[role="tooltip"]').getAttribute("aria-hidden")).toBe("true");
    expect(view.query("[title]")).toBeNull();
  });

  it("uses the paired status tokens of its tone", () => {
    const view = render(
      <ProvenanceBadge provenance={{ origin: "human", reviewState: "unreviewed" }} />,
    );

    expect(view.get("[data-tone]").dataset.tone).toBe("success");
  });

  it("opens its bubble below by default and on the side a caller names", () => {
    const provenance = { origin: "human", reviewState: "unreviewed" } as const;

    expect(
      render(<ProvenanceBadge provenance={provenance} />).get("[data-slot]").dataset.side,
    ).toBe("bottom-start");
    expect(
      render(<ProvenanceBadge provenance={provenance} tooltipSide="top-start" />).get("[data-slot]")
        .dataset.side,
    ).toBe("top-start");
  });

  it("lets a long origin break inside its cell only when asked to", () => {
    const external = { origin: "external", reviewState: "unreviewed" } as const;
    const plain = render(<ProvenanceBadge provenance={external} />);
    const wrapped = render(<ProvenanceBadge provenance={external} wrap />);

    expect(plain.get("[data-tone]").className).toContain("whitespace-nowrap");
    expect(plain.get("[data-tone]").className).not.toContain("whitespace-normal");
    expect(wrapped.get("[data-tone]").className).toContain("whitespace-normal");
  });
});
