import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createValueMarker } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { makeContext, makeTempDir } from "../test-support.js";
import { usageHistoryTool } from "./usage-history.js";

const RECORD = {
  version: 1,
  at: "2026-11-09T10:00:00.000Z",
  trigger: "translate",
  provider: "anthropic",
  model: "m",
  usage: { inputTokens: 10, outputTokens: 5 },
  cost: {
    pricing: "priced",
    basis: "usage",
    rateKey: "anthropic/m",
    currency: "USD",
    asOf: "2026-11-01",
    amount: 0.5,
  },
  locales: [{ locale: "de", status: "succeeded", translated: 2 }],
};

async function projectWith(lines: readonly string[]): Promise<string> {
  const dir = await makeTempDir();
  const path = `${dir}/.verbatra-local/run-history.jsonl`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join("\n")}\n`);
  return dir;
}

function line(entries: number): string {
  return JSON.stringify({ ...RECORD, entries });
}

describe("usage.history", () => {
  it("reports an empty history for a project with none", async () => {
    const outcome = await usageHistoryTool.execute({}, makeContext({ cwd: await makeTempDir() }));

    expect(outcome).toEqual({
      kind: "ok",
      result: { records: [], total: 0, unreadableRecords: 0 },
    });
  });

  it.each([
    ["plain", undefined],
    ["under --redact-values", createValueMarker()],
  ])("returns newest first, with the cost and counts intact, %s", async (_label, marker) => {
    const dir = await projectWith([line(1), line(2), "{ broken"]);

    const outcome = await usageHistoryTool.execute(
      {},
      makeContext({ cwd: dir, ...(marker !== undefined ? { valueMarker: marker } : {}) }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        total: 2,
        unreadableRecords: 1,
        records: [
          { entries: 2, cost: { pricing: "priced", amount: 0.5, basis: "usage" } },
          { entries: 1 },
        ],
      },
    });
  });

  it.each([
    ["plain", undefined],
    ["under --redact-values", createValueMarker()],
  ])("returns the lower-bound caveat of a partial usage figure, %s", async (_label, marker) => {
    const partial = JSON.stringify({
      ...RECORD,
      cost: { ...RECORD.cost, caveats: ["USAGE_PARTIAL"] },
    });
    const dir = await projectWith([partial]);

    const outcome = await usageHistoryTool.execute(
      {},
      makeContext({ cwd: dir, ...(marker !== undefined ? { valueMarker: marker } : {}) }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { records: [{ cost: { pricing: "priced", caveats: ["USAGE_PARTIAL"] } }] },
    });
  });

  it("returns the unknown and not-billed cost states as they were stored", async () => {
    const unknown = JSON.stringify({
      ...RECORD,
      cost: { pricing: "no-usage", basis: "usage", rateKey: "anthropic/m" },
    });
    const notBilled = JSON.stringify({
      ...RECORD,
      cost: { pricing: "not-billed", rateKey: "libretranslate" },
    });
    const dir = await projectWith([unknown, notBilled]);

    const outcome = await usageHistoryTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        records: [
          { cost: { pricing: "not-billed", rateKey: "libretranslate" } },
          { cost: { pricing: "no-usage", basis: "usage" } },
        ],
      },
    });
  });

  it("clamps a limit above the maximum and one below one", async () => {
    const dir = await projectWith(Array.from({ length: 5 }, (_, index) => line(index)));

    const big = await usageHistoryTool.execute({ limit: 100_000 }, makeContext({ cwd: dir }));
    const small = await usageHistoryTool.execute({ limit: -3 }, makeContext({ cwd: dir }));

    expect(big).toMatchObject({ kind: "ok", result: { records: expect.any(Array) } });
    expect(big.kind === "ok" ? (big.result as { records: unknown[] }).records : []).toHaveLength(5);
    expect(
      small.kind === "ok" ? (small.result as { records: unknown[] }).records : [],
    ).toHaveLength(1);
  });

  it("rejects a parameter it does not declare", async () => {
    const outcome = await usageHistoryTool.execute({ offset: 3 }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("tells a reader to say estimated, to say no rate, and that empty is not proof", () => {
    expect(usageHistoryTool.description).toContain("say estimated");
    expect(usageHistoryTool.description).toContain("USAGE_PARTIAL");
    expect(usageHistoryTool.description).toContain("no-usage");
    expect(usageHistoryTool.description).toContain("never as free");
    expect(usageHistoryTool.description).toContain("how many entries were attempted");
    expect(usageHistoryTool.description).toContain("failed and refused runs included");
    expect(usageHistoryTool.description).toContain("not proof that no run happened");
    expect(usageHistoryTool.description).toContain("Read-only");
  });
});
