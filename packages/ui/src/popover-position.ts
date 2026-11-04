export interface PlacementInput {
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly panelLeft: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly margin: number;
  readonly gap: number;
}

export type PopoverSide = "bottom" | "top";

export interface Placement {
  readonly shiftX: number;
  readonly side: PopoverSide;
  readonly maxHeight: number;
}

function horizontalShift(input: PlacementInput): number {
  const { panelLeft, panelWidth, viewportWidth, margin } = input;
  const overflowEnd = panelLeft + panelWidth - (viewportWidth - margin);
  const shifted = overflowEnd > 0 ? panelLeft - overflowEnd : panelLeft;
  return shifted < margin ? margin - panelLeft : shifted - panelLeft;
}

export function placePopover(input: PlacementInput): Placement {
  const { anchorTop, anchorBottom, panelHeight, viewportHeight, margin, gap } = input;
  const roomBelow = Math.max(0, viewportHeight - anchorBottom - gap - margin);
  const roomAbove = Math.max(0, anchorTop - gap - margin);
  const side: PopoverSide = panelHeight > roomBelow && roomAbove > roomBelow ? "top" : "bottom";
  return {
    shiftX: Math.round(horizontalShift(input)),
    side,
    maxHeight: Math.floor(side === "top" ? roomAbove : roomBelow),
  };
}
