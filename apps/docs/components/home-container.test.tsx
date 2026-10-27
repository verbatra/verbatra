import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HOME_LAYOUT_ID, HomeContainer } from "./home-container";

describe("HomeContainer", () => {
  it("renders a div carrying the home layout id and every passed prop", () => {
    const html = renderToStaticMarkup(
      <HomeContainer className="extra" style={{ color: "red" }} data-state="open" aria-busy>
        content
      </HomeContainer>,
    );

    expect(html).toBe(
      `<div id="${HOME_LAYOUT_ID}" style="color:red" data-state="open" aria-busy="true" class="flex flex-1 flex-col extra">content</div>`,
    );
  });

  it("lets a passed id override the default", () => {
    expect(renderToStaticMarkup(<HomeContainer id="custom" />)).toBe(
      '<div id="custom" class="flex flex-1 flex-col"></div>',
    );
  });
});
