// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { KeyEditorHistory } from "./KeyEditorHistory.js";
import { render } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

describe("KeyEditorHistory", () => {
  it("says so when the project has no target locale, and reads nothing", () => {
    const view = render(
      <KeyEditorHistory
        keyName="greeting"
        locales={[]}
        locale={undefined}
        onLocaleChange={() => {}}
        read={{ view: { kind: "loading" }, retrying: false, pending: false, retry: () => {} }}
        ui={{
          confirming: null,
          shown: 20,
          deep: false,
          limit: undefined,
          confirm: () => {},
          showMore: () => {},
          readFurther: () => {},
        }}
        current={{ kind: "loading" }}
        onRestore={() => {}}
      />,
    );

    expect(view.text()).toContain("no target locales");
    expect(view.query("select")).toBeNull();
  });
});
