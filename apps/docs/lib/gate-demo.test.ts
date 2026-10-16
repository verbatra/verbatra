import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GATE_MISSING_PLACEHOLDER, GATE_REASON, GATE_REFUSAL } from "@/lib/gate-demo";

function repoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8");
}

const INTEGRITY_GATE = "packages/sdk/src/flow/integrity-gate.ts";

function gateReasons(): ReadonlyArray<string> {
  const source = repoFile(INTEGRITY_GATE);
  const block = /export const INTEGRITY_GATE_REASONS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) throw new Error("INTEGRITY_GATE_REASONS not found in the sdk source");
  return [...(block[1] as string).matchAll(/"([a-z]+)"/g)].map((match) => match[1] as string);
}

describe("the gate demo quotes the sdk", () => {
  it("uses a refusal reason the integrity gate can actually return", () => {
    expect(gateReasons()).toContain(GATE_REASON);
    expect(GATE_REFUSAL.reason).toBe(GATE_REASON);
  });

  it("still matches the reason the gate returns for a broken placeholder", () => {
    expect(repoFile(INTEGRITY_GATE)).toContain(`{ accepted: false, reason: "${GATE_REASON}" }`);
  });

  it("names the placeholder that broke in the refusal it prints", () => {
    expect(GATE_REFUSAL.missing).toBe(GATE_MISSING_PLACEHOLDER);
  });
});
