import { describe, expect, it } from "vitest";
import { type PlacementInput, placePopover } from "./popover-position.ts";

const BASE: PlacementInput = {
  anchorTop: 100,
  anchorBottom: 130,
  panelLeft: 20,
  panelWidth: 180,
  panelHeight: 120,
  viewportWidth: 375,
  viewportHeight: 700,
  margin: 8,
  gap: 4,
};

function place(override: Partial<PlacementInput>) {
  return placePopover({ ...BASE, ...override });
}

describe("placePopover horizontally", () => {
  it("leaves a panel that already fits where it is", () => {
    expect(place({}).shiftX).toBe(0);
  });

  it("pulls a panel back from the inline-end viewport edge", () => {
    expect(place({ panelLeft: 300 }).shiftX).toBe(375 - 8 - (300 + 180));
  });

  it("pushes a panel in from the inline-start viewport edge", () => {
    expect(place({ panelLeft: -40 }).shiftX).toBe(8 + 40);
  });

  it("keeps the start edge visible when the panel is wider than the viewport", () => {
    expect(place({ panelLeft: 50, panelWidth: 400 }).shiftX).toBe(8 - 50);
  });

  it("stays inside a 320 wide viewport", () => {
    const { shiftX } = place({ viewportWidth: 320, panelLeft: 200 });

    expect(200 + shiftX + 180).toBeLessThanOrEqual(320 - 8);
    expect(200 + shiftX).toBeGreaterThanOrEqual(8);
  });
});

describe("placePopover vertically", () => {
  it("opens below when the panel fits there", () => {
    expect(place({})).toMatchObject({ side: "bottom", maxHeight: 700 - 130 - 4 - 8 });
  });

  it("flips above when it does not fit below and there is more room above", () => {
    const placement = place({
      anchorTop: 500,
      anchorBottom: 530,
      panelHeight: 300,
      viewportHeight: 600,
    });

    expect(placement).toMatchObject({ side: "top", maxHeight: 500 - 4 - 8 });
  });

  it("stays below and limits its height when neither side fits and below is larger", () => {
    const placement = place({ anchorTop: 40, anchorBottom: 70, panelHeight: 900 });

    expect(placement).toMatchObject({ side: "bottom", maxHeight: 700 - 70 - 4 - 8 });
  });

  it("never reports negative room", () => {
    const placement = place({ anchorTop: 2, anchorBottom: 690, viewportHeight: 700 });

    expect(placement.maxHeight).toBeGreaterThanOrEqual(0);
  });
});
