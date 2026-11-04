// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Skeleton, TableSkeleton } from "./skeleton.tsx";
import { render } from "./test-support.tsx";

describe("Skeleton", () => {
  it("is hidden from assistive technology, because a placeholder carries no meaning", () => {
    const view = render(<Skeleton />);

    expect(view.get("span").getAttribute("aria-hidden")).toBe("true");
    expect(view.get("span").children).toHaveLength(0);
  });

  it("merges a caller className", () => {
    const view = render(<Skeleton className="h-6 w-1/3" />);

    expect(view.get("span").className.split(" ")).toEqual(expect.arrayContaining(["h-6", "w-1/3"]));
  });
});

describe("TableSkeleton", () => {
  it("defaults to a header bar plus four body bars", () => {
    const view = render(<TableSkeleton />);

    expect(view.all("span[aria-hidden='true']")).toHaveLength(5);
  });

  it("renders the requested number of body bars, and the header bar even with none", () => {
    expect(render(<TableSkeleton rows={2} />).all("span[aria-hidden='true']")).toHaveLength(3);
    expect(render(<TableSkeleton rows={0} />).all("span[aria-hidden='true']")).toHaveLength(1);
  });

  it("is not itself a live region, so the caller announces once", () => {
    const view = render(<TableSkeleton />);

    expect(view.query("[role], [aria-live]")).toBeNull();
  });
});
