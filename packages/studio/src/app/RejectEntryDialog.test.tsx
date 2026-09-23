// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { RejectEntryDialog } from "./RejectEntryDialog.js";
import {
  clickAsync,
  flush,
  pressKey,
  render,
  rpcCalls,
  rpcError,
  stubRpc,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function renderDialog(): {
  readonly view: ReturnType<typeof render>;
  readonly onClose: () => void;
  readonly onRejected: () => void;
  readonly onValueChanged: (message: string) => void;
} {
  const onClose = vi.fn<() => void>();
  const onRejected = vi.fn<() => void>();
  const onValueChanged = vi.fn<(message: string) => void>();
  const view = render(
    <RejectEntryDialog
      locale="de"
      keyName="greeting"
      value={"Hallo\nWelt"}
      onClose={onClose}
      onRejected={onRejected}
      onValueChanged={onValueChanged}
    />,
  );
  return { view, onClose, onRejected, onValueChanged };
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

  it("ignores Escape and the backdrop while the rejection is in flight", async () => {
    stubRpc({ "review.reject": () => new Promise(() => {}) });
    const { view, onClose } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));
    pressKey("Escape");
    await clickAsync(view.get('button[aria-label="Keep greeting and close"]'));

    expect(onClose).not.toHaveBeenCalled();
    expect(view.text()).toContain("Rejecting…");
  });

  it("hands a stale value back to its caller instead of showing a failure", async () => {
    stubRpc({ "review.reject": rpcError("REVIEW_VALUE_CHANGED", "changed") });
    const { view, onValueChanged, onRejected } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));

    expect(onValueChanged).toHaveBeenCalledWith(
      expect.stringContaining("This translation changed since the queue was loaded"),
    );
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the reason for any other failure", async () => {
    stubRpc({ "review.reject": rpcError("LOCK_CONTENDED", "busy") });
    const { view, onValueChanged } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));

    expect(view.get('[role="alert"]').textContent).toContain("Failed: This locale's write lock");
    expect(onValueChanged).not.toHaveBeenCalled();
  });

  it("confirms with the danger button and separates the sentence around its action label", () => {
    const { view } = renderDialog();

    expect(view.getByText("button", "Reject and remove").className).toContain("bg-danger");
    expect(view.text()).toContain("run, or Translate pending changes across all locales, fills");
  });

  it("keeps focus inside the dialog on the status while rejecting, then on the error", async () => {
    let answer: (value: ReturnType<typeof rpcError>) => void = () => {};
    stubRpc({
      "review.reject": () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    const { view } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));
    expect(document.activeElement?.textContent).toBe("Rejecting…");

    answer(rpcError("LOCK_CONTENDED", "busy"));
    await flush();
    expect(document.activeElement?.getAttribute("role")).toBe("alert");
  });

  it("offers only Close, without a Failed prefix, when the files could not be put back", async () => {
    stubRpc({ "review.reject": rpcError("REVIEW_RESTORE_FAILED", "raw") });
    const { view, onClose } = renderDialog();

    await clickAsync(view.getByText("button", "Reject and remove"));

    expect(view.query('button[class*="bg-danger"]')).toBeNull();
    expect(view.all("button").map((button) => button.textContent)).toContain("Close");
    const alert = view.get('[role="alert"]').textContent ?? "";
    expect(alert.startsWith("Failed:")).toBe(false);
    expect(alert).toContain("could not be put back");
    await clickAsync(view.getByText("button", "Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
