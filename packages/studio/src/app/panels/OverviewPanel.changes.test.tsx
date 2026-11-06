// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { RenderResult, StubRpcHandler, StubRpcResult } from "../test-support.js";
import {
  click,
  clickAsync,
  flush,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  stubRpc,
} from "../test-support.js";
import { OverviewPanel } from "./OverviewPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const OK_DIFF: StubRpcResult = { ok: true, result: { hasPendingChanges: false, locales: [] } };
const OK_CHECK: StubRpcResult = { ok: true, result: { inSync: true, locales: [] } };
const NO_LOCK: StubRpcResult = { ok: true, result: { exists: false } };
const NO_USAGE: StubRpcResult = { ok: true, result: { available: false } };
const NO_HISTORY: StubRpcResult = {
  ok: true,
  result: { available: false, reason: "not-a-repository" },
};

const DE_MODIFIED = { path: "locales/de.json", locales: ["de"], state: "modified" };

function statusOf(files: readonly object[], branch: string | null = "main"): StubRpcResult {
  return { ok: true, result: { available: true, branch, files } };
}

function diffOf(overrides: object = {}): StubRpcResult {
  return {
    ok: true,
    result: {
      available: true,
      path: "locales/de.json",
      state: "modified",
      added: [],
      removed: [],
      changed: [{ key: "greeting", before: "Hallo", after: "Servus" }],
      truncated: false,
      ...overrides,
    },
  };
}

function stubPage(overrides: Readonly<Record<string, StubRpcResult | StubRpcHandler>> = {}): void {
  stubRpc({
    "status.diff": OK_DIFF,
    "status.check": OK_CHECK,
    "lock.state": NO_LOCK,
    "usage.summary": NO_USAGE,
    "history.list": NO_HISTORY,
    "git.status": statusOf([DE_MODIFIED]),
    "git.localeDiff": diffOf(),
    ...overrides,
  });
}

function deferred(): {
  readonly handler: StubRpcHandler;
  answer(call: number, result: StubRpcResult): void;
} {
  const resolvers: Array<(result: StubRpcResult) => void> = [];
  return {
    handler: () =>
      new Promise<StubRpcResult>((resolve) => {
        resolvers.push(resolve);
      }),
    answer(call, result) {
      const resolve = resolvers[call];
      if (resolve === undefined) {
        throw new Error(`call ${call} was never made`);
      }
      resolve(result);
    },
  };
}

function inOrder(results: readonly [StubRpcResult, ...StubRpcResult[]]): StubRpcHandler {
  let index = 0;
  return () => {
    const answer = results[Math.min(index, results.length - 1)] ?? results[0];
    index += 1;
    return answer;
  };
}

function retryButtons(view: RenderResult): HTMLElement[] {
  return view.all("button").filter((button) => button.textContent?.startsWith("Retry") === true);
}

function changesSection(view: RenderResult): HTMLElement {
  const section = view.getByText("h2", "Changes").closest("section");
  if (section === null) {
    throw new Error("the Changes heading is not inside a section");
  }
  return section;
}

function callsTo(method: string): number {
  return rpcCalls.filter((call) => call.method === method).length;
}

