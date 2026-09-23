// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { RejectEntryDialog } from "./RejectEntryDialog.js";
import { clickAsync, pressKey, render, rpcCalls, stubRpc } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function renderDialog(): {
  readonly view: ReturnType<typeof render>;
  readonly onClose: () => void;
  readonly onRejected: () => void;
} {
  const onClose = vi.fn<() => void>();
  const onRejected = vi.fn<() => void>();
  const view = render(
    <RejectEntryDialog
      locale="de"
      keyName="greeting"
      value={"Hallo\nWelt"}
      onClose={onClose}
      onRejected={onRejected}
    />,
  );
  return { view, onClose, onRejected };
}

describe("RejectEntryDialog", () => {
  it("shows the exact text being rejected and what the rejection does", () => {
    const { view } = renderDialog();

    expect(view.all("section p").map((node) => node.textContent)).toContain("Hallo\nWelt");
    expect(view.text()).toContain("verbatra.provenance.json");
    expect(view.all("button").map((button) => button.textContent)).toContain("Reject and remove");
  });

  it("closes on Escape without calling the server", () => {
    const { onClose } = renderDialog();
    const before = rpcCalls.length;

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(rpcCalls).toHaveLength(before);
  });

  it("locks both buttons and says so while the rejection is in flight", async () => {
    stubRpc({ "review.reject": () => new Promise(() => {}) });
    const { view, onRejected } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));

    expect((view.getByText("button", "Reject and remove") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((view.getByText("button", "Cancel") as HTMLButtonElement).disabled).toBe(true);
    expect(view.text()).toContain("Rejecting…");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("reports success to its caller only once the server confirms", async () => {
    stubRpc({
      "review.reject": {
        ok: true,
        result: {
          locale: "de",
          key: "greeting",
          provenance: { origin: "machine", reviewState: "rejected" },
        },
      },
    });
    const { view, onRejected } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));

    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(rpcCalls.at(-1)).toEqual({
      method: "review.reject",
      params: { locale: "de", key: "greeting", expectedValue: "Hallo\nWelt" },
    });
  });
});
