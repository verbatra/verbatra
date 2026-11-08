// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KeyValueContext } from "../client/key-value-context.js";
import { LIMIT_RANGE_MESSAGE } from "../client/length-limit.js";
import type { StructuredError } from "../client/state.js";
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
import { type LoadedContext, useLimitDraft } from "./use-limit-draft.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const NOTICES = {
  invalid: {
    code: "LIMITS_FILE_IGNORED",
    message: "verbatra.limits.json is not valid JSON, so it was ignored. Fix or delete it.",
  },
  unreadable: {
    code: "LIMITS_FILE_IGNORED",
    message:
      "verbatra.limits.json exists but could not be read (a permissions problem), so it was ignored.",
  },
  directory: {
    code: "LIMITS_FILE_IGNORED",
    message: "verbatra.limits.json is not a regular file, so it was ignored.",
  },
} as const;

function context(overrides: Partial<LoadedContext> = {}): LoadedContext {
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

const FILE_8 = { maxLength: 8, maxLengthSource: "limits-file" } as const;

interface HostProps {
  readonly loaded: LoadedContext;
  readonly identity?: string;
  readonly reload?: () => void;
  readonly readFailure?: StructuredError | null;
  readonly promptOpen?: boolean;
}

let lastEffective: number | undefined;
let lastDirty = false;

function Host({
  loaded,
  identity = "k",
  reload = () => {},
  readFailure = null,
  promptOpen = false,
}: HostProps): ReactNode {
  const limit = useLimitDraft({ identity, keyName: "k", context: loaded, reload });
  lastEffective = limit.effectiveMaxLength;
  lastDirty = limit.dirty;
  return (
    <>
      <button type="button" id="elsewhere">
        elsewhere
      </button>
      <LimitControl limit={limit} readFailure={readFailure} promptOpen={promptOpen} />
    </>
  );
}

function host(props: HostProps): ReactNode {
  return <Host {...props} />;
}

function setCalls(): readonly { readonly params: unknown }[] {
  return rpcCalls.filter((call) => call.method === "key.setMaxLength");
}

function open(view: RenderResult, name: string): void {
  click(buttonNamed(view, name));
}

function field(view: RenderResult): HTMLInputElement {
  return textboxNamed(view, "Limit in characters");
}

function save(view: RenderResult): void {
  click(buttonNamed(view, "Save limit"));
}

describe("LimitControl modes", () => {
  it("shows a config limit read-only, says it comes from the config and offers no control", () => {
    const view = render(host({ loaded: context({ maxLength: 7, maxLengthSource: "config" }) }));

    expect(view.get("[data-limit-status]").textContent).toMatch(
      /Limit: 7 characters, set by the config/,
    );
    expect(view.text()).toMatch(/started/);
    expect(view.query("[data-limit-control] button")).toBeNull();
  });

  it("shows a limits-file limit with Change and Remove", () => {
    const view = render(
      host({ loaded: context({ maxLength: 1, maxLengthSource: "limits-file" }) }),
    );

    expect(view.get("[data-limit-status]").textContent).toBe(
      "Limit: 1 character, from verbatra.limits.json.",
    );
    expect(buttonNamed(view, "Change limit")).toBeTruthy();
    expect(buttonNamed(view, "Remove limit")).toBeTruthy();
  });

  it("offers only Set limit for a key without one", () => {
    const view = render(host({ loaded: context() }));

    expect(view.get("[data-limit-status]").textContent).toBe("No limit is set for this key.");
    expect(buttonNamed(view, "Set limit")).toBeTruthy();
    expect(view.query("[data-limit-remove]")).toBeNull();
  });

  it.each(Object.entries(NOTICES))(
    "shows the sdk's %s notice verbatim and no control",
    (_name, notice) => {
      const view = render(host({ loaded: context({ limitsNotice: notice }) }));

      expect(view.get("[data-limit-notice]").textContent).toBe(notice.message);
      expect(view.text()).toMatch(/cannot be changed here until verbatra\.limits\.json is fixed/);
      expect(view.query("[data-limit-control] button")).toBeNull();
      expect(view.query("[data-limit-advisory]")).toBeNull();
    },
  );

  it("says the length line counts now and a translate run flags, never that the value is queued", () => {
    const view = render(host({ loaded: context() }));

    const advisory = view.get("[data-limit-advisory]").textContent ?? "";
    expect(advisory).toContain("the length line shows the count now");
    expect(advisory).toContain("a translate run flags a value over the limit for review");
    expect(advisory).toContain("Nothing is blocked or shortened");
    expect(advisory).toContain("every locale");
    expect(view.text()).not.toMatch(/prompt|instruct|the model|is flagged for review/i);
  });

  it("uses no title attribute and no tooltip", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    open(view, "Change limit");

    expect(view.all("[title]")).toHaveLength(0);
    expect(view.query('[role="tooltip"]')).toBeNull();
  });
});