describe("OverviewPanel Changes section", () => {
  it("lists the changed files and reads a key diff by locale only, never by path", async () => {
    stubPage();
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(changesSection(view).textContent).toContain("locales/de.json");
    await clickAsync(view.get('[data-git-toggle="de"]'));

    const diffCalls = rpcCalls.filter((call) => call.method === "git.localeDiff");
    expect(diffCalls).toEqual([{ method: "git.localeDiff", params: { locale: "de" } }]);
    expect(view.get('[data-git-diff="de"]').textContent).toContain("Servus");
    await clickAsync(view.get('[data-git-toggle="de"]'));
    expect(view.query('[data-git-diff="de"]')).toBeNull();
  });

  it("explains a project outside git calmly, with no alert and no Retry", async () => {
    stubPage({
      "git.status": { ok: true, result: { available: false, reason: "not-a-repository" } },
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(changesSection(view).textContent).toContain("not in a git repository");
    expect(view.query('[role="alert"]')).toBeNull();
    expect(retryButtons(view)).toHaveLength(0);
  });

  it("puts a failed changes read into the page alert with the page's only Retry", async () => {
    stubPage({ "git.status": rpcError("GIT_BROKEN", "git blew up") });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.all('[role="alert"]')).toHaveLength(1);
    expect(retryButtons(view)).toHaveLength(1);
    expect(changesSection(view).querySelector("[data-retry]")).toBeNull();
    expect(changesSection(view).textContent).toContain(
      "Changes are unavailable. See the error above.",
    );
  });

  it("names the changed files as stale in the page alert when a re-read of another code fails", async () => {
    const status = inOrder([statusOf([DE_MODIFIED]), rpcError("INTERNAL", "boom")]);
    stubPage({
      "git.status": status,
      "lock.state": inOrder([NO_LOCK, rpcError("INTERNAL", "boom")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    const alert = view.get('[role="alert"]');
    expect(alert.textContent).toContain("changed files");
    expect(view.all('[role="alert"]')).toHaveLength(1);
    expect(changesSection(view).textContent).toContain("locales/de.json");
  });

  it("keeps a separate in-section stale notice, with no Retry, when its code differs from the page alert", async () => {
    stubPage({
      "git.status": inOrder([statusOf([DE_MODIFIED]), rpcError("RATE_LIMITED", "slow down")]),
      "lock.state": inOrder([NO_LOCK, rpcError("INTERNAL", "boom")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(view.all('[role="alert"]').length).toBeGreaterThanOrEqual(2);
    expect(retryButtons(view)).toHaveLength(1);
    expect(changesSection(view).querySelector("[data-retry]")).toBeNull();
  });

  it("re-reads the changes and the open diff on Retry and settles on an identical answer", async () => {
    stubPage({
      "lock.state": inOrder([rpcError("INTERNAL", "boom"), NO_LOCK]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    await clickAsync(view.get('[data-git-toggle="de"]'));
    const statusBefore = callsTo("git.status");
    const diffBefore = callsTo("git.localeDiff");

    await clickAsync(retryButtons(view)[0] as HTMLElement);
    await flush();

    expect(callsTo("git.status")).toBe(statusBefore + 1);
    expect(callsTo("git.localeDiff")).toBe(diffBefore + 1);
    expect(retryButtons(view)).toHaveLength(0);
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("keeps Retry busy until the changes read of that round has answered", async () => {
    const status = deferred();
    stubPage({
      "git.status": status.handler,
      "lock.state": rpcError("INTERNAL", "boom"),
    });
    const view = render(<OverviewPanel refreshToken={0} />);
    status.answer(0, statusOf([DE_MODIFIED]));
    await flush();
    await flush();

    click(retryButtons(view)[0] as HTMLElement);
    await flush();
    expect(retryButtons(view)[0]?.getAttribute("aria-busy")).toBe("true");

    status.answer(1, statusOf([DE_MODIFIED]));
    await flush();
    await flush();

    expect(retryButtons(view)[0]?.getAttribute("aria-busy")).toBeNull();
  });

  it("never moves focus or scroll when a background refresh brings a new answer", async () => {
    stubPage({
      "git.status": inOrder([
        statusOf([DE_MODIFIED]),
        statusOf([DE_MODIFIED, { path: "locales/fr.json", locales: ["fr"], state: "untracked" }]),
      ]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const toggle = view.get('[data-git-toggle="de"]');
    toggle.focus();
    const scrollBefore = window.scrollY;

    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(view.all("[data-git-file]")).toHaveLength(2);
    expect(view.get('[data-git-toggle="de"]')).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(window.scrollY).toBe(scrollBefore);
  });

  it("keeps the open row mounted with focus on its toggle after its file became clean", async () => {
    stubPage({
      "git.status": inOrder([statusOf([DE_MODIFIED]), statusOf([])]),
      "git.localeDiff": inOrder([diffOf(), diffOf({ state: "unchanged", changed: [] })]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    await clickAsync(view.get('[data-git-toggle="de"]'));
    const toggle = view.get('[data-git-toggle="de"]');
    toggle.focus();

    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(view.get('[data-git-toggle="de"]')).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(view.get('[data-git-file="locales/de.json"]').textContent).toContain(
      "Matches last commit",
    );
    expect(view.get('[data-git-diff="de"]').textContent).toContain("No key changes");
  });

  it("keeps the last known files, calmly, when the project stops being a repository", async () => {
    stubPage({
      "git.status": inOrder([
        statusOf([DE_MODIFIED]),
        { ok: true, result: { available: false, reason: "not-a-repository" } },
      ]),
      "git.localeDiff": inOrder([
        diffOf(),
        { ok: true, result: { available: false, reason: "not-a-repository" } },
      ]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    await clickAsync(view.get('[data-git-toggle="de"]'));
    const toggle = view.get('[data-git-toggle="de"]');
    toggle.focus();

    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(view.get('[data-git-toggle="de"]')).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(changesSection(view).textContent).toContain("Showing the last known changes.");
    expect(view.get('[data-git-diff="de"]').textContent).toContain("not in a git repository");
  });

  it("lets a slow status answer never overwrite a newer one", async () => {
    const status = deferred();
    stubPage({ "git.status": status.handler });
    const view = render(<OverviewPanel refreshToken={0} />);
    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    status.answer(1, statusOf([{ path: "locales/newer.json", locales: [], state: "added" }]));
    await flush();
    status.answer(0, statusOf([{ path: "locales/older.json", locales: [], state: "added" }]));
    await flush();

    const paths = view.all("[data-git-path]").map((node) => node.textContent);
    expect(paths).toEqual(["locales/newer.json"]);
  });

  it("lets a slow diff answer never overwrite a newer one", async () => {
    const diff = deferred();
    stubPage({ "git.localeDiff": diff.handler });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    await clickAsync(view.get('[data-git-toggle="de"]'));
    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    diff.answer(1, diffOf({ changed: [{ key: "newer", before: "a", after: "b" }] }));
    await flush();
    diff.answer(0, diffOf({ changed: [{ key: "older", before: "a", after: "b" }] }));
    await flush();

    expect(view.all("[data-git-key]").map((node) => node.textContent)).toEqual(["newer"]);
  });

  it("puts a failed key diff of the same code into the one page alert", async () => {
    stubPage({
      "git.status": rpcError("GIT_BROKEN", "git blew up"),
      "git.localeDiff": rpcError("GIT_BROKEN", "git blew up"),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.all('[role="alert"]')).toHaveLength(1);
  });

  it("closes the diff and reads nothing more when the toggle is pressed twice", async () => {
    stubPage();
    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    await clickAsync(view.get('[data-git-toggle="de"]'));
    await clickAsync(view.get('[data-git-toggle="de"]'));
    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(callsTo("git.localeDiff")).toBe(1);
  });
});
