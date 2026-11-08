// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KeyValueContext } from "../client/key-value-context.js";
import { LimitControl } from "./LimitControl.js";
import {
  buttonNamed,
  click,
  deferredAnswer,
  flush,
  type RenderResult,
  render,
  rpcCalls,
  rpcError,
  stubRpc,
  textboxNamed,
  typeInto,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

type Loaded = Extract<KeyValueContext, { kind: "loaded" }>;

const NOTICE = {
  code: "LIMITS_FILE_IGNORED",
  message:
    "verbatra.limits.json is not a regular file, so it was ignored. Replace verbatra.limits.json with a regular file, or remove it; it was left as it is.",
} as const;

function context(overrides: Partial<Loaded> = {}): Loaded {
  return {
    kind: "loaded",
    source: "Hello",
    target: "Hallo",
    description: undefined,
    provenance: undefined,
    glossary: { terms: [], doNotTranslate: [] },
    maxLength: undefined,
    maxLengthSource: undefined,
    limitsNotice: undefined,
    ...overrides,
  };
}

function control(loaded: Loaded, onChanged = vi.fn()) {
  return <LimitControl key="k" keyName="k" context={loaded} onChanged={onChanged} />;
}

function setCalls(): readonly { readonly params: unknown }[] {
  return rpcCalls.filter((call) => call.method === "key.setMaxLength");
}

function open(view: RenderResult, label: string): void {
  click(buttonNamed(view, label));
}

function submit(view: RenderResult): void {
  click(view.get("[data-limit-save]"));
}

describe("LimitControl modes", () => {
  it("shows a config limit read-only, says it comes from the config and offers no control", () => {
    const view = render(control(context({ maxLength: 7, maxLengthSource: "config" })));

    expect(view.get("[data-limit-status]").textContent).toMatch(
      /Limit: 7 characters, set by the config/,
    );
    expect(view.text()).toMatch(/started/);
    expect(view.query("button")).toBeNull();
    expect(view.query("input")).toBeNull();
  });

  it("shows a limits-file limit with Change and Remove", () => {
    const view = render(control(context({ maxLength: 1, maxLengthSource: "limits-file" })));

    expect(view.get("[data-limit-status]").textContent).toBe(
      "Limit: 1 character, from verbatra.limits.json.",
    );
    expect(buttonNamed(view, "Change limit")).toBeTruthy();
    expect(buttonNamed(view, "Remove limit")).toBeTruthy();
  });

  it("offers only Set limit for a key without one", () => {
    const view = render(control(context()));

    expect(view.get("[data-limit-status]").textContent).toBe("No limit is set for this key.");
    expect(buttonNamed(view, "Set limit")).toBeTruthy();
    expect(view.query("[data-limit-remove]")).toBeNull();
  });

  it("shows the sdk's notice verbatim and no control while the file is unusable", () => {
    const view = render(control(context({ limitsNotice: NOTICE })));

    expect(view.get("[data-limit-notice]").textContent).toBe(NOTICE.message);
    expect(view.text()).toMatch(/cannot be changed here until verbatra\.limits\.json is fixed/);
    expect(view.query("button")).toBeNull();
    expect(view.query("[data-limit-advisory]")).toBeNull();
  });

  it("states that a limit is advisory and never says the model is told it", () => {
    const view = render(control(context()));

    const advisory = view.get("[data-limit-advisory]").textContent ?? "";
    expect(advisory).toMatch(/never blocked or shortened/);
    expect(advisory).toMatch(/every locale/);
    expect(view.text()).not.toMatch(/prompt|instruct|the model/i);
  });

  it("uses no title attribute and no tooltip", () => {
    const view = render(control(context({ maxLength: 4, maxLengthSource: "limits-file" })));
    open(view, "Change limit");

    expect(view.all("[title]")).toHaveLength(0);
    expect(view.query('[role="tooltip"]')).toBeNull();
  });
});

describe("LimitControl setting", () => {
  it("sends the whole number, asks for a re-read, and returns focus to the trigger", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 12, changed: true } },
    });
    const onChanged = vi.fn();
    const view = render(control(context(), onChanged));

    open(view, "Set limit");
    expect(document.activeElement).toBe(textboxNamed(view, "Limit in characters"));
    typeInto(textboxNamed(view, "Limit in characters"), " 12 ");
    submit(view);
    await flush();

    expect(setCalls().map((call) => call.params)).toEqual([{ key: "k", maxLength: 12 }]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.get("[data-limit-status]").textContent).toBe(
      "Limit: 12 characters, from verbatra.limits.json.",
    );
    expect(document.activeElement).toBe(buttonNamed(view, "Change limit"));
  });

  it("prefills the current value for a change", () => {
    const view = render(control(context({ maxLength: 30, maxLengthSource: "limits-file" })));

    open(view, "Change limit");

    expect(textboxNamed(view, "Limit in characters").value).toBe("30");
  });

  it.each(["", "0", "-3", "1.5", "abc", "1e3", "9007199254740992"])(
    "refuses %j inline without calling the server",
    async (text) => {
      stubRpc({
        "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 1, changed: true } },
      });
      const view = render(control(context()));
      open(view, "Set limit");
      typeInto(textboxNamed(view, "Limit in characters"), text);

      submit(view);
      await flush();

      expect(setCalls()).toHaveLength(0);
      const input = textboxNamed(view, "Limit in characters");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(view.get("[data-limit-problem]").textContent).not.toBe("");
      expect(input.getAttribute("aria-describedby")).toBe(view.get("[data-limit-problem]").id);
      expect(document.activeElement).toBe(input);
    },
  );

  it("keeps the validation line in the layout when there is nothing to say", () => {
    const view = render(control(context()));
    open(view, "Set limit");

    expect(view.get("[data-limit-problem]").className).toContain("min-h-4");
    expect(view.get("[data-limit-problem]").textContent).toBe("");
  });

  it("sends one request for a double press while it is in flight", async () => {
    const pending = deferredAnswer();
    stubRpc({ "key.setMaxLength": () => pending.promise });
    const view = render(control(context()));
    open(view, "Set limit");
    typeInto(textboxNamed(view, "Limit in characters"), "5");

    submit(view);
    submit(view);
    await flush();

    expect(setCalls()).toHaveLength(1);
    expect(view.get("[data-limit-save]").getAttribute("aria-disabled")).toBe("true");
    expect(textboxNamed(view, "Limit in characters").readOnly).toBe(true);
    await act(async () => {
      pending.resolve({ ok: true, result: { key: "k", maxLength: 5, changed: true } });
      await Promise.resolve();
    });
  });

  it("removes a limit with null", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: null, changed: true } },
    });
    const onChanged = vi.fn();
    const view = render(
      control(context({ maxLength: 8, maxLengthSource: "limits-file" }), onChanged),
    );

    click(buttonNamed(view, "Remove limit"));
    await flush();

    expect(setCalls().map((call) => call.params)).toEqual([{ key: "k", maxLength: null }]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.get("[data-limit-status]").textContent).toBe("No limit is set for this key.");
    expect(document.activeElement).toBe(buttonNamed(view, "Set limit"));
  });

  it("closes on Escape without letting a surrounding dialog see it, and returns focus", () => {
    const view = render(control(context()));
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    open(view, "Set limit");

    act(() => {
      textboxNamed(view, "Limit in characters").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    document.removeEventListener("keydown", seen);

    expect(seen).not.toHaveBeenCalled();
    expect(view.query("input")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(view, "Set limit"));
  });

  it("makes every control 44px tall below md", () => {
    const view = render(control(context({ maxLength: 4, maxLengthSource: "limits-file" })));
    for (const name of ["Change limit", "Remove limit"]) {
      expect(buttonNamed(view, name).className).toContain("max-md:min-h-11");
    }
    open(view, "Change limit");

    for (const element of [
      textboxNamed(view, "Limit in characters"),
      view.get("[data-limit-save]"),
      view.get("[data-limit-cancel]"),
    ]) {
      expect(element.className).toContain("max-md:min-h-11");
    }
  });

  it("ignores Escape pressed while an input method is composing", () => {
    const view = render(control(context()));
    open(view, "Set limit");

    act(() => {
      textboxNamed(view, "Limit in characters").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }),
      );
    });

    expect(view.query("[data-limit-form]")).not.toBeNull();
  });

  it("closes on Cancel", () => {
    const view = render(control(context()));
    open(view, "Set limit");

    click(view.get("[data-limit-cancel]"));

    expect(view.query("input")).toBeNull();
    expect(setCalls()).toHaveLength(0);
  });

  it("shows a refusal through the error component with the server's message and keeps the input", async () => {
    stubRpc({
      "key.setMaxLength": rpcError(
        "LENGTH_LIMIT_INVALID",
        "The config's maxLength already sets it. Studio read the config when it started. Pass a whole number.",
      ),
    });
    const view = render(control(context()));
    open(view, "Set limit");
    typeInto(textboxNamed(view, "Limit in characters"), "9");

    submit(view);
    await flush();

    const alert = view.get('[data-limit-failure] [role="alert"]');
    expect(alert.textContent).toContain("The limit was refused, so nothing was changed.");
    expect(alert.textContent).toContain("Pass a whole number.");
    expect(textboxNamed(view, "Limit in characters").value).toBe("9");
    expect(document.activeElement).toBe(textboxNamed(view, "Limit in characters"));
  });

  it("shows a failed removal and returns focus to the trigger", async () => {
    stubRpc({ "key.setMaxLength": rpcError("LIMITS_FILE_UNWRITABLE", "Check the permissions.") });
    const view = render(control(context({ maxLength: 8, maxLengthSource: "limits-file" })));

    click(buttonNamed(view, "Remove limit"));
    await flush();

    expect(view.get('[data-limit-failure] [role="alert"]').textContent).toContain(
      "could not be written",
    );
    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 8 characters/);
    expect(document.activeElement).toBe(buttonNamed(view, "Change limit"));
  });
});

