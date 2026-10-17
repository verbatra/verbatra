// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { RefreshToastView } from "../client/refresh-toast.js";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { RefreshToast } from "./RefreshToast.js";
import {
  clickAsync,
  type RenderResult,
  renderAsync,
  rpcCalls,
  rpcError,
  stubRpc,
} from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const ACTION_METHOD = "translation.translatePending";
const ACTION_LABEL = "Translate pending changes across all locales";

const SOURCE_VIEW: RefreshToastView = {
  category: "source",
  label: "Source changed",
  summary: "3 changed, 1 added",
  actionEligible: true,
};

const TARGET_VIEW: RefreshToastView = {
  category: "targets",
  label: "Target changed: de",
  summary: "2 removed",
  actionEligible: false,
};

function snapshot(capabilities: StudioCapabilities): {
  readonly ok: true;
  readonly result: unknown;
} {
  return {
    ok: true,
    result: {
      sourceLocale: "en",
      targetLocales: ["de"],
      capabilities,
      exposeAgentTools: false,
    },
  };
}

interface WithheldLocale {
  readonly locale: string;
  readonly integrityMismatches: readonly string[];
  readonly providerFailures: readonly string[];
  readonly budgetWithheld: readonly string[];
  readonly sensitiveWithheld: readonly string[];
}

function localeSummary(overrides: Partial<WithheldLocale> = {}): WithheldLocale {
  return {
    locale: "de",
    integrityMismatches: [],
    providerFailures: [],
    budgetWithheld: [],
    sensitiveWithheld: [],
    ...overrides,
  };
}

function runSummary(
  overrides: {
    readonly failed?: readonly string[];
    readonly partial?: readonly string[];
    readonly locales?: readonly WithheldLocale[];
  } = {},
): { readonly ok: true; readonly result: unknown } {
  return {
    ok: true,
    result: {
      failed: overrides.failed ?? [],
      partial: overrides.partial ?? [],
      locales: overrides.locales ?? [],
    },
  };
}

const SPENDING_SERVER = snapshot({ spend: true, writeToDisk: true });

function mount(view: RefreshToastView, onDismiss: () => void = () => {}): Promise<RenderResult> {
  return renderAsync(<RefreshToast view={view} onDismiss={onDismiss} />);
}

