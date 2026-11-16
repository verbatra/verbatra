// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyControl } from "./copy-control";

const STATUS = { copy: "Copy", copied: "Copied", copyFailed: "Failed" };

describe("CopyControl analytics marker", () => {
  it("marks its button as the command-row surface", () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<CopyControl text="npm i" label="Copy" status={STATUS} />),
      "text/html",
    );
    expect(doc.querySelector("button")?.getAttribute("data-copy-surface")).toBe("command-row");
  });
});
