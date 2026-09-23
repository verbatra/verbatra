// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { RetranslateButton } from "./RetranslateButton.js";
import { clickAsync, render, rpcCalls, rpcError, stubRpc } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const METHOD = "translation.retranslateEntry";

function mount(): ReturnType<typeof render> {
  return render(<RetranslateButton locale="de" keyName="app.title" />);
}

describe("RetranslateButton", () => {
  it("offers the action and says nothing about an outcome before it has run", () => {
    const view = mount();

    expect(view.get("button").textContent).toBe("Retranslate");
    expect(view.all("span span")).toHaveLength(0);
  });

  it("asks the server to retranslate exactly the locale and key it was given", async () => {
    stubRpc({ [METHOD]: { ok: true, result: { accepted: true } } });
    const view = mount();

    await clickAsync(view.get("button"));

    expect(rpcCalls).toEqual([{ method: METHOD, params: { locale: "de", key: "app.title" } }]);
  });

  it("disables the button and reports progress while the call is open", () => {
    stubRpc({ [METHOD]: () => new Promise(() => {}) });
    const view = mount();

    void clickAsync(view.get("button"));

    expect(view.get("button").hasAttribute("disabled")).toBe(true);
    expect(view.getByText("span", "Retranslating…").className).toContain("text-muted-foreground");
  });

  it("reports an accepted candidate as a success, in the success tone", async () => {
    stubRpc({ [METHOD]: { ok: true, result: { accepted: true } } });
    const view = mount();

    await clickAsync(view.get("button"));

    const status = view.getByText("span", "Retranslated");
    expect(status.className).toContain("text-success");
    expect(view.get("button").hasAttribute("disabled")).toBe(false);
  });

  it("names the integrity check a rejected candidate failed", async () => {
    stubRpc({ [METHOD]: { ok: true, result: { accepted: false, reason: "placeholder" } } });
    const view = mount();

    await clickAsync(view.get("button"));

    const status = view.getByText("span", "Rejected: placeholder mismatch");
    expect(status.className).toContain("text-danger");
  });

  it("distinguishes the other rejection reasons by their own copy", async () => {
    stubRpc({ [METHOD]: { ok: true, result: { accepted: false, reason: "icu" } } });
    const view = mount();

    await clickAsync(view.get("button"));

    expect(view.getByText("span", "Rejected: invalid message syntax")).not.toBeNull();
  });

  it("surfaces the server's message when the call itself fails", async () => {
    stubRpc({ [METHOD]: rpcError("LOCK_CONTENDED", "the locale is locked by another process") });
    const view = mount();

    await clickAsync(view.get("button"));

    const status = view.getByText("span", "Failed: the locale is locked by another process");
    expect(status.className).toContain("text-danger");
  });

  it("re-enables the button after a failure, so the action can be retried", async () => {
    stubRpc({ [METHOD]: rpcError("INTERNAL", "boom") });
    const view = mount();

    await clickAsync(view.get("button"));

    expect(view.get("button").hasAttribute("disabled")).toBe(false);
  });

  it("issues a second call for a retry, rather than reusing the settled outcome", async () => {
    stubRpc({ [METHOD]: { ok: true, result: { accepted: true } } });
    const view = mount();

    await clickAsync(view.get("button"));
    await clickAsync(view.get("button"));

    expect(rpcCalls).toHaveLength(2);
  });

  it("explains a refusal to replace a person's value and offers to replace it anyway", async () => {
    stubRpc({
      [METHOD]: (params) =>
        Promise.resolve(
          (params as { readonly includeHuman?: boolean }).includeHuman === true
            ? { ok: true, result: { accepted: true } }
            : rpcError("KEY_PROTECTED", "protected"),
        ),
    });
    const view = mount();

    await clickAsync(view.get("button"));

    expect(view.getByText("span", "A person wrote this value.").className).toContain(
      "text-muted-foreground",
    );
    const replace = view.all("button").find((button) => button.textContent === "Replace anyway");
    if (replace === undefined) {
      throw new Error("no Replace anyway button");
    }
    await clickAsync(replace);

    expect(rpcCalls.at(-1)).toEqual({
      method: METHOD,
      params: { locale: "de", key: "app.title", includeHuman: true },
    });
    expect(view.getByText("span", "Retranslated").className).toContain("text-success");
  });
});