describe("RefreshToast", () => {
  it("announces the change as a status region rather than interrupting with an alert", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });

    const view = await mount(SOURCE_VIEW);

    expect(view.get('[role="status"]')).not.toBeNull();
  });

  it("shows the event's heading and its key-delta summary", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });

    const view = await mount(SOURCE_VIEW);

    expect(view.getByText("span", "Source changed")).not.toBeNull();
    expect(view.getByText("span", "3 changed, 1 added")).not.toBeNull();
  });

  it("names the changed locale in a target-file event's heading", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });

    const view = await mount(TARGET_VIEW);

    expect(view.getByText("span", "Target changed: de")).not.toBeNull();
  });

  it("offers the pending-changes action on a source event when the server may spend and write", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });

    const view = await mount(SOURCE_VIEW);

    expect(view.getByText("button", ACTION_LABEL)).not.toBeNull();
  });

  it("hides the action entirely on a server that may not spend, rather than disabling it", async () => {
    stubRpc({ "project.snapshot": snapshot({ spend: false, writeToDisk: true }) });

    const view = await mount(SOURCE_VIEW);

    expect(view.text()).not.toContain(ACTION_LABEL);
  });

  it("hides the action on a server that may not write to disk", async () => {
    stubRpc({ "project.snapshot": snapshot({ spend: true, writeToDisk: false }) });

    const view = await mount(SOURCE_VIEW);

    expect(view.text()).not.toContain(ACTION_LABEL);
  });

  it("hides the action for a target-file event even on a fully capable server", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });

    const view = await mount(TARGET_VIEW);

    expect(view.text()).not.toContain(ACTION_LABEL);
  });

  it("hides the action while the capabilities read is still in flight", async () => {
    stubRpc({ "project.snapshot": () => new Promise(() => {}) });

    const view = await mount(SOURCE_VIEW);

    expect(view.text()).not.toContain(ACTION_LABEL);
  });

  it("hides the action when the capabilities read failed", async () => {
    stubRpc({ "project.snapshot": rpcError("INTERNAL", "snapshot unavailable") });

    const view = await mount(SOURCE_VIEW);

    expect(view.text()).not.toContain(ACTION_LABEL);
  });

  it("says nothing about an outcome until the action has run", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });

    const view = await mount(SOURCE_VIEW);

    expect(view.text()).not.toContain("Translated");
  });

  it("runs the pending-changes action with no parameters", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER, [ACTION_METHOD]: runSummary() });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(rpcCalls).toContainEqual({ method: ACTION_METHOD, params: {} });
  });

  it("disables the action and reports progress while the run is open", async () => {
    stubRpc({
      "project.snapshot": SPENDING_SERVER,
      [ACTION_METHOD]: () => new Promise(() => {}),
    });
    const view = await mount(SOURCE_VIEW);

    void clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("button", ACTION_LABEL).hasAttribute("disabled")).toBe(true);
    expect(view.getByText("span", "Translating…").className).toContain("text-muted-foreground");
  });

  it("reports a clean run as translated, in the success tone", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER, [ACTION_METHOD]: runSummary() });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("span", "Translated").className).toContain("text-success");
  });

  it("names every locale that failed outright", async () => {
    stubRpc({
      "project.snapshot": SPENDING_SERVER,
      [ACTION_METHOD]: runSummary({ failed: ["de", "fr"] }),
    });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("span", "Failed for de, fr").className).toContain("text-danger");
  });

  it("counts a single withheld key in the singular", async () => {
    stubRpc({
      "project.snapshot": SPENDING_SERVER,
      [ACTION_METHOD]: runSummary({
        partial: ["de"],
        locales: [localeSummary({ integrityMismatches: ["app.title"] })],
      }),
    });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("span", "Withheld 1 key for de")).not.toBeNull();
  });

  it("counts several withheld keys in the plural, summed across every reason", async () => {
    stubRpc({
      "project.snapshot": SPENDING_SERVER,
      [ACTION_METHOD]: runSummary({
        partial: ["de", "fr"],
        locales: [
          localeSummary({ integrityMismatches: ["a"], providerFailures: ["b"] }),
          localeSummary({ locale: "fr", budgetWithheld: ["c"] }),
        ],
      }),
    });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("span", "Withheld 3 keys for de, fr")).not.toBeNull();
  });

  it("treats a withheld run as a failure for tone, since not everything landed", async () => {
    stubRpc({
      "project.snapshot": SPENDING_SERVER,
      [ACTION_METHOD]: runSummary({
        partial: ["de"],
        locales: [localeSummary({ providerFailures: ["a"] })],
      }),
    });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("span", "Withheld 1 key for de").className).toContain("text-danger");
  });

  it("surfaces the server's message when the run itself fails", async () => {
    stubRpc({
      "project.snapshot": SPENDING_SERVER,
      [ACTION_METHOD]: rpcError("ALREADY_IN_PROGRESS", "a run is already in progress"),
    });
    const view = await mount(SOURCE_VIEW);

    await clickAsync(view.getByText("button", ACTION_LABEL));

    expect(view.getByText("span", "Failed: a run is already in progress").className).toContain(
      "text-danger",
    );
  });

  it("dismisses on request without asking the server for anything", async () => {
    stubRpc({ "project.snapshot": SPENDING_SERVER });
    const onDismiss = vi.fn();
    const view = await mount(SOURCE_VIEW, onDismiss);

    await clickAsync(view.get('[aria-label="Dismiss"]'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(rpcCalls.some((call) => call.method === ACTION_METHOD)).toBe(false);
  });
});
