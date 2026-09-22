import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GATE_CLI_LINE,
  GATE_MISSING_PLACEHOLDER,
  GATE_REASON,
  GATE_REFUSAL,
  GATE_TARGET_LINES,
  GATE_WITHHELD_LABEL,
} from "@/lib/gate-demo";

function repoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8");
}

const INTEGRITY_GATE = "packages/sdk/src/flow/integrity-gate.ts";
const CLI_RENDER = "packages/cli/src/render.ts";

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

  it("prints the count label the cli renders for a withheld key", () => {
    const render = repoFile(CLI_RENDER);
    for (const label of [GATE_WITHHELD_LABEL, "translated", "unchanged"]) {
      expect(render).toContain(`"${label}"`);
    }
    expect(GATE_CLI_LINE).toContain(GATE_WITHHELD_LABEL);
  });

  it("shows the placeholder that broke and the previous value it kept", () => {
    expect(GATE_REFUSAL.missing).toBe(GATE_MISSING_PLACEHOLDER);
    expect(GATE_REFUSAL.candidate).not.toContain(GATE_MISSING_PLACEHOLDER);
    expect(GATE_REFUSAL.kept).toContain(GATE_MISSING_PLACEHOLDER);
    const kept = GATE_TARGET_LINES.find((line) => line.annotation === "kept");
    expect(kept?.text).toContain(GATE_MISSING_PLACEHOLDER);
    expect(GATE_TARGET_LINES.some((line) => line.annotation === "new")).toBe(true);
  });
});
