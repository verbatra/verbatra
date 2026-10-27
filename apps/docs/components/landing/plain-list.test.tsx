import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlainList } from "./plain-list";

describe("PlainList", () => {
  it("keeps list semantics on an unstyled list, which Safari drops from a list-style: none list", () => {
    expect(renderToStaticMarkup(<PlainList className="list-none" />)).toBe(
      '<ul role="list" class="list-none"></ul>',
    );
  });

  it("renders an ordered list with the same explicit role", () => {
    expect(renderToStaticMarkup(<PlainList ordered />)).toBe('<ol role="list"></ol>');
  });
});