function FILE_8_CONTEXT(): Partial<LoadedContext> {
  return { ...FILE_8 };
}

describe("LimitControl setting", () => {
  it("sends the whole number, asks for a re-read, and returns focus to the trigger", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 12, changed: true } },
    });
    const reload = vi.fn();
    const view = render(host({ loaded: context(), reload }));

    open(view, "Set limit");
    expect(document.activeElement).toBe(field(view));
    typeInto(field(view), " 12 ");
    save(view);
    await flush();

    expect(setCalls().map((call) => call.params)).toEqual([{ key: "k", maxLength: 12 }]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(view.get("[data-limit-status]").textContent).toBe(
      "Limit: 12 characters, from verbatra.limits.json.",
    );
    expect(document.activeElement).toBe(buttonNamed(view, "Change limit"));
    expect(lastEffective).toBe(12);
  });

  it("prefills the current value for a change and is not dirty until it is edited", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));

    open(view, "Change limit");
    expect(field(view).value).toBe("8");
    expect(lastDirty).toBe(false);
    typeInto(field(view), "9");

    expect(lastDirty).toBe(true);
  });

  it.each(["", "0", "-3", "1.5", "abc", "1e3", "9007199254740992"])(
    "refuses %j inline without calling the server",
    async (text) => {
      stubRpc({
        "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 1, changed: true } },
      });
      const view = render(host({ loaded: context() }));
      open(view, "Set limit");
      typeInto(field(view), text);

      save(view);
      await flush();

      expect(setCalls()).toHaveLength(0);
      expect(field(view).getAttribute("aria-invalid")).toBe("true");
      expect(view.get("[data-limit-problem]").textContent).toBe(LIMIT_RANGE_MESSAGE);
      expect(field(view).getAttribute("aria-describedby")).toBe(
        view.get("[data-limit-problem]").id,
      );
      expect(document.activeElement).toBe(field(view));
    },
  );

  it("reserves two lines for the validation text at every width", () => {
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");

    const className = view.get("[data-limit-problem]").className;
    expect(className).toContain("min-h-8");
    expect(className).not.toContain("md:min-h");
    expect(view.get("[data-limit-problem]").textContent).toBe("");
  });

  it("lowers Save limit while an unsaved prompt is shown, so the prompt's Save is the only primary", () => {
    const view = render(<Host loaded={context()} promptOpen />);
    open(view, "Set limit");

    expect(view.get("[data-limit-save]").getAttribute("data-variant")).toBe("secondary");
  });

  it("shows the focus outline on the status line, which is found by its own hook", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));

    const status = view.get("[data-limit-status]");

    expect(status.className).toContain("focus:outline");
    expect(status.getAttribute("tabindex")).toBe("-1");
  });

  it("hands focus to the status line even when other content is added before it", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    buttonNamed(view, "Change limit").focus();
    const root = view.get("[data-limit-control]");
    const stranger = document.createElement("p");
    root.prepend(stranger);

    view.rerender(host({ loaded: context({ limitsNotice: NOTICES.invalid }) }));

    expect(document.activeElement).toBe(view.get("[data-limit-status]"));
    stranger.remove();
  });

  it("sends one request for a double press while it is in flight", async () => {
    const pending = deferredAnswer();
    stubRpc({ "key.setMaxLength": () => pending.promise });
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");
    typeInto(field(view), "5");

    save(view);
    click(view.get("[data-limit-save]"));
    await flush();

    expect(setCalls()).toHaveLength(1);
    expect(buttonNamed(view, "Saving…").getAttribute("aria-disabled")).toBe("true");
    expect(field(view).readOnly).toBe(true);
    await act(async () => {
      pending.resolve({ ok: true, result: { key: "k", maxLength: 5, changed: true } });
      await Promise.resolve();
    });
  });

  it("removes a limit with null", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: null, changed: true } },
    });
    const reload = vi.fn();
    const view = render(host({ loaded: context(FILE_8_CONTEXT()), reload }));

    click(buttonNamed(view, "Remove limit"));
    await flush();

    expect(setCalls().map((call) => call.params)).toEqual([{ key: "k", maxLength: null }]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(view.get("[data-limit-status]").textContent).toBe("No limit is set for this key.");
    expect(document.activeElement).toBe(buttonNamed(view, "Set limit"));
    expect(lastEffective).toBeUndefined();
  });

  it("closes on Escape without letting a surrounding dialog see it, and returns focus", () => {
    const view = render(host({ loaded: context() }));
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    open(view, "Set limit");

    act(() => {
      field(view).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    document.removeEventListener("keydown", seen);

    expect(seen).not.toHaveBeenCalled();
    expect(view.query("input")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(view, "Set limit"));
  });

  it("ignores Escape pressed while an input method is composing", () => {
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");

    act(() => {
      field(view).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }),
      );
    });

    expect(view.query("[data-limit-form]")).not.toBeNull();
  });

  it("closes on its own Cancel, named apart from the translation's Cancel", () => {
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");

    click(buttonNamed(view, "Cancel the limit change"));

    expect(view.query("input")).toBeNull();
    expect(setCalls()).toHaveLength(0);
    expect(document.activeElement).toBe(buttonNamed(view, "Set limit"));
  });

  it("shows a refusal through the error component with the server's message and keeps the input", async () => {
    stubRpc({
      "key.setMaxLength": rpcError(
        "LENGTH_LIMIT_INVALID",
        "The config's maxLength already sets it. Pass a whole number.",
      ),
    });
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");
    typeInto(field(view), "9");

    save(view);
    await flush();

    const alert = view.get('[data-limit-failure] [role="alert"]');
    expect(alert.textContent).toContain("The limit was refused, so nothing was changed.");
    expect(alert.textContent).toContain("Pass a whole number.");
    expect(field(view).value).toBe("9");
    expect(document.activeElement).toBe(field(view));
  });

  it("clears the refusal when the user types, cancels or reopens", async () => {
    stubRpc({ "key.setMaxLength": rpcError("LIMITS_FILE_UNWRITABLE", "Check the permissions.") });
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");
    typeInto(field(view), "9");
    save(view);
    await flush();
    expect(view.query("[data-limit-failure]")).not.toBeNull();

    typeInto(field(view), "10");
    expect(view.query("[data-limit-failure]")).toBeNull();

    save(view);
    await flush();
    expect(view.query("[data-limit-failure]")).not.toBeNull();
    click(buttonNamed(view, "Cancel the limit change"));
    expect(view.query("[data-limit-failure]")).toBeNull();
  });

  it("drops the refusal when the mode changes under it", async () => {
    stubRpc({ "key.setMaxLength": rpcError("LIMITS_FILE_UNWRITABLE", "Check the permissions.") });
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    click(buttonNamed(view, "Remove limit"));
    await flush();
    expect(view.query("[data-limit-failure]")).not.toBeNull();

    view.rerender(host({ loaded: context({ maxLength: 8, maxLengthSource: "config" }) }));

    expect(view.query("[data-limit-failure]")).toBeNull();
  });

  it("shows a failed removal and returns focus to the trigger", async () => {
    stubRpc({ "key.setMaxLength": rpcError("LIMITS_FILE_UNWRITABLE", "Check the permissions.") });
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));

    click(buttonNamed(view, "Remove limit"));
    await flush();

    expect(view.get('[data-limit-failure] [role="alert"]').textContent).toContain(
      "could not be written",
    );
    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 8 characters/);
    expect(document.activeElement).toBe(buttonNamed(view, "Change limit"));
  });

  it("makes every control 44px tall below md and the field wide enough for 16 digits", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    for (const name of ["Change limit", "Remove limit"]) {
      expect(buttonNamed(view, name).className).toContain("max-md:min-h-11");
    }
    open(view, "Change limit");

    for (const element of [
      field(view),
      buttonNamed(view, "Save limit"),
      buttonNamed(view, "Cancel the limit change"),
    ]) {
      expect(element.className).toContain("max-md:min-h-11");
    }
    expect(field(view).className).toContain("w-44");
  });
});

