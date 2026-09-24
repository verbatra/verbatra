import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  hasRunningRetranslation,
  mergeServerInFlight,
  type PendingRow,
  rowBusyLabel,
  rowBusyStatus,
} from "./review-in-flight.js";

const idOf = (entry: { readonly locale: string; readonly key: string }): string =>
  `${entry.locale}/${entry.key}`;

describe("mergeServerInFlight", () => {
  it("adopts a retranslation the server still runs, dating it from the reported elapsed time", () => {
    const merge = mergeServerInFlight(
      new Map(),
      [{ locale: "de", key: "a", elapsedMs: 4_000 }],
      10_000,
      idOf,
    );

    expect([...merge.next]).toEqual([
      ["de/a", { action: "retranslate", startedAt: 6_000, tracked: "server" }],
    ]);
    expect(merge.finished).toEqual([]);
    expect(merge.serverTracked).toBe(1);
  });

  it("keeps a row this tab started and reports a server-tracked row that finished", () => {
    const current = new Map<string, PendingRow>([
      ["de/a", { action: "approve", startedAt: 1, tracked: "local" }],
      ["de/b", { action: "retranslate", startedAt: 2, tracked: "server" }],
    ]);

    const merge = mergeServerInFlight(
      current,
      [{ locale: "de", key: "a", elapsedMs: 5 }],
      100,
      idOf,
    );

    expect(merge.next.get("de/a")).toEqual({ action: "approve", startedAt: 1, tracked: "local" });
    expect(merge.next.has("de/b")).toBe(false);
    expect(merge.finished).toEqual(["de/b"]);
    expect(merge.serverTracked).toBe(0);
  });
});

describe("row busy copy", () => {
  it("counts whole seconds and never goes negative", () => {
    expect(elapsedSeconds(1_000, 3_999)).toBe(2);
    expect(elapsedSeconds(5_000, 1_000)).toBe(0);
  });

  it("names the running action and, for a timed one, how long it has run", () => {
    expect(rowBusyLabel("approve")).toBe("Approving…");
    expect(rowBusyStatus("reject", undefined)).toBe("Rejecting…");
    expect(rowBusyStatus("retranslate", 1)).toBe("Retranslating… 1 second so far");
    expect(rowBusyStatus("retranslate", 12)).toBe("Retranslating… 12 seconds so far");
  });

  it("tells whether any retranslation is running", () => {
    expect(hasRunningRetranslation(new Map())).toBe(false);
    expect(
      hasRunningRetranslation(
        new Map([["x", { action: "retranslate", startedAt: 0, tracked: "local" } as const]]),
      ),
    ).toBe(true);
  });
});
