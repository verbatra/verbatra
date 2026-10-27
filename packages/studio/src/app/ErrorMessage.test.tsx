// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ErrorMessage } from "./ErrorMessage.js";
import { render } from "./test-support.js";

const SESSION_EXPIRED_COPY = "The session has expired. Reload the page to start a new one.";

describe("ErrorMessage", () => {
  it("announces the failure through an alert region", () => {
    const view = render(
      <ErrorMessage error={{ code: "SESSION_EXPIRED", message: "session expired" }} />,
    );

    expect(view.get("p").getAttribute("role")).toBe("alert");
  });

  it("replaces a known code's raw message with the actionable copy for that code", () => {
    const view = render(
      <ErrorMessage error={{ code: "SESSION_EXPIRED", message: "session expired" }} />,
    );

    expect(view.text()).toBe(SESSION_EXPIRED_COPY);
  });

  it("falls back to the server's own message for a code the table does not cover", () => {
    const view = render(
      <ErrorMessage
        error={{ code: "ALREADY_IN_PROGRESS", message: "A run is already in progress." }}
      />,
    );

    expect(view.text()).toBe("A run is already in progress.");
  });

  it("resolves a provider code to its own copy, not to the transport wording", () => {
    const view = render(<ErrorMessage error={{ code: "AUTH_FAILED", message: "401" }} />);

    expect(view.text()).toBe(
      "The translation provider rejected the configured API key or refused the request under its policy.",
    );
  });

  it("puts the prefix in front of the resolved copy, separated by a space", () => {
    const view = render(
      <ErrorMessage
        error={{ code: "SESSION_EXPIRED", message: "session expired" }}
        prefix="Showing the last good data."
      />,
    );

    expect(view.text()).toBe(`Showing the last good data. ${SESSION_EXPIRED_COPY}`);
  });

  it("renders the copy alone when there is no prefix, with no stray leading space", () => {
    const view = render(<ErrorMessage error={{ code: "INTERNAL", message: "boom" }} />);

    expect(view.get("span").textContent).toBe(
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    );
  });

  it("hides the warning glyph from assistive technology, so only the copy is announced", () => {
    const view = render(<ErrorMessage error={{ code: "INTERNAL", message: "boom" }} />);

    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("never resolves an inherited Object.prototype member name to a value from the prototype", () => {
    const view = render(
      <ErrorMessage error={{ code: "constructor", message: "an odd server code" }} />,
    );

    expect(view.text()).toBe("an odd server code");
  });
});