describe("LimitControl refresh", () => {
  it("keeps a typed limit and the focus in the field when a refresh brings a new context", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    open(view, "Change limit");
    typeInto(field(view), "77");
    const input = field(view);

    view.rerender(host({ loaded: context({ maxLength: 9, maxLengthSource: "limits-file" }) }));

    expect(field(view)).toBe(input);
    expect(input.value).toBe("77");
    expect(document.activeElement).toBe(input);
  });

  it("follows an outside edit while idle and never moves focus", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    view.get("#elsewhere").focus();

    view.rerender(host({ loaded: context({ maxLength: 30, maxLengthSource: "limits-file" }) }));

    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 30 characters/);
    expect(document.activeElement).toBe(view.get("#elsewhere"));
  });

  it("resets the draft when the key changes", () => {
    const view = render(host({ loaded: context(), identity: "a" }));
    open(view, "Set limit");
    typeInto(field(view), "5");

    view.rerender(host({ loaded: context(), identity: "b" }));

    expect(view.query("input")).toBeNull();
    expect(lastDirty).toBe(false);
  });

  it("hides the form when the key becomes config-set and shows it again, with the text, after", () => {
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");
    typeInto(field(view), "5");

    view.rerender(host({ loaded: context({ maxLength: 3, maxLengthSource: "config" }) }));
    expect(view.query("input")).toBeNull();
    view.rerender(host({ loaded: context() }));

    expect(field(view).value).toBe("5");
  });

  it("shows what the re-read says once a newer context arrives after a save", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 21, changed: true } },
    });
    const view = render(host({ loaded: context() }));
    open(view, "Set limit");
    typeInto(field(view), "21");
    save(view);
    await flush();
    expect(lastEffective).toBe(21);

    view.rerender(host({ loaded: context({ maxLength: 30, maxLengthSource: "limits-file" }) }));

    expect(lastEffective).toBe(30);
    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 30 characters/);
  });

  it("ignores the answer of a save that finishes after the key has changed", async () => {
    const pending = deferredAnswer();
    stubRpc({ "key.setMaxLength": () => pending.promise });
    const reload = vi.fn();
    const view = render(host({ loaded: context(), identity: "a", reload }));
    open(view, "Set limit");
    typeInto(field(view), "5");
    save(view);
    await flush();

    view.rerender(host({ loaded: context(), identity: "b", reload }));
    await act(async () => {
      pending.resolve({ ok: true, result: { key: "k", maxLength: 5, changed: true } });
      await Promise.resolve();
    });

    expect(reload).not.toHaveBeenCalled();
    expect(view.query("[data-limit-form]")).toBeNull();
    expect(lastDirty).toBe(false);
    expect(view.get("[data-limit-status]").textContent).toBe("No limit is set for this key.");
  });

  it("measures against the saved value and says so when the re-read failed", async () => {
    stubRpc({
      "key.setMaxLength": { ok: true, result: { key: "k", maxLength: 21, changed: true } },
    });
    const loaded = context();
    const view = render(host({ loaded }));
    open(view, "Set limit");
    typeInto(field(view), "21");
    save(view);
    await flush();

    view.rerender(
      host({ loaded, readFailure: { code: "INTERNAL", message: "the context is gone" } }),
    );

    expect(lastEffective).toBe(21);
    expect(view.get("[data-limit-status]").textContent).toMatch(/Limit: 21 characters/);
    expect(view.get('[data-limit-read-failure] [role="alert"]').textContent).toContain(
      "The limit was saved, but Studio could not read it back.",
    );
  });

  it("shows no read failure when no save is waiting on a re-read", () => {
    const view = render(
      host({
        loaded: context(FILE_8_CONTEXT()),
        readFailure: { code: "INTERNAL", message: "the context is gone" },
      }),
    );

    expect(view.query("[data-limit-read-failure]")).toBeNull();
  });
});

