import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { makeFakeFs } from "../../test-support.js";
import type { LocaleSummary } from "../summary.js";
import {
  recordableApprovals,
  withApprovalNotice,
  withHandoffApprovals,
} from "./handoff-approvals.js";

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "common", value, placeholders: [], isPlural: false };
}

function resource(locale: string, values: Record<string, string>): LocaleResource {
  return {
    locale,
    namespace: "common",
    format: "i18next-json",
    entries: new Map(Object.entries(values).map(([key, value]) => [key, entry(key, value)])),
  };
}

const SOURCE = resource("en", { greeting: "Hello", farewell: "Bye", title: "Title" });

const EMPTY_SUMMARY = { notices: [] } as unknown as LocaleSummary;

function noticeMessages(approved: ReadonlySet<string>, dryRun: boolean): readonly string[] {
  return withApprovalNotice(EMPTY_SUMMARY, approved, dryRun).notices.map(
    (notice) => notice.message,
  );
}

describe("withApprovalNotice", () => {
  it.each([
    [["greeting"], false, "1 key the handoff marks reviewed or final was recorded as approved."],
    [
      ["greeting", "farewell"],
      false,
      "2 keys the handoff marks reviewed or final were recorded as approved.",
    ],
    [
      ["greeting"],
      true,
      "1 key the handoff marks reviewed or final would be recorded as approved.",
    ],
    [
      ["greeting", "farewell"],
      true,
      "2 keys the handoff marks reviewed or final would be recorded as approved.",
    ],
  ])("words %j (dry run %s) as %s", (keys, dryRun, message) => {
    expect(noticeMessages(new Set(keys), dryRun)).toEqual([message]);
  });

  it("adds no notice when nothing is approved", () => {
    expect(noticeMessages(new Set(), false)).toEqual([]);
  });
});

describe("recordableApprovals", () => {
  it("keeps only approved keys the target holds and the source still has", () => {
    const written = resource("de", { greeting: "Hallo", stray: "Weg" });
    const approved = new Set(["greeting", "farewell", "stray"]);

    expect([...recordableApprovals(approved, written.entries, SOURCE)]).toEqual(["greeting"]);
  });

  it("counts in the notice only the keys that get a record", async () => {
    const written = resource("de", { greeting: "Hallo" });
    const approved = recordableApprovals(
      new Set(["greeting", "farewell"]),
      written.entries,
      SOURCE,
    );

    const patch = await withHandoffApprovals(
      { records: new Map() },
      {
        cwd: "/proj",
        fs: makeFakeFs(),
        locale: "de",
        approved,
        written,
        source: SOURCE,
        reviewer: undefined,
      },
    );

    expect([...patch.records.keys()]).toEqual(["greeting"]);
    expect(noticeMessages(approved, false)).toEqual([
      "1 key the handoff marks reviewed or final was recorded as approved.",
    ]);
  });
});
