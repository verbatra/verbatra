import { INTEGRITY_GATE_REASONS } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { settledActionStatusLabel } from "./settled-action-status.js";

describe("settledActionStatusLabel", () => {
  it("uses the caller-provided label on success", () => {
    expect(settledActionStatusLabel({ kind: "success" }, "Saved")).toBe("Saved");
    expect(settledActionStatusLabel({ kind: "success" }, "Retranslated")).toBe("Retranslated");
  });

  it("reports the placeholder rejection reason", () => {
    expect(settledActionStatusLabel({ kind: "rejected", reason: "placeholder" }, "Saved")).toBe(
      "Rejected: placeholder mismatch",
    );
  });

  it("reports the icu rejection reason distinctly from placeholder", () => {
    expect(settledActionStatusLabel({ kind: "rejected", reason: "icu" }, "Saved")).toBe(
      "Rejected: invalid message syntax",
    );
  });

  it("reports the degenerate rejection reason", () => {
    expect(settledActionStatusLabel({ kind: "rejected", reason: "degenerate" }, "Saved")).toBe(
      "Rejected: degenerate translation",
    );
  });

  it("reports the empty rejection reason", () => {
    expect(settledActionStatusLabel({ kind: "rejected", reason: "empty" }, "Saved")).toBe(
      "Rejected: empty translation",
    );
  });

  it("keeps the empty label context-free for the retranslate caller, naming neither the [[CLEAR]] sentinel nor the export remediation", () => {
    const label = settledActionStatusLabel({ kind: "rejected", reason: "empty" }, "Retranslated");
    expect(label).not.toContain("[[CLEAR]]");
    expect(label).not.toContain("export");
  });

  it("prefixes an error outcome's message", () => {
    expect(
      settledActionStatusLabel({ kind: "error", message: "The key was not found." }, "Saved"),
    ).toBe("Failed: The key was not found.");
  });
});

describe("settledActionStatusLabel: the rejection labels stay in step with the gate", () => {
  it("reports the markup rejection reason distinctly from placeholder", () => {
    expect(settledActionStatusLabel({ kind: "rejected", reason: "markup" }, "Saved")).toBe(
      "Rejected: inline markup mismatch",
    );
  });

  it.each(INTEGRITY_GATE_REASONS)("labels the %s reason with its own wording", (reason) => {
    const labels = INTEGRITY_GATE_REASONS.map((code) =>
      settledActionStatusLabel({ kind: "rejected", reason: code }, "Saved"),
    );
    const label = settledActionStatusLabel({ kind: "rejected", reason }, "Saved");
    expect(label.startsWith("Rejected: ")).toBe(true);
    expect(labels.filter((candidate) => candidate === label)).toHaveLength(1);
  });
});