describe("LimitControl refresh", () => {
  it("keeps a typed limit and the focus in the field when a refresh brings a new context", () => {
    const view = render(control(context({ maxLength: 8, maxLengthSource: "limits-file" })));
    open(view, "Change limit");
    typeInto(textboxNamed(view, "Limit in characters"), "77");
    const input = textboxNamed(view, "Limit in characters");

    view.rerender(control(context({ maxLength: 9, maxLengthSource: "limits-file" })));

    expect(textboxNamed(view, "Limit in characters")).toBe(input);
    expect(input.value).toBe("77");
    expect(document.activeElement).toBe(input);
  });

  it("follows an outside edit while idle and never moves focus", () => {
    const view = render(
      <>
        <button type="button" id="elsewhere">
          x
        </button>
        {control(context({ maxLength: 8, maxLengthSource: "limits-file" }))}
      </>,
    );
    view.get("#elsewhere").focus();

    view.rerender(
      <>
        <button type="button" id="elsewhere">
          x
        </button>
        {control(context({ maxLength: 30, maxLengthSource: "limits-file" }))}
      </>,
    );

    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 30 characters/);
    expect(document.activeElement).toBe(view.get("#elsewhere"));
  });

  it("drops the form when the key becomes config-set or the file unusable, and shows it again after", () => {
    const view = render(control(context()));
    open(view, "Set limit");
    typeInto(textboxNamed(view, "Limit in characters"), "5");

    view.rerender(control(context({ maxLength: 3, maxLengthSource: "config" })));
    expect(view.query("input")).toBeNull();
    view.rerender(control(context()));

    expect(textboxNamed(view, "Limit in characters").value).toBe("5");
  });

  it("shows the saved value at once, before the re-read answers", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 21, changed: true } },
    });
    const onChanged = vi.fn();
    const view = render(control(context(), onChanged));
    open(view, "Set limit");
    typeInto(textboxNamed(view, "Limit in characters"), "21");

    submit(view);
    await flush();

    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 21 characters/);
  });
});