describe("LimitControl focus when a background refresh removes the focused control", () => {
  const unusable = (name: keyof typeof NOTICES): LoadedContext =>
    context({ limitsNotice: NOTICES[name] });

  it.each(["invalid", "unreadable", "directory"] as const)(
    "hands focus from Change limit to the status line when the file turns %s",
    (name) => {
      const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
      buttonNamed(view, "Change limit").focus();

      view.rerender(host({ loaded: unusable(name) }));

      expect(document.activeElement).toBe(view.get("[data-limit-status]"));
    },
  );

  it.each(["invalid", "unreadable", "directory"] as const)(
    "hands focus from Remove limit to the status line when the file turns %s",
    (name) => {
      const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
      buttonNamed(view, "Remove limit").focus();

      view.rerender(host({ loaded: unusable(name) }));

      expect(document.activeElement).toBe(view.get("[data-limit-status]"));
    },
  );

  it.each(["invalid", "unreadable", "directory"] as const)(
    "hands focus from Set limit to the status line when the file turns %s",
    (name) => {
      const view = render(host({ loaded: context() }));
      buttonNamed(view, "Set limit").focus();

      view.rerender(host({ loaded: unusable(name) }));

      expect(document.activeElement).toBe(view.get("[data-limit-status]"));
    },
  );

  it.each(["input", "save", "cancel"] as const)(
    "hands focus from the open form's %s to the status line when the file turns unusable",
    (which) => {
      const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
      open(view, "Change limit");
      const target = {
        input: field(view),
        save: buttonNamed(view, "Save limit"),
        cancel: buttonNamed(view, "Cancel the limit change"),
      }[which];
      target.focus();

      view.rerender(host({ loaded: unusable("invalid") }));

      expect(document.activeElement).toBe(view.get("[data-limit-status]"));
    },
  );

  it("hands focus over when the key becomes config-set", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    buttonNamed(view, "Change limit").focus();

    view.rerender(host({ loaded: context({ maxLength: 8, maxLengthSource: "config" }) }));

    expect(document.activeElement).toBe(view.get("[data-limit-status]"));
  });

  it("leaves focus elsewhere alone", () => {
    const view = render(host({ loaded: context(FILE_8_CONTEXT()) }));
    view.get("#elsewhere").focus();

    view.rerender(host({ loaded: unusable("invalid") }));

    expect(document.activeElement).toBe(view.get("#elsewhere"));
  });
});

export type { KeyValueContext };
