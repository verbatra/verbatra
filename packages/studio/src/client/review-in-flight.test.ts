import { describe, expect, it } from "vitest";
import {
  BUSY_ANNOUNCE_STEP_SECONDS,
  compactElapsed,
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
    expect(rowBusyStatus("retranslate", 0)).toBe("Retranslating…");
    expect(rowBusyStatus("retranslate", 14)).toBe("Retranslating…");
    expect(rowBusyStatus("retranslate", 15)).toBe("Retranslating… 15 seconds so far");
    expect(rowBusyStatus("retranslate", 29)).toBe("Retranslating… 15 seconds so far");
    expect(rowBusyStatus("retranslate", 30)).toBe("Retranslating… 30 seconds so far");
  });

  it("announces in steps of fifteen seconds, so a live region changes only at those steps", () => {
    const distinct = new Set(
      Array.from({ length: 61 }, (_unused, seconds) => rowBusyStatus("retranslate", seconds)),
    );

    expect(BUSY_ANNOUNCE_STEP_SECONDS).toBe(15);
    expect(distinct.size).toBe(5);
  });

  it("formats the visible elapsed time compactly, switching to minutes at one minute", () => {
    expect(compactElapsed(0)).toBe("0s");
    expect(compactElapsed(59)).toBe("59s");
    expect(compactElapsed(60)).toBe("1:00");
    expect(compactElapsed(125)).toBe("2:05");
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
