import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { breakAfterUnderscores } from "./word-breaks";

function markup(text: ReturnType<typeof breakAfterUnderscores>): string {
  return renderToStaticMarkup(<>{text}</>);
}

describe("breakAfterUnderscores", () => {
  it("offers a line break only after each underscore", () => {
    expect(markup(breakAfterUnderscores("AGENT_FILE_INVALID"))).toBe(
      "AGENT_<wbr/>FILE_<wbr/>INVALID",
    );
  });

  it("leaves a title without underscores or a non-string title as it is", () => {
    const element = <code>translate</code>;
    expect(breakAfterUnderscores("Run notices")).toBe("Run notices");
    expect(breakAfterUnderscores(element)).toBe(element);
  });
});
