// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunHistorySection } from "./RunHistorySection.js";
import { render } from "./test-support.js";

function sdkSource(path: string): string {
  return readFileSync(join(import.meta.dirname, "..", "..", "..", "sdk", "src", path), "utf8");
}

describe("the size limit the too-large notice names", () => {
  it("is the limit the sdk reads the run history file under", () => {
    const declared = /export const MAX_RUN_HISTORY_FILE_BYTES = (\d+) \* 1024 \* 1024;/.exec(
      sdkSource("run-history/run-history-file.ts"),
    );
    const view = render(
      <RunHistorySection
        view={{
          kind: "data",
          stale: false,
          data: { records: [], total: 0, unreadableRecords: 0, unavailable: "too-large" },
        }}
        hideCode={undefined}
      />,
    );

    expect(declared?.[1]).toBeDefined();
    expect(view.text()).toContain(`over ${declared?.[1]} MiB`);
  });
});
